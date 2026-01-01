#!/usr/bin/env node
/** Копирует DISCORD_TOKEN из text_bot/.env в electron/bot-config.cjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = process.env.TEXT_BOT_ENV || path.join(root, '..', 'd2', 'text_bot', '.env');
const outPath = path.join(root, 'electron', 'bot-config.cjs');

function readEnv(file) {
  const map = {};
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

const env = readEnv(envPath);
const token = env.DISCORD_TOKEN;
const expected = env.EXPECTED_BOT_USER_ID || '1538496937102155826';
if (!token) {
  console.error('DISCORD_TOKEN не найден в', envPath);
  process.exit(1);
}

function tokenUserId(t) {
  const part = String(t).split('.')[0];
  const pad = '='.repeat((4 - (part.length % 4)) % 4);
  return Buffer.from(part + pad, 'base64').toString('utf8');
}

const actual = tokenUserId(token);
if (actual !== expected) {
  console.warn(`DISCORD_TOKEN — бот ${actual}, в .env указан ${expected} (записываем токен как есть)`);
}

const content = `/** StarFront Discord feed — auto-generated, do not commit token to public repo */
module.exports = {
  guildId: '1479125946517946451',
  newsChannelIds: ['1540672138904604692'],
  eventsChannelId: '1479273642645786779',
  announceChannelId: '1479273642645786779',
  suggestionForumId: '1479290123630940363',
  botToken: ${JSON.stringify(token)},
};
`;

fs.writeFileSync(outPath, content, 'utf8');
console.log('Wrote', outPath);
