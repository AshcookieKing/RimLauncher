const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const MOD_FOLDER_NAME = '@SF_CHAR_MENU';
const PBO_NAME = 'zzz_SF_CHAR_MENU.pbo';

function resolveShardsDir() {
  const candidates = [
    path.join(process.resourcesPath || '', 'sfcm'),
    path.join(__dirname, 'bin', 'sfcm'),
  ];
  try {
    if (app && typeof app.getAppPath === 'function') {
      candidates.push(path.join(app.getAppPath(), 'electron', 'bin', 'sfcm'));
    }
  } catch {}
  candidates.push(path.join(__dirname, '..', 'electron', 'bin', 'sfcm'));
  for (const p of candidates) {
    if (p && fs.existsSync(path.join(p, 'manifest.json'))) return p;
  }
  return null;
}

function xorBuffer(buf, key) {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ key[i % key.length];
  }
  return out;
}

function assemblePboBuffer(shardsDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(shardsDir, 'manifest.json'), 'utf8'));
  const key = crypto.createHash('sha256').update(String(manifest.seed || ''), 'utf8').digest();
  const parts = [...(manifest.parts || [])].sort((a, b) => a.i - b.i);
  const chunks = [];
  let total = 0;
  for (const part of parts) {
    const fp = path.join(shardsDir, part.file);
    if (!fs.existsSync(fp)) {
      throw new Error(`SFCM shard missing: ${part.file}`);
    }
    const piece = fs.readFileSync(fp);
    chunks.push(piece);
    total += piece.length;
  }
  const enc = Buffer.concat(chunks, total);
  const raw = xorBuffer(enc, key);
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  if (manifest.sha256 && sha !== manifest.sha256) {
    throw new Error('SFCM menu integrity check failed (sha256 mismatch)');
  }
  return { raw, manifest };
}

function runtimeModRoot() {
  return path.join(app.getPath('userData'), 'runtime-mods', MOD_FOLDER_NAME);
}

function writeMetaCpp(modRoot) {
  const meta = `name = "StarFront Character Menu";
author = "StarFront";
overview = "Launcher-only menu (assembled at runtime)";
`;
  fs.writeFileSync(path.join(modRoot, 'meta.cpp'), meta, 'utf8');
}

/**
 * Assemble split PBO into a private @mod folder and return its path for -mod=
 */
function deployMenuMod() {
  const shardsDir = resolveShardsDir();
  if (!shardsDir) {
    throw new Error('Меню StarFront не вшито в лаунчер (нет electron/bin/sfcm).');
  }
  const { raw } = assemblePboBuffer(shardsDir);
  const modRoot = runtimeModRoot();
  const addons = path.join(modRoot, 'addons');
  fs.mkdirSync(addons, { recursive: true });
  const pboPath = path.join(addons, PBO_NAME);
  fs.writeFileSync(pboPath, raw);
  writeMetaCpp(modRoot);
  const bikey = path.join(shardsDir, 'StarFront_SFCM.bikey');
  if (fs.existsSync(bikey)) {
    const keys = path.join(modRoot, 'keys');
    fs.mkdirSync(keys, { recursive: true });
    fs.copyFileSync(bikey, path.join(keys, 'StarFront_SFCM.bikey'));
  }
  return modRoot;
}

function cleanupMenuMod() {
  const modRoot = runtimeModRoot();
  try {
    if (fs.existsSync(modRoot)) {
      fs.rmSync(modRoot, { recursive: true, force: true });
    }
  } catch {}
}

function appendModParam(modParam, extraPath) {
  const parts = String(modParam || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extraPath && !parts.includes(extraPath)) {
    parts.push(extraPath);
  }
  return parts.join(';');
}

module.exports = {
  deployMenuMod,
  cleanupMenuMod,
  appendModParam,
  resolveShardsDir,
  runtimeModRoot,
};
