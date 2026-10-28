// Shared rules for new passwords and email addresses (client and server).
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;

export function passwordProblem(next: string, repeat: string): string | null {
  if (next.length < MIN_PASSWORD) return `Password minimal ${MIN_PASSWORD} karakter.`;
  if (next.length > MAX_PASSWORD) return `Password maksimal ${MAX_PASSWORD} karakter.`;
  if (next !== repeat) return "Ulangan password tidak sama.";
  return null;
}

export function normalizeEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}
