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

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

// Iran has used a fixed +03:30 offset with no daylight saving since 2022, so a
// stored unix timestamp can be turned into a local calendar date by shifting it,
// without depending on the runtime's time-zone data.
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/**
 * Gregorian → Jalali, the standard arithmetic conversion (no lookup tables, no
 * locale data). Returns [year, month (1-12), day].
 */
function toJalali(jy, jm, jd) {
  let gy = jy;
  let gm = jm;
  const gd = jd;
  const daysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  let year = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const leapBase = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((leapBase + 3) / 4) -
    Math.floor((leapBase + 99) / 100) +
    Math.floor((leapBase + 399) / 400) -
    80 +
    gd +
    daysInMonth[gm - 1];

  year += 33 * Math.floor(days / 12053);
  days %= 12053;
  year += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    year += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  const month = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const day = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [year, month, day];
}

/** A date the way a Persian reader expects it: "۷ آبان ۱۴۰۵", in Tehran time. */
export function formatDate(date) {
  const shifted = new Date(new Date(date).getTime() + TEHRAN_OFFSET_MS);
  const [year, month, day] = toJalali(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
  return `${toPersianDigits(day)} ${JALALI_MONTHS[month - 1]} ${toPersianDigits(year)}`;
}

/** Escape user-supplied text before putting it in an HTML-formatted message. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
