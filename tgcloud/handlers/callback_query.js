// handlers/callback_query.js — inline keyboard presses.
//
// The platform calls this with the `CallbackQuery` payload. Every callback is
// answered, even one we do not recognise: the answer is what dismisses the
// loading spinner in the user's client.

import {
  CALLBACK_MENU_ABOUT,
  CALLBACK_MENU_HELP,
  mainMenu,
  parseCatalogPageCallback,
} from '../lib/keyboards.js';
import { ABOUT, HELP } from '../lib/text.js';
import { answerCallbackQuery, editHtml, sendHtml } from '../lib/telegram.js';
import { catalogPageView } from '../lib/views.js';

// Menu buttons that only swap the text of the current message.
const MENU_VIEWS = new Map([
  [CALLBACK_MENU_HELP, { text: HELP, keyboard: mainMenu }],
  [CALLBACK_MENU_ABOUT, { text: ABOUT, keyboard: mainMenu }],
]);

export default async function (query) {
  await answerCallbackQuery(query.id);

  const chatId = query.message?.chat?.id;
  if (!chatId) return;

  const view = await buildView(query.data);
  if (!view) return;

  const messageId = query.message?.message_id;
  if (messageId) {
    try {
      await editHtml(chatId, messageId, view.text, view.keyboard);
      return;
    } catch (error) {
      // The original message can be too old to edit, or already gone.
      console.warn('could not edit the menu message, sending a new one', error?.description ?? error);
    }
  }
  await sendHtml(chatId, view.text, view.keyboard);
}

async function buildView(data) {
  const menu = MENU_VIEWS.get(data);
  if (menu) return { text: menu.text, keyboard: menu.keyboard() };

  const page = parseCatalogPageCallback(data);
  if (page == null) return null;

  try {
    return await catalogPageView(page);
  } catch (error) {
    // A database failure must not leave the button spinning.
    console.error('could not render the catalog page', error?.description ?? error);
    return null;
  }
}
