const http = require('http');
const path = require('path');
const fs = require('fs');

const SERVER_HOST = '109.248.4.45';
const SERVER_PORT = 2302;
const QUERY_PORT = 2303;
const BOT_STATUS_URL = process.env.RIM_ONLINE_STATUS_URL || 'http://127.0.0.1:8791/api/online';
const BOT_HTTP_TIMEOUT_MS = 2000;

let cachedFetchServerData = null;

function findBotResourcesDir() {
  const dirs = [
    path.join(__dirname, '..', 'bot-manager-python', 'resources'),
    path.join(process.resourcesPath || '', 'online-bot'),
  ];
  for (const dir of dirs) {
    if (fs.existsSync(path.join(dir, 'commands', 'fetchServerData.js'))) return dir;
  }
  return null;
}

function getBotFetchServerData() {
  if (cachedFetchServerData) return cachedFetchServerData;
  const dir = findBotResourcesDir();
  if (!dir) return null;
  try {
    const modPath = path.join(dir, 'commands', 'fetchServerData.js');
    cachedFetchServerData = require(modPath).fetchServerData;
    return cachedFetchServerData;
  } catch {
    return null;
  }
}

function fetchJson(url, timeoutMs = BOT_HTTP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function mapBotPayload(data, source) {
  if (!data || typeof data !== 'object') return offlinePayload(source);
  const isOnline = String(data.status || '').toLowerCase() === 'online';
  const players = Array.isArray(data.players)
    ? data.players
    : Array.isArray(data.player_list)
      ? data.player_list
      : [];
  return {
    online: Number(data.total_players ?? data.online) || 0,
    max_players: Number(data.max_players) || 0,
    status: isOnline ? 'online' : 'offline',
    server_name: data.server_name || 'StarFront',
    map: data.map || '',
    server_ip: SERVER_HOST,
    server_port: SERVER_PORT,
    query_port: QUERY_PORT,
    players: players.map((p) => ({ name: p.name, duration: p.duration })),
    source,
    updated_at: data.updated_at || Date.now(),
  };
}

function offlinePayload(source = 'offline') {
  return {
    online: 0,
    max_players: 0,
    status: 'offline',
    server_name: 'StarFront',
    server_ip: SERVER_HOST,
    server_port: SERVER_PORT,
    query_port: QUERY_PORT,
    players: [],
    source,
  };
}

async function queryViaOnlineBotHttp() {
  const data = await fetchJson(BOT_STATUS_URL);
  if (!data) return null;
  return mapBotPayload(data, 'online-bot-http');
}

async function queryViaBotModule() {
  const fetchServerData = getBotFetchServerData();
  if (!fetchServerData) return null;
  try {
    const data = await fetchServerData();
    return mapBotPayload(data, 'online-bot-module');
  } catch {
    return null;
  }
}

async function resolveOnlineStatus() {
  const fromHttp = await queryViaOnlineBotHttp();
  if (fromHttp) return fromHttp;

  const fromModule = await queryViaBotModule();
  if (fromModule) return fromModule;

  return offlinePayload('unavailable');
}

function mergeOnlinePayload(_apiOnline, localOnline) {
  if (localOnline && typeof localOnline === 'object') return localOnline;
  return offlinePayload('unavailable');
}

module.exports = {
  SERVER_HOST,
  SERVER_PORT,
  QUERY_PORT,
  BOT_STATUS_URL,
  resolveOnlineStatus,
  mergeOnlinePayload,
  mapBotPayload,
  offlinePayload,
};
