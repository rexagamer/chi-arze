// The predefined catalog of mobile accessories.
//
// It lives in code rather than in the database: the list is curated, small, and
// changes only when we deploy. That keeps price reports free of dangling links
// and removes any need for a seeding step. `key` is the stable identifier that
// `price_reports.product_key` stores — rename a key and old reports stop
// resolving to a product, so treat keys as permanent.
//
// Prices are deliberately absent: every number the bot shows comes from a user
// report, never from here.

import { normalizeSearchText } from './input.js';

/** Category key → Persian label. Keys are stored nowhere; they are UI grouping. */
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

const PRODUCTS = [
  { key: 'apple-usb-c-20w', name: 'شارژر ۲۰ وات USB-C اپل', brand: 'Apple', category: 'charger', aliases: ['اپل ۲۰ وات'] },
  { key: 'apple-usb-c-30w', name: 'شارژر ۳۰ وات USB-C اپل', brand: 'Apple', category: 'charger', aliases: ['اپل ۳۰ وات'] },
  { key: 'samsung-25w-usb-c', name: 'شارژر ۲۵ وات USB-C سامسونگ', brand: 'Samsung', category: 'charger', aliases: ['سامسونگ ۲۵ وات'] },
  { key: 'xiaomi-33w-fast', name: 'شارژر ۳۳ وات شیائومی', brand: 'Xiaomi', category: 'charger', aliases: ['شیائومی ۳۳ وات'] },
  { key: 'anker-nano-30w', name: 'شارژر ۳۰ وات انکر Nano', brand: 'Anker', category: 'charger', aliases: ['انکر ۳۰ وات', 'انکر نانو'] },
  { key: 'baseus-gan-65w', name: 'شارژر ۶۵ وات گن بیسوس', brand: 'Baseus', category: 'charger', aliases: ['بیسوس ۶۵ وات'] },

  { key: 'apple-magsafe-charger', name: 'شارژر بی‌سیم مگ‌سیف اپل', brand: 'Apple', category: 'wireless', aliases: ['مگ‌سیف', 'magsafe'] },
  { key: 'samsung-wireless-15w', name: 'شارژر بی‌سیم ۱۵ وات سامسونگ', brand: 'Samsung', category: 'wireless', aliases: ['شارژر بی‌سیم سامسونگ'] },

  { key: 'apple-usb-c-lightning-1m', name: 'کابل USB-C به لایتنینگ اپل ۱ متری', brand: 'Apple', category: 'cable', aliases: ['کابل اپل', 'کابل لایتنینگ'] },
  { key: 'anker-usb-c-usb-c-1m', name: 'کابل USB-C به USB-C انکر ۱ متری', brand: 'Anker', category: 'cable', aliases: ['کابل انکر'] },
  { key: 'baseus-lightning-1m', name: 'کابل لایتنینگ بیسوس ۱ متری', brand: 'Baseus', category: 'cable', aliases: ['کابل بیسوس'] },
  { key: 'ugreen-micro-usb-1m', name: 'کابل میکرو USB یوگرین ۱ متری', brand: 'UGREEN', category: 'cable', aliases: ['کابل یوگرین'] },

  { key: 'anker-powercore-10000', name: 'پاوربانک ۱۰۰۰۰ انکر PowerCore', brand: 'Anker', category: 'powerbank', aliases: ['پاوربانک انکر'] },
  { key: 'xiaomi-power-bank-10000', name: 'پاوربانک ۱۰۰۰۰ شیائومی', brand: 'Xiaomi', category: 'powerbank', aliases: ['پاوربانک شیائومی'] },
  { key: 'baseus-power-bank-20000', name: 'پاوربانک ۲۰۰۰۰ بیسوس', brand: 'Baseus', category: 'powerbank', aliases: ['پاوربانک بیسوس'] },

  { key: 'apple-airpods-pro-2', name: 'ایرپاد پرو ۲ اپل', brand: 'Apple', category: 'audio', aliases: ['ایرپاد', 'airpods'] },
  { key: 'samsung-galaxy-buds-2', name: 'گلکسی بادز ۲ سامسونگ', brand: 'Samsung', category: 'audio', aliases: ['بادز', 'galaxy buds'] },
  { key: 'xiaomi-redmi-buds-4', name: 'ردمی بادز ۴ شیائومی', brand: 'Xiaomi', category: 'audio', aliases: ['ردمی بادز'] },
  { key: 'anker-soundcore-q30', name: 'هدفون انکر Soundcore Life Q30', brand: 'Anker', category: 'audio', aliases: ['هدفون انکر'] },

  { key: 'anker-soundcore-3', name: 'اسپیکر بلوتوثی انکر Soundcore 3', brand: 'Anker', category: 'speaker', aliases: ['اسپیکر انکر'] },
  { key: 'jbl-go-4', name: 'اسپیکر بلوتوثی JBL GO 4', brand: 'JBL', category: 'speaker', aliases: [] },

  { key: 'apple-magsafe-case-iphone-15', name: 'قاب مگ‌سیف آیفون ۱۵', brand: 'Apple', category: 'case', aliases: ['قاب مگ‌سیف', 'آیفون ۱۵'] },
  { key: 'spigen-ultra-hybrid-iphone-15', name: 'قاب اسپیگن Ultra Hybrid آیفون ۱۵', brand: 'Spigen', category: 'case', aliases: ['قاب اسپیگن'] },
  { key: 'samsung-silicone-case-s24', name: 'قاب سیلیکونی سامسونگ گلکسی S24', brand: 'Samsung', category: 'case', aliases: ['قاب s24'] },

  { key: 'glass-iphone-15', name: 'گلس شیشه‌ای آیفون ۱۵', brand: 'Generic', category: 'glass', aliases: ['گلس آیفون ۱۵'] },
  { key: 'glass-galaxy-s24', name: 'گلس شیشه‌ای سامسونگ گلکسی S24', brand: 'Generic', category: 'glass', aliases: ['گلس s24'] },

  { key: 'apple-lightning-35mm', name: 'مبدل لایتنینگ به جک ۳٫۵ میلی‌متری اپل', brand: 'Apple', category: 'adapter', aliases: ['مبدل جک'] },
  { key: 'apple-usb-c-to-usb-a', name: 'مبدل USB-C به USB-A اپل', brand: 'Apple', category: 'adapter', aliases: [] },
  { key: 'ugreen-usb-c-hub-4in1', name: 'هاب USB-C چهار پورت یوگرین', brand: 'UGREEN', category: 'adapter', aliases: ['هاب یوگرین'] },

  { key: 'magnetic-phone-holder', name: 'نگهدارنده مغناطیسی گوشی مخصوص خودرو', brand: 'Generic', category: 'holder', aliases: ['هولدر ماشین', 'مگ‌هولدر'] },
];

