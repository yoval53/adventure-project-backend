export function isValidEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return false;
  }
  const [local, domain] = email.split("@");
  if (local.startsWith(".") || local.endsWith(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }
  return !local.includes("..") && !domain.includes("..");
}

import { parseNumberEnv } from "./env";

export const PASSWORD_MIN_LENGTH = parseNumberEnv("PASSWORD_MIN_LENGTH", 8);

export function isStrongPassword(password: string) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
