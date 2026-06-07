const crypto = require('crypto');
const http = require('http');
const https = require('https');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { URL } = require('url');
const { BrowserWindow } = require('electron');

const LOCAL_REDIRECT_URI = 'http://127.0.0.1:47832/callback';
const LOCAL_TIMEOUT_MS = 120000;
const SERVER_POLL_INTERVAL_MS = 1000;
const SERVER_POLL_MAX = 120;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const body = options.body || null;
    const req = lib.request(
      url,
      {
        method: options.method || 'GET',
        timeout: options.timeout || 20000,
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
          } catch {
            reject(new Error('Неверный ответ API'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Таймаут'));
    });
    if (body) req.write(body);
    req.end();
  });
}

function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createPkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function isLocalCallbackUrl(rawUrl) {
  return (
    String(rawUrl).startsWith(LOCAL_REDIRECT_URI) ||
    String(rawUrl).includes('127.0.0.1:47832/callback')
  );
}

function isServerCallbackUrl(rawUrl) {
  return String(rawUrl).includes('/api/launcher/discord/oauth/callback');
}

function parseOAuthCallback(rawUrl, expectedState) {
  const u = new URL(rawUrl);
  const err = u.searchParams.get('error');
  if (err) throw new Error(err);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (!code) throw new Error('Нет кода авторизации');
  if (state !== expectedState) throw new Error('Авторизация отменена');
  return code;
}

