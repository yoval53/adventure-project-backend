import crypto from "crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { checkMongoHealth, getMongoClient } from "./db";

export const app = express();

app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    service: "api",
    endpoints: ["/healthz", "/db/healthz", "/auth/register", "/auth/login", "/auth/me"],
  });
});

app.get("/favicon.ico", (_req: Request, res: Response) => {
  res.status(204).end();
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "api", uptime: process.uptime() });
});

app.get("/db/healthz", async (_req: Request, res: Response) => {
  try {
    await checkMongoHealth();
    res.status(200).json({ ok: true, db: "mongodb" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(503).json({ ok: false, db: "mongodb", error: message });
  }
});

type AuthPayload = {
  sub: string;
  email: string;
};

type AuthenticatedRequest = Request & {
  user?: AuthPayload;
};

type UserRecord = {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: Date;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const scryptAsync = (password: string, salt: string, keylen: number) =>
  new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });

async function getUsersCollection() {
  const client = await getMongoClient();
  const dbName = process.env.MONGODB_DB ?? "adventure";
  return client.db(dbName).collection<UserRecord>("users");
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

function createRateLimiter(windowMs: number, maxRequests: number) {
  const hits = new Map<string, RateLimitEntry>();

  return (req: Request, res: Response, next: NextFunction) => {
    const forwardedFor = req.headers["x-forwarded-for"];
    const key =
      (typeof forwardedFor === "string" ? forwardedFor.split(",")[0]?.trim() : undefined) ??
      req.ip ??
      "unknown";
    const now = Date.now();
    const current = hits.get(key);

    if (!current || now >= current.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > maxRequests) {
      res.status(429).json({ ok: false, error: "Too many requests, try again later" });
      return;
    }

    hits.set(key, current);
    next();
  };
}

function createToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "1h" });
}

function parseAuthPayload(decoded: string | JwtPayload): AuthPayload {
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }
  const subject = decoded.sub;
  const email = decoded.email;
  if (typeof subject !== "string" || typeof email !== "string") {
    throw new Error("Invalid token payload");
  }
  return { sub: subject, email };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "Missing bearer token" });
    return;
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = parseAuthPayload(decoded);
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid token";
    res.status(401).json({ ok: false, error: message });
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

const authRateLimiter = createRateLimiter(60_000, 20);

async function createPasswordHash(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return { salt, hash: hash.toString("hex") };
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const hash = await scryptAsync(password, salt, 64);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (expectedBuffer.length !== hash.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, hash);
}

app.post("/auth/register", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ ok: false, error: "Email and password are required" });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail) || !isStrongPassword(password)) {
      res
        .status(400)
        .json({
          ok: false,
          error: "Valid email and strong password (min 8 chars, letters + numbers) are required",
        });
      return;
    }

    const users = await getUsersCollection();
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) {
      res.status(409).json({ ok: false, error: "Email is already registered" });
      return;
    }

    const { salt, hash } = await createPasswordHash(password);
    const result = await users.insertOne({
      email: normalizedEmail,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date(),
    });
    const token = createToken({ sub: result.insertedId.toHexString(), email: normalizedEmail });
    res.status(201).json({
      ok: true,
      token,
      user: { id: result.insertedId.toHexString(), email: normalizedEmail },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    res.status(500).json({ ok: false, error: message });
  }
});

app.post("/auth/login", authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ ok: false, error: "Email and password are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      res.status(400).json({ ok: false, error: "Valid email is required" });
      return;
    }
    const users = await getUsersCollection();
    const user = await users.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(401).json({ ok: false, error: "Invalid credentials" });
      return;
    }

    const passwordMatches = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ ok: false, error: "Invalid credentials" });
      return;
    }

    const userId = user._id?.toHexString();
    if (!userId) {
      res.status(500).json({ ok: false, error: "User record is missing an id" });
      return;
    }

    const token = createToken({ sub: userId, email: user.email });
    res.status(200).json({
      ok: true,
      token,
      user: { id: userId, email: user.email },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    res.status(500).json({ ok: false, error: message });
  }
});

app.get(
  "/auth/me",
  authRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const users = await getUsersCollection();
    const user = await users.findOne(
      { _id: new ObjectId(req.user.sub) },
      { projection: { passwordHash: 0, passwordSalt: 0 } },
    );
    if (!user) {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }

    const userId = user._id?.toHexString();
    if (!userId) {
      res.status(500).json({ ok: false, error: "User record is missing an id" });
      return;
    }

    res.status(200).json({ ok: true, user: { id: userId, email: user.email } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load user";
    res.status(500).json({ ok: false, error: message });
  }
  },
);
