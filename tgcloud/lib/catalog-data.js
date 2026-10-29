// The curated catalog, as data. Pure — no SDK, no database — so it can be
// unit-tested locally and imported by both the seeder and the presentation code.
//
// Seeding rule: `name` is what users read, `keyword`s are extra normalized terms
// (brand, English name, common aliases) that make search find the row. `name`
// alone decides identity: `normalized_name` is UNIQUE in the database, so two
// entries that normalize to the same string can never both exist.
//
// Prices are deliberately absent. Every number the bot shows comes from a user
// report, never from here.
//
// Products are kept technically distinct rather than merged: a 20 W charger is
// not a 25 W charger, a 10,000 mAh power bank is not a 20,000 mAh one, and a
// Lightning-to-USB-C cable is not a Lightning-to-USB-A cable.

import { normalizeText } from './normalize.js';

/** Category key → Persian label. Keys are stored in `products.category`. */
export const CATEGORIES = {
  charger: 'شارژر',
  wireless: 'شارژر بی‌سیم',
  cable: 'کابل',
  powerbank: 'پاوربانک',
  audio: 'هندزفری و هدفون',
  speaker: 'اسپیکر',
  case: 'قاب و کاور',
  glass: 'گلس و محافظ صفحه',
  adapter: 'مبدل و هاب',
  holder: 'نگهدارنده',
};

export function categoryLabel(category) {
  return CATEGORIES[category] ?? 'دسته‌بندی‌نشده';
}

/**
 * The seed catalog. Re-running the seeder never duplicates a row and never
 * overwrites one, so this list can grow safely between releases.
 */
