// Every user-facing string in the bot. Keeping the Persian copy in one place
// means wording, tone and the HTML markup around it are consistent, and a
// translation (or a typo fix) never has to be hunted through handlers.

import { PRICE_LIMITS, SEARCH, SUMMARY } from './config.js';
import { categoryLabel } from './catalog-data.js';
import { escapeHtml, formatDate, formatRelativeTime, formatToman, toPersianDigits } from './format.js';

export const START = `🎧 <b>چی‌ارزه؟</b>
قیمت لوازم جانبی موبایل در ایران، از زبان خودِ خریدارها.

اینجا خریدارها قیمت واقعی شارژر، کابل، پاوربانک، هندزفری و بقیهٔ لوازم جانبی را با هم به اشتراک می‌گذارند.

• هیچ قیمتی را ما از خودمان نمی‌سازیم؛ همه از گزارش کاربران می‌آید.
• هر گزارش پیش از انتشار بررسی می‌شود.
• کنار هر قیمت معلوم است که چه‌قدر تازه است.

برای شروع، <b>📦 کالاها</b> را بزنید یا /products را بفرستید.
جست‌وجو: <code>/search شارژر اپل</code>
ثبت قیمت: <code>/report</code>`;

export const HELP = `<b>راهنما</b>

/start — پیام خوش‌آمد
/products — فهرست کالاها
/search &lt;عبارت&gt; — جست‌وجوی کالا
/product &lt;شماره&gt; — قیمت یک کالا
/price &lt;شماره&gt; — همان صفحهٔ قیمت
/report — ثبت قیمت خرید
/flag &lt;شمارهٔ گزارش&gt; — علامت‌زدن گزارش مشکوک
/help — همین راهنما
/id — شناسهٔ تلگرام شما

هر متنی هم که بدون دستور بفرستید، به‌عنوان جست‌وجو در فهرست کالاها بررسی می‌شود.

<b>ثبت قیمت</b>
<code>/report شناسهٔ کالا | قیمت به تومان | فروشگاه | لینک (اختیاری)</code>
همهٔ قیمت‌ها به <b>تومان</b> است؛ ریال پذیرفته نمی‌شود.

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

// Administrator-only message, so it may mention the setup step they can run.
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

  const lines = products.map(
    (product) =>
      `${productMarker(product.id)} ${escapeHtml(product.name)} <i>(${escapeHtml(categoryLabel(product.category))})</i>`,
  );

  return [
    `📦 <b>کالاها</b>`,
    `صفحهٔ ${toPersianDigits(page + 1)} از ${toPersianDigits(pageCount)} — ${toPersianDigits(total)} کالا`,
    '',
    ...lines,
    '',
    'برای دیدن قیمت‌ها، روی نام کالا بزنید.',
    'جست‌وجو: <code>/search شارژر</code>',
  ].join('\n');
}

/** "#۱۲" — the product id, in the same digits as the rest of the interface. */
export function productMarker(productId) {
  return `<code>#${toPersianDigits(productId)}</code>`;
}

