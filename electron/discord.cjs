const https = require('https');
const http = require('http');
const directFeed = require('./discord-direct.cjs');

const DEFAULT_API = 'http://109.248.4.174:5003';
const API_GET_TIMEOUT_MS = 14000;
const API_POST_TIMEOUT_MS = 20000;

let lastNewsCache = [];
let lastHolonetCache = [];

function preferList(primary, fallback, cache) {
  if (Array.isArray(primary) && primary.length) {
    cache.splice(0, cache.length, ...primary);
    return primary;
  }
  if (Array.isArray(fallback) && fallback.length) {
    cache.splice(0, cache.length, ...fallback);
    return fallback;
  }
  return Array.isArray(cache) && cache.length ? [...cache] : [];
}

function fetchJson(url, timeoutMs = API_GET_TIMEOUT_MS, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(
      url,
      { method: options.method || 'GET', timeout: timeoutMs, headers: options.headers || {} },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200) || res.statusMessage}`));
            return;
          }
          if (!data.trim()) {
            reject(new Error('Пустой ответ API — перезапустите бота на сервере'));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Неверный ответ API: ${data.slice(0, 160)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Таймаут API'));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function apiBase(base) {
  return (base || DEFAULT_API).replace(/\/$/, '');
}

async function fetchHolonetFeed(apiBaseUrl) {
  const base = apiBase(apiBaseUrl);
  try {
    const data = await fetchJson(`${base}/api/launcher/holonet`, 12000);
    return preferList(data?.holonet, null, lastHolonetCache);
  } catch {
    const direct = await directFeed.fetchHolonetDirect(true).catch(() => []);
    return preferList(direct, null, lastHolonetCache);
  }
}

async function fetchNewsFeed(apiBaseUrl) {
  const base = apiBase(apiBaseUrl);
  try {
    const data = await fetchJson(`${base}/api/launcher/news`, 12000);
    return preferList(data?.news, null, lastNewsCache);
  } catch {
    const direct = await directFeed.fetchNewsDirect(true).catch(() => []);
    return preferList(direct, null, lastNewsCache);
  }
}

async function fetchLauncherStatus(discordUserId, apiBaseUrl = DEFAULT_API, playerName = '', clientId = '') {
  const base = apiBase(apiBaseUrl);
  const params = new URLSearchParams();
  if (discordUserId) params.set('discord_user_id', String(discordUserId));
  if (playerName) params.set('player_name', String(playerName));
  if (clientId) params.set('client_id', String(clientId));
  const q = params.toString() ? `?${params.toString()}` : '';
  const directNewsPromise = directFeed.fetchNewsDirect().catch(() => []);
  const directHolonetPromise = directFeed.fetchHolonetDirect().catch(() => []);
  const offline = {
    success: false,
    online: { online: 0, max_players: 0, status: 'offline', server_ip: '109.248.4.45', server_port: 2302 },
    profile: { display_name: 'Гость', rank: '—', faction: '—', role: '—', rim_points: 0 },
    news: [],
    holonet: [],
  };
  try {
    const data = await fetchJson(`${base}/api/launcher/status${q}`, API_GET_TIMEOUT_MS);
    const [directNews, directHolonet] = await Promise.all([directNewsPromise, directHolonetPromise]);
    data.news = preferList(data.news, directNews, lastNewsCache);
    data.holonet = preferList(data.holonet, directHolonet, lastHolonetCache);

    // Если status не отдал ленты — добираем отдельными эндпоинтами
    if (!data.news?.length || !data.holonet?.length) {
      const [apiNews, apiHolonet] = await Promise.all([
        data.news?.length ? Promise.resolve(data.news) : fetchNewsFeed(apiBaseUrl),
        data.holonet?.length ? Promise.resolve(data.holonet) : fetchHolonetFeed(apiBaseUrl),
      ]);
      data.news = preferList(apiNews, data.news, lastNewsCache);
      data.holonet = preferList(apiHolonet, data.holonet, lastHolonetCache);
    }
    return data;
  } catch (e) {
    const [directNews, directHolonet, apiNews, apiHolonet] = await Promise.all([
      directNewsPromise,
      directHolonetPromise,
      fetchNewsFeed(apiBaseUrl),
      fetchHolonetFeed(apiBaseUrl),
    ]);
    const msg = e.message || 'Ошибка API';
    const apiDown = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|connect E|10061|Таймаут|timeout|недоступен/i.test(msg);
    return {
      ...offline,
      error: apiDown
        ? 'API бота недоступен (109.248.4.174:5003) — запустите text_bot на сервере'
        : msg,
      news: preferList(apiNews, directNews, lastNewsCache),
      holonet: preferList(apiHolonet, directHolonet, lastHolonetCache),
      api_offline: apiDown,
    };
  }
}

async function fetchLauncherOnline(apiBaseUrl = DEFAULT_API) {
  const base = apiBase(apiBaseUrl);
  try {
    return await fetchJson(`${base}/api/launcher/online`, 8000);
  } catch {
    return { success: false, online: { online: 0, max_players: 0, status: 'offline' } };
  }
}

async function postJson(path, payload, apiBaseUrl = DEFAULT_API, timeoutMs = API_POST_TIMEOUT_MS) {
  const base = apiBase(apiBaseUrl);
  return fetchJson(`${base}${path}`, timeoutMs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function safePost(path, payload, apiBaseUrl = DEFAULT_API) {
  try {
    return await postJson(path, payload, apiBaseUrl);
  } catch (e) {
    return { success: false, error: e.message || 'Ошибка API' };
  }
}

async function safeGet(path, apiBaseUrl = DEFAULT_API, timeoutMs = API_GET_TIMEOUT_MS) {
  try {
    return await getJson(path, apiBaseUrl, timeoutMs);
  } catch (e) {
    return { success: false, error: e.message || 'Ошибка API' };
  }
}

async function getJson(path, apiBaseUrl = DEFAULT_API, timeoutMs = API_GET_TIMEOUT_MS) {
  return fetchJson(`${apiBase(apiBaseUrl)}${path}`, timeoutMs);
}

async function fetchEvents(apiBaseUrl) {
  const directPromise = directFeed.fetchEventsDirect().catch(() => null);
  try {
    const data = await getJson('/api/launcher/events', apiBaseUrl, API_GET_TIMEOUT_MS);
    if (data?.channel_posts?.length) return data;
    const direct = await directPromise;
    return direct ? { success: true, ...direct } : data;
  } catch {
    const direct = await directPromise;
    return direct ? { success: true, ...direct } : { success: false, channel_posts: [], live: [] };
  }
}

async function fetchGuide(apiBaseUrl) {
  return getJson('/api/launcher/guide', apiBaseUrl);
}

async function redeemBoosty({ discordUserId, code }, apiBaseUrl) {
  return postJson('/api/launcher/redeem', { discord_user_id: discordUserId, code }, apiBaseUrl);
}

async function createTicket(payload, apiBaseUrl) {
  return safePost('/api/launcher/ticket/create', payload, apiBaseUrl);
}

async function fetchTicketMessages(ticketId, apiBaseUrl) {
  return getJson(`/api/launcher/ticket/${ticketId}/messages`, apiBaseUrl);
}

async function sendTicketMessage(ticketId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/ticket/${ticketId}/message`, payload, apiBaseUrl);
}