export const SEED_PRODUCTS = [
  // ── Chargers ───────────────────────────────────────────────────────────────
  {
    name: 'شارژر USB-C ۲۰ وات',
    category: 'charger',
    keywords: 'charger usb-c آداپتور شارژ adaptor 20w 20 watt',
  },
  {
    name: 'شارژر USB-C ۲۵ وات',
    category: 'charger',
    keywords: 'charger usb-c آداپتور شارژ adaptor 25w 25 watt',
  },
  {
    name: 'شارژر ۳۰ وات انکر Nano',
    category: 'charger',
    keywords: 'anker انکر nano charger آداپتور 30w 30 watt',
  },
  {
    name: 'شارژر ۶۵ وات گن بیسوس',
    category: 'charger',
    keywords: 'baseus بیسوس gan charger آداپتور 65w 65 watt',
  },
  {
    name: 'شارژر ۲۰ وات USB-C اپل',
    category: 'charger',
    keywords: 'apple اپل charger آداپتور 20w 20 watt',
  },
  {
    name: 'شارژر ۲۵ وات USB-C سامسونگ',
    category: 'charger',
    keywords: 'samsung سامسونگ charger آداپتور 25w 25 watt',
  },
  {
    name: 'شارژر ۳۳ وات شیائومی',
    category: 'charger',
    keywords: 'xiaomi شیائومی charger آداپتور 33w 33 watt',
  },
  {
    name: 'شارژر فندکی ۲۰ وات',
    category: 'charger',
    keywords: 'car charger ماشین خودرو فندکی 20w 20 watt',
  },

  // ── Wireless chargers ──────────────────────────────────────────────────────
  {
    name: 'شارژر بی‌سیم مگ‌سیف اپل',
    category: 'wireless',
    keywords: 'apple اپل magsafe مگسیف wireless شارژر بیسیم',
  },
  {
    name: 'شارژر بی‌سیم ۱۵ وات سامسونگ',
    category: 'wireless',
    keywords: 'samsung سامسونگ wireless شارژر بیسیم 15w 15 watt',
  },

  // ── Cables ─────────────────────────────────────────────────────────────────
  {
    name: 'کابل USB-C به USB-C ۱ متری',
    category: 'cable',
    keywords: 'cable usb-c type-c کابل 1m 1 meter',
  },
  {
    name: 'کابل لایتنینگ ۱ متری',
    category: 'cable',
    keywords: 'lightning لایتنینگ apple اپل cable کابل 1m 1 meter',
  },
  {
    name: 'کابل USB-C به لایتنینگ ۱ متری',
    category: 'cable',
    keywords: 'lightning لایتنینگ usb-c cable کابل 1m 1 meter',
  },
  {
    name: 'کابل میکرو USB ۱ متری',
    category: 'cable',
    keywords: 'micro usb میکرو cable کابل 1m 1 meter',
  },
  {
    name: 'کابل USB-C به USB-C انکر ۱ متری',
    category: 'cable',
    keywords: 'anker انکر cable usb-c type-c کابل 1m 1 meter',
  },
  {
    name: 'کابل لایتنینگ بیسوس ۱ متری',
    category: 'cable',
    keywords: 'baseus بیسوس lightning لایتنینگ cable کابل 1m 1 meter',
  },

  // ── Power banks ────────────────────────────────────────────────────────────
  {
    name: 'پاوربانک ۱۰۰۰۰ میلی‌آمپرساعت',
    category: 'powerbank',
    keywords: 'power bank powerbank پاور بانک 10000mah 10000 mah',
  },
  {
    name: 'پاوربانک ۲۰۰۰۰ میلی‌آمپرساعت',
    category: 'powerbank',
    keywords: 'power bank powerbank پاور بانک 20000mah 20000 mah',
  },
  {
    name: 'پاوربانک ۱۰۰۰۰ انکر PowerCore',
    category: 'powerbank',
    keywords: 'anker انکر power bank powerbank powercore 10000mah',
  },
  {
    name: 'پاوربانک ۲۰۰۰۰ بیسوس',
    category: 'powerbank',
    keywords: 'baseus بیسوس power bank powerbank 20000mah',
  },
  {
    name: 'پاوربانک ۱۰۰۰۰ شیائومی',
    category: 'powerbank',
    keywords: 'xiaomi شیائومی power bank powerbank 10000mah',
  },

  // ── Earphones and headphones ───────────────────────────────────────────────
  {
    name: 'هندزفری سیمی USB-C',
    category: 'audio',
    keywords: 'earphone headphone هندزفری سیمی wired usb-c type-c',
  },
  {
    name: 'هندزفری بلوتوثی',
    category: 'audio',
    keywords: 'earphone headphone هندزفری بلوتوث bluetooth wireless بیسیم',
  },
  {
    name: 'ایرپاد پرو ۲ اپل',
    category: 'audio',
    keywords: 'apple اپل airpods pro 2 ایرپاد earbuds هندزفری بلوتوثی',
  },
  {
    name: 'گلکسی بادز ۲ سامسونگ',
    category: 'audio',
    keywords: 'samsung سامسونگ galaxy buds 2 بادز earbuds هندزفری بلوتوثی',
  },
  {
    name: 'ردمی بادز ۴ شیائومی',
    category: 'audio',
    keywords: 'xiaomi شیائومی redmi buds 4 بادز earbuds هندزفری بلوتوثی',
  },
  {
    name: 'هدفون انکر Soundcore Life Q30',
    category: 'audio',
    keywords: 'anker انکر soundcore headphone هدفون بلوتوثی',
  },

  // ── Speakers ───────────────────────────────────────────────────────────────
  {
    name: 'اسپیکر بلوتوثی انکر Soundcore 3',
    category: 'speaker',
    keywords: 'anker انکر soundcore speaker اسپیکر بلوتوثی',
  },
  {
    name: 'اسپیکر بلوتوثی JBL GO 4',
    category: 'speaker',
    keywords: 'jbl speaker اسپیکر بلوتوثی',
  },

  // ── Cases ──────────────────────────────────────────────────────────────────
  {
    name: 'قاب مگ‌سیف آیفون ۱۵',
    category: 'case',
    keywords: 'apple اپل magsafe مگسیف iphone 15 آیفون قاب case',
  },
  {
    name: 'قاب اسپیگن Ultra Hybrid آیفون ۱۵',
    category: 'case',
    keywords: 'spigen اسپیگن ultra hybrid iphone 15 آیفون قاب case',
  },
  {
    name: 'قاب سیلیکونی سامسونگ گلکسی S24',
    category: 'case',
    keywords: 'samsung سامسونگ silicone silicon gel silicone galaxy s24 قاب case',
  },

  // ── Screen protectors ──────────────────────────────────────────────────────
  {
    name: 'گلس شیشه‌ای آیفون ۱۵',
    category: 'glass',
    keywords: 'glass گلس محافظ صفحه iphone 15 آیفون tempered',
  },
  {
    name: 'گلس شیشه‌ای سامسونگ گلکسی S24',
    category: 'glass',
    keywords: 'glass گلس محافظ صفحه samsung سامسونگ galaxy s24',
  },

  // ── Adapters and hubs ──────────────────────────────────────────────────────
  {
    name: 'مبدل USB-C به USB-A اپل',
    category: 'adapter',
    keywords: 'apple اپل adapter مبدل usb-c usb-a',
  },
  {
    name: 'مبدل لایتنینگ به جک ۳٫۵ میلی‌متری اپل',
    category: 'adapter',
    keywords: 'apple اپل adapter مبدل lightning لایتنینگ jack 3.5mm هدفون',
  },
  {
    name: 'هاب USB-C چهار پورت یوگرین',
    category: 'adapter',
    keywords: 'ugreen یوگرین hub هاب usb-c 4 port',
  },

  // ── Holders ────────────────────────────────────────────────────────────────
  {
    name: 'نگهدارنده مغناطیسی گوشی مخصوص خودرو',
    category: 'holder',
    keywords: 'holder نگهدارنده هولدر magnetic مغناطیسی car خودرو ماشین',
  },
];

/**
 * A seed entry as a database row: the display name plus the normalized form that
 * is stored and searched. Pure, so the seeder and the tests use the same code.
 */
export function toProductRow(entry) {
  return {
    name: entry.name,
    normalizedName: normalizeText(entry.name),
    category: entry.category,
    keywords: entry.keywords ? normalizeText(entry.keywords) : null,
  };
}
