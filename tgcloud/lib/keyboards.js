// Inline keyboards. `callback_data` is capped at 64 bytes and is the only state a
// button carries, so every button encodes a short "<area>:<action>" pair that the
// callback_query handler can route on.

export const CALLBACK_MENU_HELP = 'menu:help';
export const CALLBACK_MENU_ABOUT = 'menu:about';

export function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '📖 راهنما', callback_data: CALLBACK_MENU_HELP }],
      [{ text: 'ℹ️ دربارهٔ ربات', callback_data: CALLBACK_MENU_ABOUT }],
    ],
  };
}