async function closeTicket(ticketId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/ticket/${ticketId}/close`, payload, apiBaseUrl);
}

async function rateTicket(ticketId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/ticket/${ticketId}/rate`, payload, apiBaseUrl);
}

async function fetchSupportOnline(apiBaseUrl) {
  return getJson('/api/launcher/support/online', apiBaseUrl);
}

async function submitSuggestion(payload, apiBaseUrl) {
  return safePost('/api/launcher/suggestion', payload, apiBaseUrl);
}

async function fetchActiveTicket(discordUserId, apiBaseUrl) {
  return getJson(`/api/launcher/ticket/active?discord_user_id=${encodeURIComponent(discordUserId)}`, apiBaseUrl);
}

async function createDonation(payload, apiBaseUrl) {
  return safePost('/api/launcher/donate/create', payload, apiBaseUrl);
}

async function getActiveDonation(discordUserId, apiBaseUrl) {
  return getJson(`/api/launcher/donate/active?discord_user_id=${encodeURIComponent(discordUserId)}`, apiBaseUrl);
}

async function fetchDonationMessages(orderId, apiBaseUrl) {
  return getJson(`/api/launcher/donate/${orderId}/messages`, apiBaseUrl);
}

async function donationSend(orderId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/donate/${orderId}/message`, payload, apiBaseUrl);
}

async function fetchUnitList(apiBaseUrl) {
  return getJson('/api/launcher/unit/list', apiBaseUrl);
}

async function fetchActiveUnitApplication(opts, apiBaseUrl) {
  if (typeof opts === 'string' || typeof opts === 'number') {
    opts = { discordUserId: opts };
  }
  const params = new URLSearchParams();
  if (opts?.appId) params.set('app_id', String(opts.appId));
  if (opts?.discordUserId) params.set('discord_user_id', String(opts.discordUserId));
  if (opts?.nick) params.set('nick', opts.nick);
  if (opts?.unitId) params.set('unit_id', opts.unitId);
  const qs = params.toString();
  return getJson(`/api/launcher/unit/active${qs ? `?${qs}` : ''}`, apiBaseUrl);
}

async function createUnitApplication(payload, apiBaseUrl) {
  return safePost('/api/launcher/unit/apply', payload, apiBaseUrl);
}

async function fetchUnitApplicationMessages(appId, discordUserId, apiBaseUrl) {
  return getJson(
    `/api/launcher/unit/${appId}/messages?discord_user_id=${encodeURIComponent(discordUserId)}`,
    apiBaseUrl
  );
}

async function sendUnitApplicationMessage(appId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/unit/${appId}/message`, payload, apiBaseUrl);
}

