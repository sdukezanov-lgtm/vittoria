import { isQuietHour, deferUntilMorning } from '../notifications.quiet-hours';

describe('isQuietHour', () => {
  it('returns true at 23:30 Moscow time', () => {
    const date = new Date('2026-05-27T20:30:00Z'); // 23:30 MSK (UTC+3)
    expect(isQuietHour(date)).toBe(true);
  });

  it('returns true at 03:00 Moscow time', () => {
    const date = new Date('2026-05-28T00:00:00Z'); // 03:00 MSK
    expect(isQuietHour(date)).toBe(true);
  });

  it('returns false at 12:00 Moscow time', () => {
    const date = new Date('2026-05-27T09:00:00Z'); // 12:00 MSK
    expect(isQuietHour(date)).toBe(false);
  });

  it('returns false exactly at 09:00 Moscow time', () => {
    const date = new Date('2026-05-27T06:00:00Z'); // 09:00 MSK
    expect(isQuietHour(date)).toBe(false);
  });

  it('returns true exactly at 22:00 Moscow time', () => {
    const date = new Date('2026-05-27T19:00:00Z'); // 22:00 MSK
    expect(isQuietHour(date)).toBe(true);
  });
});

describe('deferUntilMorning', () => {
  it('returns delay in ms until 09:00 MSK same day if current is before 09:00', () => {
    const now = new Date('2026-05-27T02:00:00Z'); // 05:00 MSK
    const delay = deferUntilMorning(now);
    // 05:00 → 09:00 = 4 hours
    expect(delay).toBe(4 * 3600 * 1000);
  });

  it('returns delay in ms until next-day 09:00 MSK if current is 22:00+', () => {
    const now = new Date('2026-05-27T20:00:00Z'); // 23:00 MSK
    const delay = deferUntilMorning(now);
    // 23:00 → next 09:00 = 10 hours
    expect(delay).toBe(10 * 3600 * 1000);
  });
});