/** Search results, or an honest "nothing found" that suggests the next step. */
export function searchResultsMessage({ query, products }) {
  const shown = escapeHtml(query);

  if (!products.length) {
    return `🔍 برای «${shown}» چیزی پیدا نشد.
نام کالا را ساده‌تر بنویسید یا فهرست کالاها را ببینید: /products`;
  }

  const lines = products.map(
    (product) =>
      `• ${productMarker(product.id)} ${escapeHtml(product.name)} <i>(${escapeHtml(categoryLabel(product.category))})</i>`,
  );

  return [
    `🔍 <b>نتایج «${shown}»</b>`,
    '',
    ...lines,
    '',
    products.length >= SEARCH.results
      ? 'نتایج بیشتر؟ عبارت دقیق‌تری بنویسید.'
      : 'برای دیدن قیمت‌ها، روی نام کالا بزنید.',
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

// ── Price reports ────────────────────────────────────────────────────────────
// Every message that mentions money says "تومان": the bot never accepts rial and
// never converts between the two.

export const REPORT_USAGE = `<b>ثبت گزارش قیمت</b>

<code>/report شناسهٔ کالا | قیمت به تومان | نام فروشگاه | لینک (اختیاری)</code>

مثال:
<code>/report 5 | 4,850,000 | دیجی‌کالا | https://example.com/p/12</code>

• قیمت را همیشه به <b>تومان</b> بنویسید؛ ریال پذیرفته نمی‌شود.
• شناسهٔ کالا را از /products یا /search بردارید.
• هر گزارش پیش از انتشار بررسی می‌شود و تا آن زمان در هیچ قیمتی حساب نمی‌شود.`;

export const REPORT_FAILED = `ثبت گزارش ناموفق بود.
کمی بعد دوباره تلاش کنید؛ گزارش شما ثبت نشده است.`;

const REPORT_ERRORS = {
  USAGE: () => REPORT_USAGE,
  TOO_MANY_FIELDS: () => `بخش‌های گزارش زیاد است.
قالب درست: <code>/report شناسهٔ کالا | قیمت به تومان | نام فروشگاه | لینک (اختیاری)</code>`,
  PRODUCT_ID_INVALID: () =>
    'شناسهٔ کالا باید یک عدد باشد؛ آن را از /products یا /search بردارید.',
  PRICE_EMPTY: () => 'قیمت خالی است. قیمت را به تومان بنویسید؛ مثلاً <code>4,850,000</code>.',
  PRICE_INVALID: () =>
    'قیمت را به شکل یک عدد صحیح به <b>تومان</b> بنویسید (مثلاً <code>4850000</code> یا <code>۴٬۸۵۰٬۰۰۰</code>).\nعدد اعشاری و مبلغ ریالی پذیرفته نمی‌شود.',
  STORE_EMPTY: () => 'نام فروشگاه خالی است. مثلاً <code>دیجی‌کالا</code>.',
  STORE_INVALID: () => 'نام فروشگاه معتبر نیست؛ نام فروشگاه را با حرف بنویسید.',
  URL_INVALID: () => 'لینک منبع معتبر نیست؛ باید با <code>http://</code> یا <code>https://</code> شروع شود.',
  PRODUCT_NOT_FOUND: () => 'کالایی با این شناسه پیدا نشد. فهرست کالاها: /products',
  PRODUCT_INACTIVE: () => 'این کالا دیگر در فهرست نیست و گزارش تازه برایش ثبت نمی‌شود.',
  USER_UNKNOWN: () => 'شناسایی حساب شما ممکن نشد. یک بار /start را بفرستید و دوباره تلاش کنید.',
  DUPLICATE: ({ windowHours }) =>
    `همین قیمت را برای همین کالا و همین فروشگاه قبلاً ثبت کرده‌اید.
اگر قیمت عوض شده، عدد جدید را بفرستید؛ در غیر این صورت تا ${toPersianDigits(windowHours)} ساعت دیگر نیازی به ثبت دوباره نیست.`,
  RATE_LIMITED: ({ limit, windowHours }) =>
    `سقف گزارش شما پر شده است: حداکثر ${toPersianDigits(limit)} گزارش در هر ${toPersianDigits(windowHours)} ساعت.
کمی بعد دوباره تلاش کنید.`,
  REPORT_ID_INVALID: () => 'شمارهٔ گزارش باید یک عدد باشد.',
  REPORT_NOT_FOUND: () => 'گزارشی با این شماره پیدا نشد.',
  REPORT_NOT_PUBLIC: () => 'فقط گزارش‌های تأییدشده را می‌شود علامت زد.',
  SELF_FLAG: () => 'گزارش خودتان را نمی‌شود علامت زد.',
  ALREADY_FLAGGED: () => 'شما قبلاً همین گزارش را علامت زده‌اید.',
};

/** Turn a validation/rejection code into the Persian message a user sees. */
export function reportErrorText(result) {
  const detail = result?.detail ?? {};

  // Codes whose text needs a configured limit, so the number stays in one place.
  if (result?.error === 'PRICE_OUT_OF_RANGE') {
    return `قیمت باید بین ${formatToman(PRICE_LIMITS.min)} و ${formatToman(PRICE_LIMITS.max)} باشد.`;
  }
  if (result?.error === 'STORE_TOO_LONG') {
    return `نام فروشگاه حداکثر ${toPersianDigits(detail.max)} نویسه می‌تواند باشد.`;
  }
  if (result?.error === 'URL_TOO_LONG') {
    return `لینک منبع حداکثر ${toPersianDigits(detail.max)} نویسه می‌تواند باشد.`;
  }

  const build = REPORT_ERRORS[result?.error];
  return build ? build(detail) : REPORT_FAILED;
}

/**
 * Confirmation for a submitted report. It says, in as many words, that the
 * report is not published yet — the reporter should never think their number is
 * already part of the prices.
 */
export function reportSubmittedMessage({ report, product, deviation }) {
  const lines = [
    '✅ گزارش شما ثبت شد و <b>در انتظار بررسی</b> است.',
    '',
    `کالا: ${escapeHtml(product.name)} ${productMarker(product.id)}`,
    `قیمت: ${formatToman(report.priceToman)}`,
    `فروشگاه: ${escapeHtml(report.storeName)}`,
  ];
  if (report.sourceUrl) lines.push(`منبع: ${escapeHtml(report.sourceUrl)}`);

  lines.push('', `شمارهٔ گزارش: ${productMarker(report.id)}`);
  if (deviation?.isUnusual) {
    lines.push(
      '',
      `ℹ️ این قیمت با میانهٔ گزارش‌های تأییدشده (${formatToman(deviation.median)}) فاصلهٔ زیادی دارد؛ برای همین با دقت بیشتری بررسی می‌شود.`,
    );
  }
  lines.push(
    '',
    'تا وقتی یکی از مدیران آن را تأیید نکند، این عدد در هیچ خلاصهٔ قیمتی حساب نمی‌شود.',
    'این گزارش قیمت رسمی فروشگاه نیست.',
  );
  return lines.join('\n');
}

// ── Product price page ───────────────────────────────────────────────────────

const STATUS_LABELS = {
  pending: 'در انتظار بررسی',
  approved: 'تأییدشده',
  rejected: 'ردشده',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

/**
 * The published price view for one product.
 *
 * What it will not do: call a price "verified" because several people sent it,
 * show a median built from one person's reports, or imply that a shop still has
 * stock at that price.
 */
export function productPriceMessage({ product, summary, now = new Date() }) {
  const lines = [
    `📦 <b>${escapeHtml(product.name)}</b>`,
    `<i>${escapeHtml(categoryLabel(product.category))}</i> ${productMarker(product.id)}`,
    '',
  ];

  if (summary.count === 0) {
    lines.push('هنوز قیمت تأییدشده‌ای برای این کالا ثبت نشده است.');
  } else {
    const latest = summary.latestAt ? formatRelativeTime(summary.latestAt, now) : 'نامشخص';

    const counts = `${toPersianDigits(summary.count)} گزارش از ${toPersianDigits(summary.contributors)} نفر`;

    if (summary.showMedian) {
      lines.push(
        `💰 میانهٔ قیمت: <b>${formatToman(summary.median)}</b>`,
        `${counts} — آخرین گزارش ${latest}`,
      );
    } else {
      // No median: say why, with the number of people rather than a vague "soon".
      lines.push(
        `💰 ${counts} — آخرین گزارش ${latest}`,
        `برای نمایش میانه دست‌کم ${toPersianDigits(SUMMARY.minContributorsForMedian)} نفر گزارش‌دهندهٔ مستقل لازم است.`,
      );
    }

    if (summary.showRange) {
      lines.push(`بازهٔ گزارش‌ها: ${formatToman(summary.min)} تا ${formatToman(summary.max)}`);
    }
    if (summary.isStale) {
      lines.push(
        '',
        `⚠️ آخرین گزارش ${formatRelativeTime(summary.latestAt, now)} ثبت شده است؛ ممکن است قیمت عوض شده باشد.`,
      );
    }
  }

  if (summary.pendingCount > 0) {
    lines.push(
      '',
      `⏳ ${toPersianDigits(summary.pendingCount)} گزارش در انتظار بررسی است و در اعداد بالا حساب نشده.`,
    );
  }

  if (summary.reports.length) {
    lines.push('', '<b>آخرین گزارش‌ها</b>');
    for (const report of summary.reports.slice(0, SUMMARY.recentReportsShown)) {
      lines.push(
        `• ${productMarker(report.id)} — ${formatToman(report.priceToman)} — ${escapeHtml(report.storeName)} — ${formatRelativeTime(report.createdAt, now)}`,
      );
    }
  }

  lines.push(
    '',
    'این اعداد گزارش کاربران است، نه قیمت رسمی فروشگاه؛ قیمت‌ها عوض می‌شوند و موجود بودن کالا تضمینی نیست.',
    `ثبت قیمت خودتان: <code>/report ${toPersianDigits(product.id)} | قیمت به تومان | فروشگاه</code>`,
  );
  return lines.join('\n');
}

export const FLAG_ID_REQUIRED = `شمارهٔ گزارش را مشخص کنید.
مثال: <code>/flag 12</code>`;

export function REPORT_ID_REQUIRED(action = 'approve') {
  return `شمارهٔ گزارش را مشخص کنید.
مثال: <code>/${action} 12</code>`;
}

export const PRODUCT_ID_REQUIRED = `شمارهٔ کالا را مشخص کنید.
مثال: <code>/product 5</code> — شماره‌ها در /products و /search نمایش داده می‌شوند.`;

// ── Flags ────────────────────────────────────────────────────────────────────

export function flagResultMessage(result, reportId) {
  if (result.ok) {
    return `🚩 ممنون؛ گزارش ${productMarker(reportId)} علامت زده شد و برای بررسی به مدیران نشان داده می‌شود.`;
  }
  return reportErrorText(result);
}

// ── Administration ───────────────────────────────────────────────────────────

export const ADMIN_ONLY = 'این دستور در دسترس شما نیست.';

export function adminOverviewMessage(stats) {
  return [
    '🛠 <b>مدیریت</b>',
    '',
    `در انتظار بررسی: ${toPersianDigits(stats.pending)}`,
    `تأییدشده: ${toPersianDigits(stats.approved)}`,
    `ردشده: ${toPersianDigits(stats.rejected)}`,
    '',
    `گزارش‌های علامت‌خورده: ${toPersianDigits(stats.flaggedReports)} (${toPersianDigits(stats.flags)} علامت)`,
    '',
    '<code>/pending</code> — صف بررسی',
    '<code>/inspect شماره</code> — جزئیات یک گزارش',
    '<code>/approve شماره</code> — تأیید',
    '<code>/reject شماره [دلیل]</code> — رد کردن',
    '<code>/seed</code> — به‌روزرسانی فهرست کالاها',
  ].join('\n');
}

export function pendingQueueMessage({ reports, total, deviations, now = new Date() }) {
  if (!reports.length) return '🛠 صف بررسی خالی است.';

  const lines = [`🛠 <b>در انتظار بررسی</b> — ${toPersianDigits(total)} گزارش`, ''];
  for (const report of reports) {
    const flags = report.flagCount ? ` — 🚩 ${toPersianDigits(report.flagCount)}` : '';
    const outlier = deviations?.get(report.id) ? ' — ⚠️ دور از میانه' : '';
    lines.push(
      `${productMarker(report.id)} ${escapeHtml(report.productName ?? 'کالای حذف‌شده')}`,
      `   ${formatToman(report.priceToman)} — ${escapeHtml(report.storeName)} — ${formatRelativeTime(report.createdAt, now)}${flags}${outlier}`,
    );
  }
  lines.push(
    '',
    'تأیید و رد با دکمه‌های زیر؛ جزئیات بیشتر: <code>/inspect شماره</code>',
    'رد کردن با دلیل: <code>/reject شماره دلیل</code>',
  );
  return lines.join('\n');
}

export function inspectMessage({ report, product, flags, deviation, now = new Date() }) {
  const lines = [
    `🧾 گزارش ${productMarker(report.id)} — <b>${statusLabel(report.status)}</b>`,
    '',
    `کالا: ${escapeHtml(product?.name ?? 'نامشخص')} ${product ? productMarker(product.id) : ''}`,
    `قیمت: ${formatToman(report.priceToman)}`,
    `فروشگاه: ${escapeHtml(report.storeName)}`,
    `منبع: ${report.sourceUrl ? escapeHtml(report.sourceUrl) : '—'}`,
    `ثبت: ${formatDate(report.createdAt)} (${formatRelativeTime(report.createdAt, now)})`,
    `علامت‌ها: ${toPersianDigits(flags.length)}`,
  ];

  if (deviation) {
    lines.push(
      deviation.isUnusual
        ? `⚠️ ${toPersianDigits(Math.round(deviation.ratio * 100))}٪ دورتر از میانهٔ ${formatToman(deviation.median)} (${toPersianDigits(deviation.sampleSize)} گزارش)`
        : `میانهٔ بازار: ${formatToman(deviation.median)} (${toPersianDigits(deviation.sampleSize)} گزارش)`,
    );
  } else {
    lines.push('برای مقایسه، دادهٔ تأییدشدهٔ کافی وجود ندارد.');
  }

  if (report.status !== 'pending') {
    const when = report.reviewedAt ? formatRelativeTime(report.reviewedAt, now) : 'نامشخص';
    lines.push('', `بررسی‌شده: ${when}`);
    if (report.reviewNote) lines.push(`یادداشت: ${escapeHtml(report.reviewNote)}`);
  }

  return lines.join('\n');
}

export function decisionMessage(result, { action, reportId }) {
  if (result.ok) {
    return action === 'approve'
      ? `✅ گزارش ${productMarker(reportId)} تأیید شد و از این پس در خلاصهٔ قیمت کالا حساب می‌شود.`
      : `🗑 گزارش ${productMarker(reportId)} رد شد و در خلاصه‌های عمومی نمایش داده نمی‌شود.`;
  }
  if (result.error === 'INVALID_STATE') {
    return `این گزارش الان «${statusLabel(result.status)}» است؛ فقط گزارش‌های در انتظار بررسی را می‌شود تغییر داد.`;
  }
  return reportErrorText(result);
}

// ── Callback answers ─────────────────────────────────────────────────────────
// Short toasts: a callback answer is a bubble at the top of the screen, not a
// message, so these are one line each — the screen behind them does the talking.

export const TOAST_FLAGGED = '🚩 ثبت شد؛ برای بررسی به مدیران نشان داده می‌شود.';
export const TOAST_APPROVED = '✅ تأیید شد.';
export const TOAST_REJECTED = '🗑 رد شد.';
export const TOAST_STALE_BUTTON = 'این دکمه دیگر معتبر نیست.';
export const TOAST_NOT_ADMIN = 'این عملیات در دسترس شما نیست.';
export const TOAST_PRODUCT_MISSING = 'این کالا پیدا نشد.';
export const TOAST_REPORT_MISSING = 'این گزارش پیدا نشد.';

/** A failed callback must say *something*; the detail goes to the logs. */
export const TOAST_FAILED = 'انجام این کار ممکن نشد. کمی بعد دوباره تلاش کنید.';

/** Last-resort message when a handler throws before it can reply. */
export const GENERIC_ERROR = `مشکلی پیش آمد و این درخواست انجام نشد.
کمی بعد دوباره تلاش کنید؛ اگر ادامه داشت /help را ببینید.`;
