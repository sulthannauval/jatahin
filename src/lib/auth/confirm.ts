import "server-only";
import { getDb } from "../db";
import { LOCK_MINUTES, isLockedOut, recordFailure } from "./account";
import { clientIp } from "./dal";
import { verifyPassword } from "./password";

/** Checks the current password before a sensitive change, counting wrong guesses toward the sign-in lockout. */
export async function confirmPassword(hash: string, password: string): Promise<string | null> {
  const db = await getDb();
  const ip = await clientIp();
  if (await isLockedOut(db, ip)) return `Terlalu banyak percobaan gagal. Coba lagi ${LOCK_MINUTES} menit lagi.`;
  if (await verifyPassword(password, hash)) return null;
  await recordFailure(db, ip);
  return "Password saat ini salah.";
}
