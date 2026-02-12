import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

export type AuthPayload = {
  sub: string;
  email: string;
};

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
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

export function createToken(payload: AuthPayload): string {
  const expiresIn = resolveJwtExpiresIn();
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function parseAuthPayload(decoded: string | JwtPayload): AuthPayload {
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
