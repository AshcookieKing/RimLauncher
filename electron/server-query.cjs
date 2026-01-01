const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const SERVER_HOST = '109.248.4.45';
const SERVER_PORT = 2302;
const QUERY_PORT = 2303;
const BOT_STATUS_URL = process.env.RIM_ONLINE_STATUS_URL || 'http://127.0.0.1:8791/api/online';
const LAUNCHER_API_ONLINE_URL =
  process.env.RIM_LAUNCHER_API_ONLINE_URL || 'http://109.248.4.174:5003/api/launcher/online';
const BOT_HTTP_TIMEOUT_MS = 2000;
const API_HTTP_TIMEOUT_MS = 8000;

let cachedFetchServerData = null;
let onlineStatusServerStarted = false;

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

function ensureOnlineStatusServer() {
  if (onlineStatusServerStarted) return;
  const candidates = [
    path.join(process.resourcesPath || '', 'online-bot', 'online-status-server.js'),
    path.join(__dirname, '..', 'bot-manager-python', 'resources', 'online-status-server.js'),
  ];
  for (const modPath of candidates) {
    if (!fs.existsSync(modPath)) continue;
    try {
      const { startOnlineStatusServer } = require(modPath);
      startOnlineStatusServer();
      onlineStatusServerStarted = true;
      return;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') {
        console.error('online-status-server:', err.message || err);
      }
    }
  }
  onlineStatusServerStarted = true;
}

function fetchJson(url, timeoutMs = BOT_HTTP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
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

function mapApiOnlinePayload(data) {
  if (!data || typeof data !== 'object') return null;
  const online = data.online && typeof data.online === 'object' ? data.online : data;
  if (!online || typeof online !== 'object') return null;
  return {
    online: Number(online.online) || 0,
    max_players: Number(online.max_players) || 0,
    status: String(online.status || 'offline').toLowerCase() === 'online' ? 'online' : 'offline',
    server_name: online.server_name || 'StarFront',
    map: online.map || '',
    server_ip: online.server_ip || SERVER_HOST,
    server_port: Number(online.server_port) || SERVER_PORT,
    query_port: QUERY_PORT,
    players: Array.isArray(online.players) ? online.players : [],
    source: 'launcher-api',
    updated_at: Date.now(),
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

function pickBestOnlinePayload(candidates) {
  const list = candidates.filter(Boolean);
  if (!list.length) return offlinePayload('unavailable');

  const online = list.filter((item) => item.status === 'online');
  const pool = online.length ? online : list;

  return pool.sort((a, b) => {
    const score = (item) =>
      (item.status === 'online' ? 1000 : 0) +
      Number(item.online || 0) * 10 +
      (item.source === 'online-bot-http' ? 5 : 0) +
      (item.source === 'online-bot-module' ? 4 : 0) +
      (item.source === 'launcher-api' ? 3 : 0);
    return score(b) - score(a);
  })[0];
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

async function queryViaLauncherApi() {
  const data = await fetchJson(LAUNCHER_API_ONLINE_URL, API_HTTP_TIMEOUT_MS);
  return mapApiOnlinePayload(data);
}

async function resolveOnlineStatus() {
  ensureOnlineStatusServer();

  const [fromHttp, fromModule, fromApi] = await Promise.all([
    queryViaOnlineBotHttp(),
    queryViaBotModule(),
    queryViaLauncherApi(),
  ]);

  return pickBestOnlinePayload([fromHttp, fromModule, fromApi]);
}

function mergeOnlinePayload(apiOnline, localOnline) {
  const apiPayload =
    apiOnline && typeof apiOnline === 'object'
      ? {
          ...apiOnline,
          source: apiOnline.source || 'launcher-api-status',
        }
      : null;
  return pickBestOnlinePayload([localOnline, apiPayload]);
}

module.exports = {
  SERVER_HOST,
  SERVER_PORT,
  QUERY_PORT,
  BOT_STATUS_URL,
  LAUNCHER_API_ONLINE_URL,
  ensureOnlineStatusServer,
  resolveOnlineStatus,
  mergeOnlinePayload,
  mapBotPayload,
  offlinePayload,
};
