// Every user-facing string in the bot. Keeping the Persian copy in one place
// means wording, tone and the HTML markup around it are consistent, and a
// translation (or a typo fix) never has to be hunted through handlers.

import { escapeHtml } from './format.js';

export const START = `🎧 <b>چی‌ارزه؟</b>
قیمت لوازم جانبی موبایل در ایران، از زبان خودِ خریدارها.

اینجا خریدارها قیمت واقعی شارژر، کابل، پاوربانک، هندزفری و بقیهٔ لوازم جانبی را با هم به اشتراک می‌گذارند.

• هیچ قیمتی را ما از خودمان نمی‌سازیم؛ همه از گزارش کاربران می‌آید.
• هر گزارش پیش از انتشار بررسی می‌شود.
• کنار هر قیمت معلوم است که چه‌قدر تازه است.

راهنمای کامل: /help`;

export const HELP = `<b>راهنما</b>

/start — پیام خوش‌آمد و منوی اصلی
/help — همین راهنما
/id — شناسهٔ تلگرام شما

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

export const UNSUPPORTED_TEXT = `برای دیدن راهنما /help را بفرستید.`;

export function unknownCommand(command) {
  return `دستور <code>/${escapeHtml(command)}</code> را نمی‌شناسم.
برای دیدن راهنما /help را بفرستید.`;
}

export function yourIdMessage(userId, admin) {
  const id = userId == null ? 'نامشخص' : userId;
  const role = admin ? '\nنقش شما: مدیر' : '';
  return `شناسهٔ تلگرام شما:\n<code>${escapeHtml(id)}</code>${role}`;
}
