// Thin wrappers over the Bot API calls this bot makes repeatedly.
//
// They exist for two reasons: every message is HTML-formatted (so `parse_mode`
// is never forgotten), and an optional keyboard is only attached when there is
// one — passing `reply_markup: undefined` is not the same as omitting it.

import { api } from 'sdk';

export function sendHtml(chatId, html, keyboard) {
  return api.sendMessage(withKeyboard({ chat_id: chatId, text: html, parse_mode: 'HTML' }, keyboard));
}

export function editHtml(chatId, messageId, html, keyboard) {
  return api.editMessageText(
    withKeyboard({ chat_id: chatId, message_id: messageId, text: html, parse_mode: 'HTML' }, keyboard),
  );
}

export function answerCallbackQuery(callbackQueryId, text) {
  return api.answerCallbackQuery({
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

function withKeyboard(payload, keyboard) {
  return keyboard ? { ...payload, reply_markup: keyboard } : payload;
}
