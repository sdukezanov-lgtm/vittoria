/**
 * Normalize a Russian phone number to canonical E.164 `+7XXXXXXXXXX`.
 * Returns null when the input cannot be safely normalized (foreign, malformed, empty).
 *
 * Rules:
 *  - If the input had a leading `+`, it is only valid as `+7` followed by 10 digits;
 *    anything else (e.g. +992…, or +7 with the wrong digit count) → null.
 *  - Without a `+`: `8`+10 digits, `7`+10 digits, or exactly 10 digits → `+7XXXXXXXXXX`.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hadPlus = raw.trim().startsWith('+');
  const d = raw.replace(/\D/g, '');

  if (hadPlus) {
    return /^7\d{10}$/.test(d) ? `+${d}` : null;
  }
  if (/^8\d{10}$/.test(d)) return `+7${d.slice(1)}`;
  if (/^7\d{10}$/.test(d)) return `+${d}`;
  if (/^\d{10}$/.test(d)) return `+7${d}`;
  return null;
}
