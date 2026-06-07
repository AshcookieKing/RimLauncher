const https = require('https');
const http = require('http');

const DEFAULT_API = 'http://109.248.4.174:5003';

function fetchJson(url, timeoutMs = 30000, options = {}) {
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

async function fetchLauncherStatus(discordUserId, apiBaseUrl = DEFAULT_API, playerName = '') {
  const base = apiBase(apiBaseUrl);
  const params = new URLSearchParams();
  if (discordUserId) params.set('discord_user_id', String(discordUserId));
  if (playerName) params.set('player_name', String(playerName));
  const q = params.toString() ? `?${params.toString()}` : '';
  try {
    return await fetchJson(`${base}/api/launcher/status${q}`);
  } catch (e) {
    return {
      success: false,
      error: e.message,
      online: { online: 0, max_players: 0, status: 'offline', server_ip: '109.248.4.45', server_port: 2302 },
      profile: { display_name: 'Гость', rank: '—', faction: '—', role: '—', rim_points: 0 },
      news: [],
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

async function postJson(path, payload, apiBaseUrl = DEFAULT_API) {
  const base = apiBase(apiBaseUrl);
  return fetchJson(`${base}${path}`, 45000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function getJson(path, apiBaseUrl = DEFAULT_API) {
  return fetchJson(`${apiBase(apiBaseUrl)}${path}`);
}

async function fetchEvents(apiBaseUrl) {
  return getJson('/api/launcher/events', apiBaseUrl);
}

async function fetchGuide(apiBaseUrl) {
  return getJson('/api/launcher/guide', apiBaseUrl);
}

async function redeemBoosty({ discordUserId, code }, apiBaseUrl) {
  return postJson('/api/launcher/redeem', { discord_user_id: discordUserId, code }, apiBaseUrl);
}

async function createTicket(payload, apiBaseUrl) {
  return postJson('/api/launcher/ticket/create', payload, apiBaseUrl);
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
  return postJson('/api/launcher/suggestion', payload, apiBaseUrl);
}

async function fetchActiveTicket(discordUserId, apiBaseUrl) {
  return getJson(`/api/launcher/ticket/active?discord_user_id=${encodeURIComponent(discordUserId)}`, apiBaseUrl);
}

async function createDonation(payload, apiBaseUrl) {
  return postJson('/api/launcher/donate/create', payload, apiBaseUrl);
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
  return postJson('/api/launcher/unit/apply', payload, apiBaseUrl);
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
  return postJson(`/api/launcher/unit/${appId}/withdraw`, payload, apiBaseUrl);
}

async function cancelDonation(orderId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/donate/${orderId}/cancel`, payload, apiBaseUrl);
}

async function checkDonationPayment(orderId, payload, apiBaseUrl) {
  return postJson(`/api/launcher/donate/${orderId}/check`, payload, apiBaseUrl);
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

async function claimPlaytimeRimPoint(discordUserId, apiBaseUrl) {
  const base = apiBase(apiBaseUrl);
  return new Promise((resolve) => {
    const body = JSON.stringify({ discord_user_id: discordUserId });
    const req = http.request(
      `${base}/api/launcher/rim-points/playtime`,
      {
        method: 'POST',
        timeout: 15000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = data.trim() ? JSON.parse(data) : {};
            if (res.statusCode === 429) {
              resolve({ success: false, ...json });
              return;
            }
            if (res.statusCode >= 400) {
              const err = json.error || (res.statusCode === 404 ? 'endpoint_missing' : `API ${res.statusCode}`);
              resolve({ success: false, error: err, statusCode: res.statusCode });
              return;
            }
            resolve(json);
          } catch {
            resolve({ success: false, error: 'Неверный ответ API' });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Таймаут API' });
    });
    req.write(body);
    req.end();
  });
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
};
