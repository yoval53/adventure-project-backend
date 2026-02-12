import crypto from "crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { checkMongoHealth, getMongoClient } from "./db";

export const app = express();

app.set("trust proxy", true);
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

const PASSWORD_SALT_BYTES = 32;
const PASSWORD_KEY_LENGTH = 64;

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
  let lastCleanup = 0;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip;
    if (!key) {
      res.status(400).json({ ok: false, error: "Unable to determine client IP" });
      return;
    }
    const now = Date.now();
    const current = hits.get(key);

    if (!current || now >= current.resetAt) {
      if (now - lastCleanup >= windowMs) {
        for (const [entryKey, entry] of hits.entries()) {
          if (now >= entry.resetAt) {
            hits.delete(entryKey);
          }
        }
        lastCleanup = now;
      }
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

function resolveJwtExpiresIn(): SignOptions["expiresIn"] {
  const raw = process.env.JWT_EXPIRES_IN;
  if (!raw) {
    return "1h";
  }
  const normalized = raw.toLowerCase();
  const isValid = /^\d+$/.test(normalized) || /^\d+(ms|s|m|h|d|w|y)$/.test(normalized);
  return (isValid ? raw : "1h") as SignOptions["expiresIn"];
}

function createToken(payload: AuthPayload): string {
  const expiresIn = resolveJwtExpiresIn();
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return false;
  }
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return false;
  }
  if (local.startsWith(".") || local.endsWith(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }
  return !local.includes("..") && !domain.includes("..");
}

function isStrongPassword(password: string) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function parseNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const PASSWORD_MIN_LENGTH = parseNumberEnv("PASSWORD_MIN_LENGTH", 8);

const authRateLimiter = createRateLimiter(
  parseNumberEnv("AUTH_RATE_LIMIT_WINDOW_MS", 60_000),
  parseNumberEnv("AUTH_RATE_LIMIT_MAX", 20),
);

async function createPasswordHash(password: string) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH);
  return { salt, hash: hash.toString("hex") };
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const hash = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH);
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
          error: `Valid email and strong password (min ${PASSWORD_MIN_LENGTH} chars, upper/lower/number/symbol) are required`,
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
