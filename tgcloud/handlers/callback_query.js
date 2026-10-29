// handlers/callback_query.js — inline keyboard presses.
//
// The platform calls this with the `CallbackQuery` payload. Every callback is
// answered, even one we do not recognise: the answer is what dismisses the
// loading spinner in the user's client.

import { CALLBACK_MENU_ABOUT, CALLBACK_MENU_HELP, mainMenu } from '../lib/keyboards.js';
import { ABOUT, HELP } from '../lib/text.js';
import { answerCallbackQuery, editHtml, sendHtml } from '../lib/telegram.js';

// A Map, not a plain object, so an unexpected `data` value can never resolve to
// something inherited from Object.prototype.
const VIEWS = new Map([
  [CALLBACK_MENU_HELP, HELP],
  [CALLBACK_MENU_ABOUT, ABOUT],
]);

export default async function (query) {
  await answerCallbackQuery(query.id);

  const text = VIEWS.get(query.data);
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!text || !chatId) return;

  const keyboard = mainMenu();
  if (messageId) {
    try {
      await editHtml(chatId, messageId, text, keyboard);
      return;
    } catch (error) {
      // The original message can be too old to edit, or already gone.
      console.warn('could not edit the menu message, sending a new one', error?.description ?? error);
    }
  }
  await sendHtml(chatId, text, keyboard);
}
