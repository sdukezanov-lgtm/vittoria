import { describe, it, expect } from 'vitest';
import { isActive, statusLabel } from './orderStatus';

describe('order status', () => {
  it('is active until ready_for_delivery is reached', () => {
    expect(isActive('production')).toBe(true);
    expect(isActive('ready_for_delivery')).toBe(false);
  });
  it('maps to a Russian label', () => {
    expect(statusLabel('production')).toBe('Действующий');
    expect(statusLabel('ready_for_delivery')).toBe('Завершён');
  });
});
