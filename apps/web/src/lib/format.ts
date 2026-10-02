/**
 * Dates and numbers as users in Vietnam read them. The time zone is fixed so a date renders the same on every
 * machine (CI runs in UTC): `2026-10-09T17:30:00Z` is 10/10/2026 in Vietnam.
 */
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DATE_FIELDS = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;

const dateFormat = new Intl.DateTimeFormat('vi-VN', { ...DATE_FIELDS, timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  ...DATE_FIELDS,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
});
const numberFormat = new Intl.NumberFormat('vi-VN');

/** `2026-10-09T17:30:00Z` → `10/10/2026`. Accepts the ISO strings the API returns. */
export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value));
}

/** `2026-10-09T17:30:00Z` → `00:30 10/10/2026`. */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(new Date(value));
}

/** `1234567.5` → `1.234.567,5`. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}
