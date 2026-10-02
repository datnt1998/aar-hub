import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber } from './format';

describe('format', () => {
  it('renders instants in Vietnam time whatever the machine time zone', () => {
    // 17:30 UTC on the 9th is already the 10th in Vietnam (UTC+7).
    expect(formatDate('2026-10-09T17:30:00Z')).toBe('10/10/2026');
    expect(formatDateTime('2026-10-09T17:30:00Z')).toBe('00:30 10/10/2026');
  });

  it('uses Vietnamese digit grouping', () => {
    expect(formatNumber(1234567.5)).toBe('1.234.567,5');
  });
});
