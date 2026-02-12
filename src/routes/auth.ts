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
    if (!isStrongPassword(password)) {
      res.status(400).json({
        ok: false,
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} chars and include upper/lower/number/symbol`,
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

router.post("/auth/login", authRateLimiter, async (req: Request, res: Response) => {
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

router.get(
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

export default router;
