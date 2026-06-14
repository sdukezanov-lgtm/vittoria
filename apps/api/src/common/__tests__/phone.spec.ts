import { normalizePhone } from '../phone';

describe('normalizePhone', () => {
  it('keeps canonical +7XXXXXXXXXX unchanged', () => {
    expect(normalizePhone('+79991234567')).toBe('+79991234567');
  });

  it('converts 8XXXXXXXXXX to +7XXXXXXXXXX', () => {
    expect(normalizePhone('89991234567')).toBe('+79991234567');
  });

  it('converts 7XXXXXXXXXX (no plus) to +7XXXXXXXXXX', () => {
    expect(normalizePhone('79991234567')).toBe('+79991234567');
  });

  it('converts a bare 10-digit number to +7XXXXXXXXXX', () => {
    expect(normalizePhone('9991234567')).toBe('+79991234567');
  });

  it('strips spaces, parens and dashes', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhone('8 999 123 45 67')).toBe('+79991234567');
  });

  it('returns null for foreign numbers', () => {
    expect(normalizePhone('+992927077539')).toBeNull();
    expect(normalizePhone('+3197010206674')).toBeNull();
  });

  it('returns null for a + number that is not +7 + 10 digits (malformed)', () => {
    expect(normalizePhone('+7981972536')).toBeNull(); // +7 then only 9 more digits
  });

  it('returns null for empty / too short / garbage', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('hello')).toBeNull();
  });
});
