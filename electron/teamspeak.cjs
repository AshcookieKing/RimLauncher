const { execSync, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const os = require('os');

const TS_SERVER = 'StarFront';
const TS_SERVER_FALLBACK = '185.104.249.127';
const TS_PORT = 10026;
const TS_PASSWORD = 'StarFront';

const TS3_CLIENT_PATHS = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'TeamSpeak 3 Client', 'ts3client_win64.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'TeamSpeak 3 Client', 'ts3client.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'TeamSpeak 3 Client', 'ts3client_win64.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'TeamSpeak 3 Client', 'ts3client.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'TeamSpeak 3 Client', 'ts3client_win64.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'TeamSpeak 3 Client', 'ts3client.exe'),
  path.join(process.env.APPDATA || '', 'Local', 'Programs', 'TeamSpeak 3 Client', 'ts3client_win64.exe'),
  path.join(process.env.APPDATA || '', 'Local', 'Programs', 'TeamSpeak 3 Client', 'ts3client.exe'),
];

const TS_INSTALLER_CANDIDATES = [
  path.join(os.homedir(), 'Downloads', 'TeamSpeak_Client_(64bit)_v3.3.0-22604.exe'),
  path.join(os.homedir(), 'Downloads', 'TeamSpeak_Client_(64bit)_v3.5.1 (1) (1).exe'),
  path.join(os.homedir(), 'Downloads', 'TeamSpeak_Client_(64bit)_v3.5.1.exe'),
  path.join(os.homedir(), 'Downloads', 'TeamSpeak_Client_(64bit)_v3.5.1 (1).exe'),
  path.join(__dirname, '..', 'assets', 'teamspeak', 'TeamSpeak_Client_3.5.1.exe'),
];

function getExeVersion(exePath) {
  try {
    const ps = `(Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo.FileVersion`;
    const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8', timeout: 8000 }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function isTs3Client(exePath) {
  const ver = getExeVersion(exePath);
  if (!ver) return /ts3client/i.test(exePath);
  return ver.startsWith('3.');
}

function readRegistryInstallDir() {
  if (process.platform !== 'win32') return null;
  const keys = [
    'HKLM\\SOFTWARE\\TeamSpeak 3 Client',
    'HKLM\\SOFTWARE\\WOW6432Node\\TeamSpeak 3 Client',
    'HKCU\\SOFTWARE\\TeamSpeak 3 Client',
  ];
  for (const key of keys) {
    try {
      const out = execSync(`reg query "${key}" /v "default"`, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = out.match(/default\s+REG_SZ\s+(.+)/i);
      if (match) {
        const dir = match[1].trim();
        for (const name of ['ts3client_win64.exe', 'ts3client.exe']) {
          const full = path.join(dir, name);
          if (fs.existsSync(full)) return full;
        }
      }
    } catch {}
  }
  return null;
}

function discoverTeamSpeakExePaths() {
  const found = new Set();
  const fromReg = readRegistryInstallDir();
  if (fromReg) found.add(fromReg);

  for (const p of TS3_CLIENT_PATHS) {
    if (fs.existsSync(p)) found.add(p);
  }
  const scanRoots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    path.join(process.env.LOCALAPPDATA || '', 'Programs'),
    path.join(process.env.APPDATA || '', 'Local', 'Programs'),
  ].filter(Boolean);

  for (const root of scanRoots) {
    const tsDir = path.join(root, 'TeamSpeak 3 Client');
    for (const name of ['ts3client_win64.exe', 'ts3client.exe']) {
      const full = path.join(tsDir, name);
      if (fs.existsSync(full)) found.add(full);
    }
  }

  return [...found];
}

function findTeamSpeakClient() {
  const all = discoverTeamSpeakExePaths();
  const preferred = all.filter((p) => isTs3Client(p));
  const list = preferred.length ? preferred : all;
  return list.find((p) => /win64/i.test(p)) || list[0] || null;
}

function findInstaller351() {
  for (const p of TS_INSTALLER_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function isTeamSpeakRunning() {
  try {
    const out = execSync('tasklist /NH', { encoding: 'utf8', windowsHide: true });
    return /ts3client/i.test(out);
  } catch {
    return false;
  }
}

function tsClientQuery(command, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    let data = '';
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {}
      resolve(value);
    };

    const socket = net.createConnection({ host: '127.0.0.1', port: 25639 });
    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
      if (/error id=\d+ msg=/i.test(data)) finish(data);
    });
    socket.on('connect', () => {
      setTimeout(() => {
        try {
          socket.write(`${command}\n`);
        } catch {
          finish(null);
        }
      }, 80);
    });
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(data || null));
  });
}

function parseTsConnectionInfo(response, host, port) {
  if (!response || /error id=(2568|1794)\b/i.test(response)) return false;

  const ip =
    response.match(/connectioninfo_serverip=([^\s]+)/i)?.[1] ||
    response.match(/connection_serverip=([^\s]+)/i)?.[1];
  const portStr =
    response.match(/connectioninfo_serverport=(\d+)/i)?.[1] ||
    response.match(/connection_serverport=(\d+)/i)?.[1];

  if (ip && portStr) {
    return ip.trim() === host && Number(portStr) === Number(port);
  }

  const connected =
    /connectioninfo_connection_status=1/i.test(response) ||
    /connection_connected=1/i.test(response);
  if (!connected) return false;

  return response.includes(host) && response.includes(String(port));
}

