import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { parseNumberEnv } from "../utils/env";
import { type AuthPayload, getJwtSecret, parseAuthPayload } from "../utils/jwt";

export type AuthenticatedRequest = Request & {
  user?: AuthPayload;
};

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

export const authRateLimiter = rateLimit({
  windowMs: parseNumberEnv("AUTH_RATE_LIMIT_WINDOW_MS", 60_000),
  limit: parseNumberEnv("AUTH_RATE_LIMIT_MAX", 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  handler: (_req, res) => {
    res.status(429).json({ ok: false, error: "Too many requests, try again later" });
  },
});