const PRODUCT_BY_KEY = new Map(PRODUCTS.map((product) => [product.key, product]));

// Built once per isolate: searching a 30-item list through a normalized index is
// far cheaper than re-normalizing on every query.
const SEARCH_INDEX = PRODUCTS.map((product) => ({
  product,
  haystack: normalizeSearchText(
    [product.name, product.brand, CATEGORIES[product.category], ...product.aliases].join(' '),
  ),
}));

export function allProducts() {
  return PRODUCTS;
}

export function getProduct(key) {
  return PRODUCT_BY_KEY.get(key) ?? null;
}

export function productsByCategory(category) {
  return PRODUCTS.filter((product) => product.category === category);
}

export function categoryLabel(category) {
  return CATEGORIES[category] ?? category;
}

/**
 * Every word of the query must appear somewhere in the product's name, brand,
 * category or aliases — so "شارژر اپل" and "اپل ۲۰" both work, and Persian or
 * Arabic spelling of ی/ک makes no difference.
 */
export function searchProducts(query, limit = 5) {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!words.length) return [];

  const matches = [];
  for (const { product, haystack } of SEARCH_INDEX) {
    if (words.every((word) => haystack.includes(word))) {
      matches.push(product);
      if (matches.length === limit) break;
    }
  }
  return matches;
}
