const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const ARMA_APP_ID = '107410';

function readRegistryPaths() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({});
      return;
    }
    const ps = `
      $steam = (Get-ItemProperty -Path 'HKCU:\\Software\\Valve\\Steam' -ErrorAction SilentlyContinue).SteamPath
      $arma = @(
        'HKLM:\\SOFTWARE\\WOW6432Node\\Bohemia Interactive\\Arma 3',
        'HKLM:\\SOFTWARE\\Bohemia Interactive\\Arma 3'
      ) | ForEach-Object {
        try { (Get-ItemProperty $_).main } catch {}
      } | Where-Object { $_ } | Select-Object -First 1
      @{ steam = $steam; arma = $arma } | ConvertTo-Json -Compress
    `;
    exec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }, (err, stdout) => {
      if (err || !stdout?.trim()) {
        resolve({});
        return;
      }
      try {
        const data = JSON.parse(stdout.trim());
        resolve({
          steamPath: data.steam?.replace(/\\\\/g, '\\'),
          armaPath: data.arma?.replace(/\\\\/g, '\\'),
        });
      } catch {
        resolve({});
      }
    });
  });
}

function parseLibraryFolders(steamPath) {
  const libs = [steamPath];
  const vdf = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  if (!fs.existsSync(vdf)) return libs;

  const text = fs.readFileSync(vdf, 'utf8');
  const re = /"path"\s+"([^"]+)"/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    let p = m[1].replace(/\\\\/g, '\\');
    if (fs.existsSync(p) && !libs.includes(p)) libs.push(p);
  }
  return libs;
}

function findWorkshopDir(steamLibraries) {
  for (const lib of steamLibraries) {
    const workshop = path.join(lib, 'steamapps', 'workshop', 'content', ARMA_APP_ID);
    if (fs.existsSync(workshop)) {
      return {
        workshopDir: workshop,
        acfPath: path.join(lib, 'steamapps', 'workshop', 'appworkshop_107410.acf'),
        steamPath: lib,
      };
    }
  }
  return null;
}

function findArmaInstall(steamLibraries) {
  for (const lib of steamLibraries) {
    const armaDir = path.join(lib, 'steamapps', 'common', 'Arma 3');
    const exe = path.join(armaDir, 'arma3_x64.exe');
    if (fs.existsSync(exe)) {
      return {
        armaExe: exe,
        armaProfilingExe: path.join(armaDir, 'arma3_x64_profiling.exe'),
        armaDir,
      };
    }
  }
  return null;
}

function derivePathsFromArmaExe(armaExe) {
  const normalized = path.normalize(String(armaExe || '').trim());
  if (!normalized) {
    return { armaExe: '', steamPath: '', workshopDir: '', acfPath: '', armaDir: '' };
  }
  const lower = normalized.toLowerCase();
  const marker = `${path.sep}steamapps${path.sep}common${path.sep}`;
  const idx = lower.lastIndexOf(marker);
  if (idx === -1) {
    return {
      armaExe: normalized,
      armaDir: path.dirname(normalized),
      steamPath: '',
      workshopDir: '',
      acfPath: '',
    };
  }
  const libraryRoot = normalized.slice(0, idx);
  const steamapps = path.join(libraryRoot, 'steamapps');
  return {
    armaExe: normalized,
    armaDir: path.dirname(normalized),
    steamPath: libraryRoot,
    workshopDir: path.join(steamapps, 'workshop', 'content', ARMA_APP_ID),
    acfPath: path.join(steamapps, 'workshop', `appworkshop_${ARMA_APP_ID}.acf`),
  };
}

function derivePathsFromSteamLibrary(libraryRoot) {
  const root = path.normalize(String(libraryRoot || '').trim());
  if (!root) return { steamPath: '', workshopDir: '', acfPath: '', armaExe: '' };
  const steamapps = path.join(root, 'steamapps');
  const armaExe = path.join(steamapps, 'common', 'Arma 3', 'arma3_x64.exe');
  return {
    steamPath: root,
    workshopDir: path.join(steamapps, 'workshop', 'content', ARMA_APP_ID),
    acfPath: path.join(steamapps, 'workshop', `appworkshop_${ARMA_APP_ID}.acf`),
    armaExe: fs.existsSync(armaExe) ? armaExe : '',
    armaDir: fs.existsSync(armaExe) ? path.dirname(armaExe) : '',
  };
}

