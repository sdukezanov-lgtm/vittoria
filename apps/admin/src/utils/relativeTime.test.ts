import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const now = new Date('2026-05-29T12:00:00Z');

describe('formatRelativeTime', () => {
  it('returns — for null', () => {
    expect(formatRelativeTime(null, now)).toBe('—');
  });
  it('returns "только что" under a minute', () => {
    expect(formatRelativeTime('2026-05-29T11:59:30Z', now)).toBe('только что');
  });
  it('returns minutes', () => {
    expect(formatRelativeTime('2026-05-29T11:55:00Z', now)).toBe('5 мин назад');
  });
  it('returns hours', () => {
    expect(formatRelativeTime('2026-05-29T09:00:00Z', now)).toBe('3 ч назад');
  });
  it('returns "вчера" for ~1 day', () => {
    expect(formatRelativeTime('2026-05-28T10:00:00Z', now)).toBe('вчера');
  });
  it('returns days', () => {
    expect(formatRelativeTime('2026-05-26T12:00:00Z', now)).toBe('3 дн назад');
  });
});
