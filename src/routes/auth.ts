import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { getMongoClient } from "../db";
import { authRateLimiter, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { createToken } from "../utils/jwt";
import { createPasswordHash, verifyPassword } from "../utils/password";
import { isValidEmail, isStrongPassword, PASSWORD_MIN_LENGTH } from "../utils/validation";

type UserRecord = {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: Date;
};

async function getUsersCollection() {
  const client = await getMongoClient();
  const dbName = process.env.MONGODB_DB ?? "adventure";
  return client.db(dbName).collection<UserRecord>("users");
}

const router = Router();

router.post("/auth/register", authRateLimiter, async (req: Request, res: Response) => {
  console.log("[POST /auth/register] Registration attempt");
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      console.log("[POST /auth/register] Missing email or password");
      res.status(400).json({ ok: false, error: "Email and password are required" });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      console.log("[POST /auth/register] Invalid email format");
      res.status(400).json({ ok: false, error: "Valid email is required" });
      return;
    }
    if (!isStrongPassword(password)) {
      console.log("[POST /auth/register] Weak password rejected");
      res.status(400).json({
        ok: false,
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} chars and include upper/lower/number/symbol`,
      });
      return;
    }

    const users = await getUsersCollection();
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) {
      console.log("[POST /auth/register] Duplicate email rejected");
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
    console.log("[POST /auth/register] User registered successfully");
    res.status(201).json({
      ok: true,
      token,
      user: { id: result.insertedId.toHexString(), email: normalizedEmail },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    console.error("[POST /auth/register] Error:", message);
    res.status(500).json({ ok: false, error: message });
  }
});

router.post("/auth/login", authRateLimiter, async (req: Request, res: Response) => {
  console.log("[POST /auth/login] Login attempt");
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      console.log("[POST /auth/login] Missing email or password");
      res.status(400).json({ ok: false, error: "Email and password are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      console.log("[POST /auth/login] Invalid email format");
      res.status(400).json({ ok: false, error: "Valid email is required" });
      return;
    }
    const users = await getUsersCollection();
    const user = await users.findOne({ email: normalizedEmail });
    if (!user) {
      console.log("[POST /auth/login] User not found");
      res.status(401).json({ ok: false, error: "Invalid credentials" });
      return;
    }

    const passwordMatches = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!passwordMatches) {
      console.log("[POST /auth/login] Invalid password");
      res.status(401).json({ ok: false, error: "Invalid credentials" });
      return;
    }

    const userId = user._id?.toHexString();
    if (!userId) {
      console.error("[POST /auth/login] User record missing id");
      res.status(500).json({ ok: false, error: "User record is missing an id" });
      return;
    }

    const token = createToken({ sub: userId, email: user.email });
    console.log("[POST /auth/login] Login successful");
    res.status(200).json({
      ok: true,
      token,
      user: { id: userId, email: user.email },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    console.error("[POST /auth/login] Error:", message);
    res.status(500).json({ ok: false, error: message });
  }
});

router.get(
  "/auth/me",
  authRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  console.log("[GET /auth/me] User profile requested");
  try {
    if (!req.user) {
      console.log("[GET /auth/me] Unauthorized - no user in request");
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const users = await getUsersCollection();
    const user = await users.findOne(
      { _id: new ObjectId(req.user.sub) },
      { projection: { passwordHash: 0, passwordSalt: 0 } },
    );
    if (!user) {
      console.log("[GET /auth/me] User not found in database");
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }

    const userId = user._id?.toHexString();
    if (!userId) {
      console.error("[GET /auth/me] User record missing id");
      res.status(500).json({ ok: false, error: "User record is missing an id" });
      return;
    }

    console.log("[GET /auth/me] User profile retrieved successfully");
    res.status(200).json({ ok: true, user: { id: userId, email: user.email } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load user";
    console.error("[GET /auth/me] Error:", message);
    res.status(500).json({ ok: false, error: message });
  }
  },
);

export default router;