function validateGamePaths({ armaExe, workshopDir } = {}) {
  const errors = [];
  const exe = String(armaExe || '').trim();
  const workshop = String(workshopDir || '').trim();
  if (!exe || !fs.existsSync(exe)) {
    errors.push('Укажите существующий файл arma3_x64.exe');
  } else if (!/^arma3_x64(_profiling)?\.exe$/i.test(path.basename(exe))) {
    errors.push('Нужен файл arma3_x64.exe (или profiling)');
  }
  if (!workshop || !fs.existsSync(workshop)) {
    errors.push('Укажите папку Workshop модов Arma 3');
  }
  return { valid: errors.length === 0, errors };
}

function collectSteamLibraries(reg = {}) {
  const libraries = [];
  const addLib = (root) => {
    if (!root || !fs.existsSync(root)) return;
    for (const lib of parseLibraryFolders(root)) {
      if (!libraries.includes(lib)) libraries.push(lib);
    }
  };
  if (reg.steamPath) addLib(reg.steamPath);
  const programX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  addLib(path.join(programX86, 'Steam'));
  return libraries;
}

async function detectGamePaths() {
  const reg = await readRegistryPaths();
  const libraries = collectSteamLibraries(reg);
  const workshop = findWorkshopDir(libraries);
  const arma = findArmaInstall(libraries);

  let armaExe = arma?.armaExe || '';
  if (!armaExe && reg.armaPath) {
    const fromReg = path.join(reg.armaPath, 'arma3_x64.exe');
    if (fs.existsSync(fromReg)) armaExe = fromReg;
  }

  let steamPath = workshop?.steamPath || '';
  let workshopDir = workshop?.workshopDir || '';
  let acfPath = workshop?.acfPath || '';

  if (armaExe) {
    const derived = derivePathsFromArmaExe(armaExe);
    if (!steamPath && derived.steamPath) steamPath = derived.steamPath;
    if (!workshopDir && derived.workshopDir) workshopDir = derived.workshopDir;
    if (!acfPath && derived.acfPath) acfPath = derived.acfPath;
  }

  if (steamPath && !acfPath) {
    acfPath = path.join(steamPath, 'steamapps', 'workshop', `appworkshop_${ARMA_APP_ID}.acf`);
  }

  return {
    armaExe,
    steamPath,
    workshopDir,
    acfPath,
    armaDir: armaExe ? path.dirname(armaExe) : '',
    libraries,
  };
}

async function autoResolvePaths(stored = {}) {
  const detected = await detectGamePaths();
  const storedExe = stored.armaExe && fs.existsSync(stored.armaExe) ? stored.armaExe : '';
  const storedWorkshop = stored.workshopDir && fs.existsSync(stored.workshopDir) ? stored.workshopDir : '';
  const storedSteam = stored.steamPath && fs.existsSync(stored.steamPath) ? stored.steamPath : '';

  return {
    steamPath: storedSteam || detected.steamPath || '',
    workshopDir: storedWorkshop || detected.workshopDir || '',
    acfPath:
      (storedSteam && path.join(storedSteam, 'steamapps', 'workshop', `appworkshop_${ARMA_APP_ID}.acf`)) ||
      detected.acfPath ||
      '',
    armaExe: storedExe || detected.armaExe || '',
    armaProfilingExe: detected.armaExe ? path.join(path.dirname(detected.armaExe), 'arma3_x64_profiling.exe') : undefined,
    armaDir: storedExe ? path.dirname(storedExe) : detected.armaDir,
    libraries: detected.libraries,
    suggestedSteamPath: detected.steamPath || '',
  };
}

module.exports = {
  ARMA_APP_ID,
  readRegistryPaths,
  parseLibraryFolders,
  autoResolvePaths,
  detectGamePaths,
  collectSteamLibraries,
  derivePathsFromArmaExe,
  derivePathsFromSteamLibrary,
  validateGamePaths,
};