async function openInBrowser(url, shellModule) {
  const target = String(url || '');
  if (!target) throw new Error('Не удалось открыть браузер');

  if (shellModule?.openExternal) {
    try {
      const ok = await shellModule.openExternal(target);
      if (ok) return;
    } catch {}
  }

  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-Command', `Start-Process '${target.replace(/'/g, "''")}'`],
        { windowsHide: true },
        (err) => (err ? reject(err) : resolve())
      );
    });
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/c', 'start', '', target], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}

function openOAuthWindow(authUrl, { expectedState, parentWindow, allowServerCallback = false }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let authWindow = null;

    const iconPath = path.join(__dirname, '..', 'public', 'assets', 'logo.png');

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (authWindow && !authWindow.isDestroyed()) authWindow.close();
      } catch {}
      fn(value);
    };

    const handleUrl = (rawUrl, prevent) => {
      if (settled || !rawUrl) return false;
      try {
        if (isLocalCallbackUrl(rawUrl)) {
          if (prevent) prevent();
          const code = parseOAuthCallback(rawUrl, expectedState);
          finish(resolve, { mode: 'local', code });
          return true;
        }
        if (allowServerCallback && isServerCallbackUrl(rawUrl)) {
          if (prevent) prevent();
          finish(resolve, { mode: 'server' });
          return true;
        }
      } catch (e) {
        if (prevent) prevent();
        finish(reject, e);
        return true;
      }
      return false;
    };

    authWindow = new BrowserWindow({
      width: 520,
      height: 780,
      show: false,
      autoHideMenuBar: true,
      title: 'Discord — Rim Conflict',
      backgroundColor: '#020810',
      icon: iconPath,
      parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
      modal: Boolean(parentWindow),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const timer = setTimeout(() => {
      finish(reject, new Error('Время ожидания авторизации истекло'));
    }, LOCAL_TIMEOUT_MS);

    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      handleUrl(url);
      return { action: 'deny' };
    });

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (handleUrl(url, () => event.preventDefault())) event.preventDefault();
    });

    authWindow.webContents.on('will-navigate', (event, url) => {
      if (handleUrl(url, () => event.preventDefault())) event.preventDefault();
    });

    authWindow.webContents.on('did-navigate', (_, url) => handleUrl(url));
    authWindow.webContents.on('did-redirect-navigation', (_, url) => handleUrl(url));

    authWindow.once('ready-to-show', () => {
      if (!authWindow.isDestroyed()) authWindow.show();
    });

    authWindow.on('closed', () => {
      if (!settled) finish(reject, new Error('Авторизация отменена'));
    });

    authWindow.loadURL(authUrl).catch((e) => finish(reject, e));
  });
}

async function fetchOAuthConfig(apiBase) {
  const base = (apiBase || '').replace(/\/$/, '');
  const { status, data } = await fetchJson(`${base}/api/launcher/discord/oauth/config`);
  if (status >= 400 || !data?.client_id) {
    throw new Error(data?.error || 'OAuth не настроен на сервере');
  }
  return data;
}

async function exchangeCodeLocal(clientId, code, verifier) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: LOCAL_REDIRECT_URI,
    code_verifier: verifier,
  }).toString();

  const { status, data } = await fetchJson('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    timeout: 20000,
  });
  if (status >= 400 || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Ошибка обмена кода Discord');
  }
  return data.access_token;
}

async function fetchDiscordUser(accessToken) {
  const { status, data } = await fetchJson('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  if (status >= 400 || !data.id) {
    throw new Error('Не удалось получить профиль Discord');
  }
  return data;
}

async function verifyGuildMember(apiBase, discordUserId) {
  const base = (apiBase || '').replace(/\/$/, '');
  const { status, data } = await fetchJson(
    `${base}/api/launcher/discord/verify-member?discord_user_id=${encodeURIComponent(discordUserId)}`,
    { timeout: 12000 }
  );
  if (status >= 400 || !data.success) {
    throw new Error(data?.error || 'Вас нет на сервере Rim Conflict в Discord');
  }
  return data;
}

async function completeDiscordLogin(apiBase, user) {
  let guildWarning = '';
  try {
    await verifyGuildMember(apiBase, user.id);
  } catch (e) {
    guildWarning = e.message || 'Не удалось проверить членство на сервере Discord';
  }
  return {
    discordUserId: String(user.id),
    discordUsername: user.global_name || user.username || String(user.id),
    guildWarning,
  };
}

async function loginWithDiscordLocal(apiBase, shell, parentWindow) {
  const config = await fetchOAuthConfig(apiBase);
  const clientId = String(config.client_id);
  const { verifier, challenge } = createPkce();
  const state = base64Url(crypto.randomBytes(16));

  const authUrl = new URL('https://discord.com/api/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', LOCAL_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'identify');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const authUrlStr = authUrl.toString();

  const windowResult = await openOAuthWindow(authUrlStr, {
    expectedState: state,
    parentWindow,
    allowServerCallback: false,
  });

  const accessToken = await exchangeCodeLocal(clientId, windowResult.code, verifier);
  const user = await fetchDiscordUser(accessToken);
  const login = await completeDiscordLogin(apiBase, user);

  return {
    ...login,
    redirectUriUsed: LOCAL_REDIRECT_URI,
    clientId,
    method: 'window',
  };
}

async function pollServerOAuth(base, state) {
  for (let i = 0; i < SERVER_POLL_MAX; i += 1) {
    if (i > 0) await sleep(SERVER_POLL_INTERVAL_MS);
    const pollRes = await fetchJson(
      `${base}/api/launcher/discord/oauth/poll?state=${encodeURIComponent(state)}`,
      { timeout: 12000 }
    );
    const data = pollRes.data || {};
    if (data.status === 'ok' && data.discord_user_id) {
      return {
        discordUserId: String(data.discord_user_id),
        discordUsername: data.discord_username || String(data.discord_user_id),
      };
    }
    if (data.status === 'error') {
      throw new Error(data.error || 'Ошибка авторизации Discord');
    }
    if (data.status === 'missing') {
      throw new Error(data.error || 'Сессия OAuth не найдена на сервере');
    }
  }
  throw new Error('Время ожидания авторизации истекло');
}

async function loginWithDiscordServer(apiBase, shell, parentWindow) {
  const base = (apiBase || '').replace(/\/$/, '');
  const startRes = await fetchJson(`${base}/api/launcher/discord/oauth/start?source=launcher`);
  if (startRes.status >= 400 || !startRes.data?.auth_url) {
    throw new Error(startRes.data?.error || 'Не удалось начать вход через Discord');
  }

  const { auth_url: authUrl, state, redirect_uri: redirectUri } = startRes.data;

  await openOAuthWindow(authUrl, {
    expectedState: state,
    parentWindow,
    allowServerCallback: true,
  });

  const polled = await pollServerOAuth(base, state);
  return {
    ...polled,
    redirectUriUsed: redirectUri,
    method: 'server',
    guildWarning: '',
  };
}

async function getDiscordOAuthSetup(apiBase) {
  const config = await fetchOAuthConfig(apiBase);
  return {
    clientId: config.client_id,
    redirectUriServer: config.redirect_uri || config.redirect_uri_server || '',
    redirectUriLocal: LOCAL_REDIRECT_URI,
    instructions:
      'Discord Developer Portal → ваше приложение → OAuth2 → Redirects. ' +
      'Добавьте ОБА адреса (копируйте точно):',
  };
}

function shouldTryServerFallback(err) {
  const msg = String(err?.message || err).toLowerCase();
  return (
    msg.includes('отменена') ||
    msg.includes('timeout') ||
    msg.includes('таймаут') ||
    msg.includes('истекло') ||
    msg.includes('redirect') ||
    msg.includes('invalid_request') ||
    msg.includes('обмена') ||
    msg.includes('47832') ||
    msg.includes('eaddrinuse')
  );
}

async function formatOAuthError(localErr, serverErr) {
  const detail = serverErr?.message || localErr?.message || localErr;
  console.error('Discord OAuth failed:', localErr, serverErr);
  return `Не удалось войти через Discord. ${detail || 'Попробуйте ещё раз.'}`;
}

async function loginWithDiscord(apiBase, shell, parentWindow) {
  const mode = (process.env.RIM_DISCORD_OAUTH_MODE || 'auto').toLowerCase();

  if (mode === 'server') {
    return loginWithDiscordServer(apiBase, shell, parentWindow);
  }

  if (mode === 'local') {
    try {
      return await loginWithDiscordLocal(apiBase, shell, parentWindow);
    } catch (localErr) {
      if (shouldTryServerFallback(localErr)) {
        return loginWithDiscordServer(apiBase, shell, parentWindow);
      }
      throw localErr;
    }
  }

  try {
    return await loginWithDiscordLocal(apiBase, shell, parentWindow);
  } catch (localErr) {
    try {
      return loginWithDiscordServer(apiBase, shell, parentWindow);
    } catch (serverErr) {
      throw new Error(await formatOAuthError(localErr, serverErr));
    }
  }
}

module.exports = { loginWithDiscord, getDiscordOAuthSetup, LOCAL_REDIRECT_URI };