function isConnectedViaTsLogs(host, port) {
  const logDir = path.join(process.env.APPDATA || '', 'TS3Client', 'logs');
  if (!fs.existsSync(logDir)) return false;

  let files;
  try {
    files = fs
      .readdirSync(logDir)
      .filter((name) => /\.txt$/i.test(name))
      .map((name) => ({
        name,
        mtime: fs.statSync(path.join(logDir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return false;
  }

  for (const file of files.slice(0, 3)) {
    try {
      const lines = fs.readFileSync(path.join(logDir, file.name), 'utf8').split(/\r?\n/);
      const tail = lines.slice(Math.max(0, lines.length - 800));
      for (let i = tail.length - 1; i >= 0; i -= 1) {
        const line = tail[i];
        if (!line.includes(host) || !line.includes(String(port))) continue;
        if (/disconnect|disconnected|connection lost|getrennt|offline/i.test(line)) return false;
        if (/connect|connected|online|hergestellt|joined/i.test(line)) return true;
      }
    } catch {}
  }

  return false;
}

async function isConnectedToTeamSpeakServer(host = TS_SERVER, port = TS_PORT) {
  if (!isTeamSpeakRunning()) return false;

  const hosts = host === TS_SERVER ? [TS_SERVER, TS_SERVER_FALLBACK] : [host];
  for (const h of hosts) {
    const response = await tsClientQuery('connectioninfo');
    if (parseTsConnectionInfo(response, h, port)) return true;

    const status = await tsClientQuery('connectioninfo connection_status');
    if (parseTsConnectionInfo(status, h, port)) return true;

    if (isConnectedViaTsLogs(h, port)) return true;
  }

  return false;
}

function spawnDetached(command, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    try {
      const proc = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: opts.shell === true,
        cwd: opts.cwd,
      });
      proc.once('error', (err) => finish(reject, err));
      proc.once('spawn', () => {
        proc.unref();
        finish(resolve);
      });
    } catch (e) {
      finish(reject, e);
    }
  });
}

function launchViaPowerShell(exePath, url) {
  const cwd = path.dirname(exePath);
  const ps = [
    `$p = '${exePath.replace(/'/g, "''")}'`,
    `$u = '${url.replace(/'/g, "''")}'`,
    `$d = '${cwd.replace(/'/g, "''")}'`,
    'Start-Process -FilePath $p -ArgumentList $u -WorkingDirectory $d',
  ].join('; ');
  execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
    windowsHide: true,
    timeout: 15000,
  });
}

function buildTeamSpeakUrl(server = TS_SERVER, port = TS_PORT, password = TS_PASSWORD) {
  const hostPort = port ? `${server}:${port}` : server;
  const params = new URLSearchParams();
  if (password) params.set('password', password);
  const query = params.toString();
  return query ? `ts3server://${hostPort}?${query}` : `ts3server://${hostPort}`;
}

function findTfarPlugin(workshopDir) {
  const roots = new Set();
  if (workshopDir) roots.add(path.join(path.dirname(path.dirname(workshopDir)), 'common', 'Arma 3'));
  for (const drive of ['D:', 'C:', 'E:']) {
    roots.add(path.join(drive, 'SteamLibrary', 'steamapps', 'common', 'Arma 3'));
  }
  for (const root of roots) {
    for (const sub of [
      path.join(root, '!Workshop', '@Task Force Arrowhead Radio (BETA!!!)', 'teamspeak', 'task_force_radio.ts3_plugin'),
      path.join(root, '@Task Force Arrowhead Radio (BETA!!!)', 'teamspeak', 'task_force_radio.ts3_plugin'),
    ]) {
      if (fs.existsSync(sub)) return sub;
    }
  }
  if (workshopDir && fs.existsSync(workshopDir)) {
    try {
      for (const id of fs.readdirSync(workshopDir)) {
        const plugin = path.join(workshopDir, id, 'teamspeak', 'task_force_radio.ts3_plugin');
        if (fs.existsSync(plugin)) return plugin;
      }
    } catch {}
  }
  return null;
}

function installTfarPlugin(pluginPath) {
  if (!pluginPath || !fs.existsSync(pluginPath)) {
    return { ok: false, error: 'Плагин TFAR не найден в модах Workshop' };
  }
  try {
    const destDir = path.join(os.homedir(), 'AppData', 'Roaming', 'TS3Client', 'plugins');
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, path.basename(pluginPath));
    const srcStat = fs.statSync(pluginPath);
    let needCopy = true;
    if (fs.existsSync(dest)) {
      const dstStat = fs.statSync(dest);
      needCopy = dstStat.mtimeMs < srcStat.mtimeMs || dstStat.size !== srcStat.size;
    }
    if (needCopy) fs.copyFileSync(pluginPath, dest);
    return { ok: true, path: dest, updated: needCopy };
  } catch (e) {
    return { ok: false, error: e.message || 'Не удалось скопировать плагин TFAR' };
  }
}

