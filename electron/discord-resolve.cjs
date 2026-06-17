const https = require('https');
const http = require('http');

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
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Неверный ответ API'));
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

async function resolveDiscordUserId(playerName, apiBase, fallbackNames = []) {
  const base = (apiBase || '').replace(/\/$/, '');
  const names = [playerName, ...(fallbackNames || [])]
    .map((n) => String(n || '').trim())
    .filter((n) => n && n !== '—');
  const unique = [...new Set(names)];
  if (!unique.length) return null;

  const params = new URLSearchParams();
  params.set('player_name', unique[0]);
  if (unique.length > 1) params.set('fallback_names', unique.slice(1).join(','));

  try {
    const res = await fetchJson(`${base}/api/launcher/resolve-user?${params.toString()}`, 15000);
    return res.discord_user_id ? String(res.discord_user_id) : null;
  } catch {
    return null;
  }
}

module.exports = { resolveDiscordUserId };
