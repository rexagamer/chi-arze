// Every user-facing string in the bot. Keeping the Persian copy in one place
// means wording, tone and the HTML markup around it are consistent, and a
// translation (or a typo fix) never has to be hunted through handlers.

import { CATALOG_PAGE_SIZE, SEARCH } from './config.js';
import { categoryLabel } from './catalog-data.js';
import { escapeHtml, toPersianDigits } from './format.js';

export const START = `🎧 <b>چی‌ارزه؟</b>
قیمت لوازم جانبی موبایل در ایران، از زبان خودِ خریدارها.

اینجا خریدارها قیمت واقعی شارژر، کابل، پاوربانک، هندزفری و بقیهٔ لوازم جانبی را با هم به اشتراک می‌گذارند.

• هیچ قیمتی را ما از خودمان نمی‌سازیم؛ همه از گزارش کاربران می‌آید.
• هر گزارش پیش از انتشار بررسی می‌شود.
• کنار هر قیمت معلوم است که چه‌قدر تازه است.

فهرست کالاها: /products
جست‌وجو: /search شارژر اپل`;

export const HELP = `<b>راهنما</b>

/start — پیام خوش‌آمد
/products — فهرست کالاها
/search &lt;عبارت&gt; — جست‌وجوی کالا
/help — همین راهنما
/id — شناسهٔ تلگرام شما

هر متنی هم که بدون دستور بفرستید، به‌عنوان جست‌وجو در فهرست کالاها بررسی می‌شود.

<b>دربارهٔ داده‌ها</b>
همهٔ قیمت‌ها گزارش کاربران است، نه قیمت رسمی فروشگاه‌ها. هر گزارش پیش از انتشار بررسی می‌شود و قدیمی‌بودن هر عدد کنارش نوشته می‌شود.

این ربات قیمتی از خودش نمی‌سازد و هیچ فروشگاهی را هم خودکار نمی‌گردد.`;

export const ABOUT = `<b>دربارهٔ چی‌ارزه؟</b>

«چی‌ارزه؟» یک فهرست مردمی از قیمت لوازم جانبی موبایل در ایران است. هدفش ساده است: پیش از خرید بدانید یک محصول در بازار واقعاً چند می‌ارزد.

<b>قاعده‌ها</b>
• هر عدد یک گزارش کاربر است، نه قیمت رسمی فروشگاه.
• گزارش‌ها پیش از انتشار بازبینی می‌شوند.
• گزارش تکراری یا قدیمی حذف نمی‌شود تا خودتان بتوانید مقایسه کنید.
• ما قیمتی نمی‌سازیم و هیچ سایتی را هم خودکار نمی‌گردیم.`;

export const NON_TEXT = `فعلاً فقط پیام متنی را می‌فهمم.
برای دیدن راهنما /help را بفرستید.`;

/** Shown when there is nothing in the catalog yet — not an error the user can fix. */
export const EMPTY_CATALOG = `فهرست کالاها هنوز آماده نیست.
کمی بعد دوباره سر بزنید.`;

export const SEARCH_EMPTY_QUERY = `عبارت جست‌وجو را بنویسید.
مثال: <code>/search شارژر اپل</code>`;

/** Admin-only command, and its outcome. */
export const SEED_NOT_ALLOWED = `این دستور در دسترس شما نیست.`;

export const SEED_FAILED = `ثبت فهرست کالاها ناموفق بود.
اگر تازه نصب کرده‌اید، ابتدا <code>npm run migrate</code> را اجرا کنید.`;

export function searchQueryTooLong(maxLength = SEARCH.maxQueryLength) {
  return `عبارت جست‌وجو خیلی بلند است؛ حداکثر ${toPersianDigits(maxLength)} نویسه.
نام کالا را کوتاه‌تر بنویسید.`;
}

export function unknownCommand(command) {
  return `دستور <code>/${escapeHtml(command)}</code> را نمی‌شناسم.
برای دیدن راهنما /help را بفرستید.`;
}

export function yourIdMessage(userId, admin) {
  // Latin digits on purpose: this value is meant to be copied into ADMIN_IDS.
  const id = userId == null ? 'نامشخص' : String(userId);
  const role = admin ? '\nنقش شما: مدیر' : '';
  return `شناسهٔ تلگرام شما:\n<code>${escapeHtml(id)}</code>${role}`;
}

/**
 * One page of the catalog. Numbering continues across pages so a user can say
 * "the fifth item" without counting from the top of the current message.
 */
export function productListMessage({ products, page, pageCount, total }) {
  if (!products.length) return EMPTY_CATALOG;

  const lines = products.map((product, index) => {
    const number = toPersianDigits(page * CATALOG_PAGE_SIZE + index + 1);
    const category = categoryLabel(product.category);
    return `${number}. ${escapeHtml(product.name)} <i>(${escapeHtml(category)})</i>`;
  });

  return [
    `📦 <b>کالاها</b>`,
    `صفحهٔ ${toPersianDigits(page + 1)} از ${toPersianDigits(pageCount)} — ${toPersianDigits(total)} کالا`,
    '',
    ...lines,
    '',
    `جست‌وجو: <code>/search شارژر</code>`,
  ].join('\n');
}

/** Search results, or an honest "nothing found" that suggests the next step. */
export function searchResultsMessage({ query, products }) {
  const shown = escapeHtml(query);

  if (!products.length) {
    return `🔍 برای «${shown}» چیزی پیدا نشد.
نام کالا را ساده‌تر بنویسید یا فهرست کالاها را ببینید: /products`;
  }

  const lines = products.map(
    (product) => `• ${escapeHtml(product.name)} <i>(${escapeHtml(categoryLabel(product.category))})</i>`,
  );

  return [
    `🔍 <b>نتایج «${shown}»</b>`,
    '',
    ...lines,
    '',
    products.length >= SEARCH.results ? `نتایج بیشتر؟ عبارت دقیق‌تری بنویسید.` : `فهرست کامل: /products`,
  ].join('\n');
}

/** The admin's confirmation that seeding ran, with what actually changed. */
export function seedResultMessage({ inserted, total }) {
  const totalText = toPersianDigits(total);
  if (inserted === 0) {
    return `✅ فهرست کالاها از قبل کامل بود.
${totalText} کالا در پایگاه داده ثبت شده است.`;
  }
  return `✅ فهرست کالاها به‌روز شد.
${toPersianDigits(inserted)} کالای تازه اضافه شد؛ در مجموع ${totalText} کالا.`;
}
