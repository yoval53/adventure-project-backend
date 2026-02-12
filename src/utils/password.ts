import crypto from "crypto";

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

export async function createPasswordHash(password: string) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH);
  return { salt, hash: hash.toString("hex") };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const hash = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (expectedBuffer.length !== hash.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, hash);
}
