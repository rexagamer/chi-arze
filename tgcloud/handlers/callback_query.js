// handlers/callback_query.js — inline keyboard presses.
//
// The platform calls this with the `CallbackQuery` payload (see
// docs/tgcloud-sdk.md: a handler's default export receives the update's payload).
// Every press is answered, because `answerCallbackQuery` is what dismisses the
// loading spinner in the user's client — including presses we refuse.
//
// Callback data is never trusted. `parseCallbackData` proves only the shape; every
// press is then re-checked against the database (does the product or report still
// exist?) and against the user (may *this* person do it?). Approving or rejecting
// is reserved for administrators and is checked here, again, independently of the
// command router — a forged `mod:approve:1` from a normal user changes nothing.

import { isAdmin } from '../lib/config.js';
import { mainMenu, parseCallbackData } from '../lib/keyboards.js';
import { approveReport, flagReport, rejectReport } from '../lib/moderation.js';
import {
  ABOUT,
  HELP,
  TOAST_APPROVED,
  TOAST_FAILED,
  TOAST_FLAGGED,
  TOAST_NOT_ADMIN,
  TOAST_PRODUCT_MISSING,
  TOAST_REJECTED,
  TOAST_REPORT_MISSING,
  TOAST_STALE_BUTTON,
  decisionMessage,
  reportErrorText,
} from '../lib/text.js';
import { answerCallbackQuery, editHtml, sendHtml } from '../lib/telegram.js';
import { ensureUser } from '../lib/users.js';
import {
  catalogPageView,
  inspectView,
  pendingView,
  productView,
  torobSellersView,
} from '../lib/views.js';

// Menu buttons that only swap the text of the current message.
const MENU_VIEWS = new Map([
  ['help', HELP],
  ['about', ABOUT],
]);

export default async function (query) {
  let toast = null;
  try {
    toast = await handle(query);
  } catch (error) {
    // The user gets one short sentence; the detail goes to the logs. Nothing is
    // swallowed: a database or Bot API failure is worth seeing in `tgcloud run`.
    console.error(
      'callback failed',
      { data: typeof query?.data === 'string' ? query.data : null },
      error?.code ?? '',
      error?.description ?? error?.message ?? error,
    );
    toast = TOAST_FAILED;
  }

  await safeAnswer(query?.id, toast);
}

/** Answer without letting a stale query id fail the whole invocation. */
async function safeAnswer(callbackQueryId, text) {
  if (!callbackQueryId) return;
  try {
    await answerCallbackQuery(callbackQueryId, text ?? undefined);
  } catch (error) {
    console.warn('could not answer a callback query', error?.description ?? error?.message ?? error);
  }
}

/** Do the work; returns the toast to answer with, if any. */
async function handle(query) {
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  // A callback from an inline-mode message has no chat to render into.
  if (!chatId) return null;

  const action = parseCallbackData(query?.data);
  if (!action) return TOAST_STALE_BUTTON;

  switch (action.kind) {
    case 'menu': {
      const text = MENU_VIEWS.get(action.view);
      if (!text) return TOAST_STALE_BUTTON;
      return render(chatId, messageId, { text, keyboard: mainMenu() });
    }

    case 'catalogPage':
      return render(chatId, messageId, await catalogPageView(action.page));

    case 'product': {
      const view = await productView(action.id);
      // The catalog changed under a stale button: say so instead of showing a
      // dead screen.
      if (!view) return TOAST_PRODUCT_MISSING;
      return render(chatId, messageId, view);
    }

    case 'flag':
      return flag(action.id, query.from);

    // A Torob product key is re-validated by the parser and again by
    // `sellerOffers`; the button carries nothing else, so there is nothing to
    // trust beyond "this UUID came from a search we served".
    case 'torobSellers':
      return render(chatId, messageId, await torobSellersView(action.prk));

    case 'moderate':
      return moderate(chatId, messageId, action, query.from);

    case 'queue': {
      if (!isAdmin(query.from?.id)) return TOAST_NOT_ADMIN;
      return render(chatId, messageId, await pendingView());
    }

    default:
      return TOAST_STALE_BUTTON;
  }
}

/**
 * Flag a published report. `flagReport` owns the rules (only approved reports,
 * never your own, once per person); this only resolves who is pressing.
 */
async function flag(reportId, from) {
  const user = await ensureUser(from);
  if (!user) return TOAST_FAILED;

  const result = await flagReport(reportId, user.id);
  if (result.ok) return TOAST_FLAGGED;
  if (result.error === 'REPORT_NOT_FOUND') return TOAST_REPORT_MISSING;
  // The refusals are one short sentence each, so they fit a callback toast.
  return reportErrorText(result);
}

/**
 * Approve or reject from a button. Authorisation is checked before anything is
 * read or written, and `decide` re-checks the report's state, so a second press
 * on a stale button changes nothing.
 *
 * The screen is then redrawn as that report's detail: it is the same view whether
 * the press came from the queue or from `/inspect`, and it shows the outcome.
 */
async function moderate(chatId, messageId, action, from) {
  const reviewerTgId = from?.id;
  if (!isAdmin(reviewerTgId)) return TOAST_NOT_ADMIN;

  const result =
    action.action === 'approve'
      ? await approveReport(action.id, reviewerTgId)
      : await rejectReport(action.id, reviewerTgId, null);

  const view = await inspectView(action.id);
  if (view) {
    await render(chatId, messageId, view);
  } else {
    // The report vanished between the button and the press.
    await render(chatId, messageId, await pendingView());
  }

  if (result.ok) return action.action === 'approve' ? TOAST_APPROVED : TOAST_REJECTED;
  return decisionMessage(result, { action: action.action, reportId: action.id });
}

/**
 * Show a screen: edit the message the button belongs to, or send a new one when
 * that is not possible. Editing fails routinely (the message is too old, was
 * deleted, or already shows exactly this), and a stale button must not leave the
 * user staring at an unchanged screen.
 */
async function render(chatId, messageId, view) {
  if (!messageId) {
    await sendHtml(chatId, view.text, view.keyboard);
    return null;
  }

  try {
    await editHtml(chatId, messageId, view.text, view.keyboard);
    return null;
  } catch (error) {
    // "message is not modified" means the screen is already correct.
    if (error?.code === 400 && /not modified/i.test(error?.description ?? '')) return null;
    if (error?.code === 400) {
      await sendHtml(chatId, view.text, view.keyboard);
      return null;
    }
    throw error;
  }
}
