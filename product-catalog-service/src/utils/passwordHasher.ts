import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * scrypt password hashing via `node:crypto` (no native dependency). Stored as
 * `scrypt$N$r$p$<salt b64>$<hash b64>` so the cost parameters travel with the
 * hash and can be raised later without invalidating existing passwords.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function encode(salt: Buffer, key: Buffer): string {
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Async so a login never blocks the event loop for the ~50ms a hash takes. */
export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P }, (err, key) =>
      err ? reject(err) : resolve(encode(salt, key))
    );
  });
}

/** Sync variant, used only for one-off boot-time seeding. */
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  return encode(salt, scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P }));
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return Promise.resolve(false);

  const expected = Buffer.from(hashB64, "base64");
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(saltB64, "base64"),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p) },
      (err, key) => (err ? reject(err) : resolve(timingSafeEqual(key, expected)))
    );
  });
}