async function installTeamSpeak351(installerPath) {
  try {
    await spawnDetached(installerPath, ['/S']);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  await new Promise((r) => setTimeout(r, 15000));
  return { ok: !!findTeamSpeakClient(), client: findTeamSpeakClient() };
}

async function connectTeamSpeak(clientPath, server = TS_SERVER, port = TS_PORT, password = TS_PASSWORD) {
  const url = buildTeamSpeakUrl(server, port, password);
  const wasRunning = isTeamSpeakRunning();
  const errors = [];

  const tryMethod = async (name, fn) => {
    try {
      await fn();
      if (!wasRunning) {
        await new Promise((r) => setTimeout(r, 2500));
        if (!isTeamSpeakRunning()) {
          throw new Error('процесс не появился');
        }
      }
      return { ok: true, url, method: name };
    } catch (e) {
      errors.push(`${name}: ${e.message || e}`);
      return null;
    }
  };

  if (clientPath && fs.existsSync(clientPath)) {
    const cwd = path.dirname(clientPath);

    let result = await tryMethod('powershell', () => launchViaPowerShell(clientPath, url));
    if (result) return result;

    result = await tryMethod('cmd-start', () =>
      spawnDetached('cmd.exe', ['/c', 'start', '""', clientPath, url], { shell: false, cwd })
    );
    if (result) return result;

    result = await tryMethod('spawn-cwd', () =>
      spawnDetached(clientPath, [url], { cwd })
    );
    if (result) return result;
  }

  const protocol = await tryMethod('protocol', () =>
    spawnDetached('cmd.exe', ['/c', 'start', '""', url], { shell: false })
  );
  if (protocol) return protocol;

  return { ok: false, error: errors.join('; ') || 'Не удалось запустить TeamSpeak', url };
}

async function ensureTeamSpeak({ workshopDir, onProgress, server, port, password } = {}) {
  const host = server || TS_SERVER;
  const tsPort = port || TS_PORT;
  const tsPass = password != null ? password : TS_PASSWORD;
  const result = {
    ok: true,
    warnings: [],
    server: `${host}:${tsPort}`,
    plugin: false,
    launched: false,
  };

  try {
    onProgress?.('Проверка TeamSpeak 3…');
    let client = findTeamSpeakClient();

    if (!client) {
      const installer = findInstaller351();
      if (installer) {
        onProgress?.('Установка TeamSpeak 3.5.1…');
        await installTeamSpeak351(installer);
        client = findTeamSpeakClient();
      } else {
        result.warnings.push(
          `TeamSpeak 3 Client не найден. Установите клиент — лаунчер подключит ${host}:${tsPort}.`
        );
      }
    } else {
      const ver = getExeVersion(client);
      onProgress?.(`TeamSpeak: ${path.basename(client)}${ver ? ` v${ver}` : ''}`);
    }

    const plugin = findTfarPlugin(workshopDir);
    if (plugin) {
      onProgress?.('Плагин TFAR…');
      const plug = installTfarPlugin(plugin);
      if (plug.ok) {
        result.plugin = true;
        if (plug.updated) onProgress?.('Плагин TFAR обновлён');
        else onProgress?.('Плагин TFAR на месте');
      } else {
        result.warnings.push(plug.error || 'TFAR не установлен');
      }
    } else {
      result.warnings.push('TFAR plugin не найден — проверьте мод Task Force Arrowhead Radio');
    }

    if (client) {
      if (isTeamSpeakRunning()) {
        const alreadyOnServer = await isConnectedToTeamSpeakServer(host, tsPort);
        if (alreadyOnServer) {
          onProgress?.(`TeamSpeak уже на сервере ${host}:${tsPort} — повторное подключение пропущено`);
          result.launched = true;
          result.skippedReconnect = true;
        } else {
          onProgress?.(`TeamSpeak уже запущен — подключение ${host}:${tsPort}`);
          const conn = await connectTeamSpeak(client, host, tsPort, tsPass);
          if (conn.ok) {
            result.launched = true;
          } else {
            result.warnings.push(conn.error || 'TeamSpeak не запустился');
          }
        }
      } else {
        onProgress?.(`Запуск TeamSpeak → ${host}:${tsPort}…`);
        const conn = await connectTeamSpeak(client, host, tsPort, tsPass);
        if (conn.ok) {
          result.launched = true;
        } else {
          result.warnings.push(conn.error || 'TeamSpeak не запустился');
        }
      }
    } else {
      const conn = await connectTeamSpeak(null, host, tsPort, tsPass);
      if (conn.ok) {
        result.launched = true;
        result.warnings.push('TeamSpeak открыт через системный обработчик ts3server://');
      }
    }
  } catch (e) {
    result.warnings.push(e.message || 'Ошибка TeamSpeak');
  }

  return result;
}

module.exports = {
  ensureTeamSpeak,
  findTeamSpeakClient,
  buildTeamSpeakUrl,
  isConnectedToTeamSpeakServer,
  TS_SERVER,
  TS_PORT,
  TS_PASSWORD,
};
