import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Format: scrypt:<N>:<r>:<p>:<salt b64url>:<hash b64url>  (no "$", so .env files don't mangle it)
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const maxmem = (N: number, r: number) => 128 * N * r * 2;

export async function hashPassword(password: string): Promise<string> {
  const N = 2 ** 15, r = 8, p = 1;
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N, r, p, maxmem: maxmem(N, r) });
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nS, rS, pS, saltS, hashS] = parts;
  const N = Number(nS), r = Number(rS), p = Number(pS);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(hashS, "base64url");
  if (expected.length !== KEYLEN) return false;
  const key = await scrypt(password, Buffer.from(saltS, "base64url"), { N, r, p, maxmem: maxmem(N, r) });
  return timingSafeEqual(key, expected);
}
