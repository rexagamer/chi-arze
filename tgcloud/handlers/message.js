// handlers/message.js — every incoming message.
//
// The platform calls this with the `Message` payload. Commands are routed here;
// plain text will become product search once that flow lands, so today a message
// that is not a known command gets the help pointer rather than silence.

import { isAdmin } from '../lib/config.js';
import { mainMenu } from '../lib/keyboards.js';
import {
  ABOUT,
  HELP,
  NON_TEXT,
  START,
  UNSUPPORTED_TEXT,
  unknownCommand,
  yourIdMessage,
} from '../lib/text.js';
import { sendHtml } from '../lib/telegram.js';

// A Map, not a plain object: "/constructor" must not resolve to
// Object.prototype.constructor and get invoked.
const COMMANDS = new Map([
  ['start', (message) => sendHtml(message.chat.id, START, mainMenu())],
  ['help', (message) => sendHtml(message.chat.id, HELP, mainMenu())],
  ['about', (message) => sendHtml(message.chat.id, ABOUT, mainMenu())],
  ['id', (message) => sendHtml(message.chat.id, yourIdMessage(message.from?.id, isAdmin(message.from?.id)))],
]);

/** "/help@ChiArzehBot now" → "help"; anything that is not a command → null. */
function parseCommand(text) {
  if (typeof text !== 'string' || text[0] !== '/') return null;
  const name = text.split(/\s+/)[0].slice(1).split('@')[0].toLowerCase();
  return name || null;
}

export default async function (message) {
  const command = parseCommand(message.text);

  if (command) {
    const run = COMMANDS.get(command);
    if (run) return run(message);
    return sendHtml(message.chat.id, unknownCommand(command), mainMenu());
  }

  return sendHtml(
    message.chat.id,
    message.text == null ? NON_TEXT : UNSUPPORTED_TEXT,
    mainMenu(),
  );
}