async function withdrawUnitApplication(appId, payload, apiBaseUrl) {
  return safePost(`/api/launcher/unit/${appId}/withdraw`, payload, apiBaseUrl);
}

async function cancelDonation(orderId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/donate/${orderId}/cancel`, payload, apiBaseUrl);
}

async function checkDonationPayment(orderId, payload, apiBaseUrl) {
  return safePost(`/api/launcher/donate/${orderId}/check`, payload, apiBaseUrl);
}

async function fetchActiveLeaveRequest(discordUserId, apiBaseUrl) {
  return getJson(`/api/launcher/leave/active?discord_user_id=${encodeURIComponent(discordUserId)}`, apiBaseUrl);
}

async function createLeaveRequest(payload, apiBaseUrl) {
  return postJson('/api/launcher/leave/create', payload, apiBaseUrl);
}

async function sendLeaveMessage(reqId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/leave/${reqId}/message`, payload, apiBaseUrl);
}

async function submitUnitRoleRequest(appId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/unit/${appId}/role-request`, payload, apiBaseUrl);
}

function parsePlaytimeResponse(res, data) {
  try {
    const json = data.trim() ? JSON.parse(data) : {};
    if (res.statusCode === 429) {
      return { success: false, ...json };
    }
    if (res.statusCode >= 400) {
      const err = json.error || (res.statusCode === 404 ? 'endpoint_missing' : `Rim API ${res.statusCode}`);
      return { success: false, error: err, statusCode: res.statusCode };
    }
    return json;
  } catch {
    return { success: false, error: 'Неверный ответ Rim API' };
  }
}

function postPlaytimeClaim(path, payload, apiBaseUrl) {
  const base = apiBase(apiBaseUrl);
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = http.request(
      `${base}${path}`,
      {
        method: 'POST',
        timeout: 15000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(parsePlaytimeResponse(res, data)));
      }
    );
    req.on('error', (e) => resolve({ success: false, error: e.message || 'Ошибка Rim API' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Таймаут Rim API' });
    });
    req.write(body);
    req.end();
  });
}

async function claimPlaytimeRimPoint(discordUserId, apiBaseUrl) {
  const uid = String(discordUserId || '').trim();
  if (!uid) return { success: false, error: 'not_linked' };

  const primary = await postPlaytimeClaim(
    '/api/launcher/rim-points/playtime',
    { discord_user_id: uid },
    apiBaseUrl
  );
  if (primary.success || primary.error === 'too_soon') return primary;
  if (primary.statusCode !== 404 && primary.error !== 'endpoint_missing') return primary;

  return postPlaytimeClaim(
    '/api/launcher/redeem',
    { discord_user_id: uid, type: 'playtime' },
    apiBaseUrl
  );
}

async function submitCharacterVerification(payload, apiBaseUrl) {
  return safePost('/api/launcher/character/verify', payload, apiBaseUrl);
}

async function getCharacterVerification(discordUserId, apiBaseUrl) {
  const qs = discordUserId ? `?discord_user_id=${encodeURIComponent(discordUserId)}` : '';
  return getJson(`/api/launcher/character/verification${qs}`, apiBaseUrl);
}

async function selectCharacterVerification(payload, apiBaseUrl) {
  return safePost('/api/launcher/character/select', payload, apiBaseUrl);
}

async function cancelCharacterVerification(payload, apiBaseUrl) {
  return safePost('/api/launcher/character/cancel', payload, apiBaseUrl);
}

async function registerLauncherClient(clientId, discordUserId, apiBaseUrl) {
  if (!clientId) return { success: false, error: 'no_client_id' };
  return safePost(
    '/api/launcher/client/register',
    {
      client_id: String(clientId),
      discord_user_id: discordUserId ? String(discordUserId) : '',
    },
    apiBaseUrl
  );
}

module.exports = {
  DEFAULT_API,
  fetchLauncherStatus,
  fetchLauncherOnline,
  fetchEvents,
  fetchGuide,
  createTicket,
  fetchTicketMessages,
  sendTicketMessage,
  closeTicket,
  rateTicket,
  fetchSupportOnline,
  submitSuggestion,
  fetchActiveTicket,
  createDonation,
  getActiveDonation,
  fetchDonationMessages,
  donationSend,
  cancelDonation,
  checkDonationPayment,
  fetchActiveLeaveRequest,
  createLeaveRequest,
  sendLeaveMessage,
  fetchUnitList,
  fetchActiveUnitApplication,
  createUnitApplication,
  fetchUnitApplicationMessages,
  sendUnitApplicationMessage,
  withdrawUnitApplication,
  submitUnitRoleRequest,
  claimPlaytimeRimPoint,
  submitCharacterVerification,
  getCharacterVerification,
  selectCharacterVerification,
  cancelCharacterVerification,
  registerLauncherClient,
};
