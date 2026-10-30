import { createHash, timingSafeEqual } from "node:crypto";

/**
 * True when the request carries Vercel's cron header, `Authorization: Bearer <CRON_SECRET>`.
 * Without a configured secret every request is refused.
 */
export function isCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
