import { describe, it, expect } from 'vitest';
import { theme, BRAND } from './theme';

describe('brand theme', () => {
  it('uses gold as the primary color with a full 10-shade scale', () => {
    expect(theme.primaryColor).toBe('gold');
    expect(theme.colors?.gold).toHaveLength(10);
  });
  it('exposes brand tokens used across pages', () => {
    expect(BRAND.gold).toMatch(/^#/);
    expect(BRAND.graphite).toMatch(/^#/);
    expect(BRAND.bg).toMatch(/^#/);
    expect(BRAND.green).toMatch(/^#/);
  });
});
