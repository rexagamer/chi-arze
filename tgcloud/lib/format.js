// Presentation helpers for Persian, user-facing text. Pure functions only, so
// they can be exercised locally with `npm test` without the platform runtime.

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const THOUSANDS_SEPARATOR = '\u066c'; // ٬ — the Persian thousands separator

/** 1250000 → "۱۲۵۰۰۰۰" */
export function toPersianDigits(value) {
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/** 1250000 → "۱٬۲۵۰٬۰۰۰ تومان" */
export function formatToman(amount) {
  const rounded = Math.round(Number(amount));
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
  return `${toPersianDigits(grouped)} تومان`;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "How old is this?" in words — the honest way to show that a price may be
 * stale without forcing the reader to do date arithmetic.
 */
export function formatRelativeTime(date, now = new Date()) {
  const seconds = Math.round((now.getTime() - new Date(date).getTime()) / 1000);
  if (seconds < MINUTE) return 'همین حالا';
  if (seconds < HOUR) return `${toPersianDigits(Math.floor(seconds / MINUTE))} دقیقه پیش`;
  if (seconds < DAY) return `${toPersianDigits(Math.floor(seconds / HOUR))} ساعت پیش`;

  const days = Math.floor(seconds / DAY);
  if (days < 30) return `${toPersianDigits(days)} روز پیش`;
  if (days < 365) return `${toPersianDigits(Math.floor(days / 30))} ماه پیش`;
  return `${toPersianDigits(Math.floor(days / 365))} سال پیش`;
}

/** Escape user-supplied text before putting it in an HTML-formatted message. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
