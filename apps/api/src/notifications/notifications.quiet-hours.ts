const MSK_OFFSET_HOURS = 3;
const QUIET_START_HOUR = 22; // inclusive
const QUIET_END_HOUR = 9;    // exclusive

function mskHour(date: Date): number {
  return (date.getUTCHours() + MSK_OFFSET_HOURS) % 24;
}

export function isQuietHour(date: Date): boolean {
  const h = mskHour(date);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

export function deferUntilMorning(now: Date): number {
  // Compute next 09:00 MSK in UTC ms terms, return diff from `now`.
  const utcMs = now.getTime();
  // 09:00 MSK = 06:00 UTC.
  const targetHourUtc = 6;
  const next = new Date(now);
  next.setUTCHours(targetHourUtc, 0, 0, 0);
  if (next.getTime() <= utcMs) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - utcMs;
}
