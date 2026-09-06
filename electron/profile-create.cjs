const fs = require('fs');
const path = require('path');
const { getOtherProfilesDir, listPlayerProfiles } = require('./arma-profiles.cjs');

const FACE_NAMES = [
  'Клон #1', 'Клон #2', 'Клон #3', 'Клон #4', 'Клон #5', 'Клон #6',
  'Клон #7', 'Клон #8', 'Клон #9', 'Клон #10', 'Клон #11', 'Клон #12',
];

function encodeProfileFolder(nickname) {
  return encodeURIComponent(nickname.trim()).replace(/%20/g, '%20');
}

function templateDir() {
  return path.join(__dirname, 'profile-template');
}

function copyProfileTemplate(targetDir, folderName, nickname) {
  const src = templateDir();
  if (!fs.existsSync(src)) {
    throw new Error('Шаблон профиля не найден в лаунчере');
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const sub of ['compositions', 'missions', 'mpmissions', 'Saved', 'UserSaved']) {
    fs.mkdirSync(path.join(targetDir, sub), { recursive: true });
  }
  for (const file of fs.readdirSync(src)) {
    const srcPath = path.join(src, file);
    if (!fs.statSync(srcPath).isFile()) continue;
    let destName = file;
    if (file.includes('501%20sdsad')) {
      destName = file.replace(/501%20sdsad/g, folderName);
    }
    fs.copyFileSync(srcPath, path.join(targetDir, destName));
  }
  fs.writeFileSync(
    path.join(targetDir, 'rim_launcher_meta.json'),
    JSON.stringify({ nickname, faceIndex: 0, createdAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

function createPlayerProfile({ nickname, faceIndex = 0 }) {
  const name = (nickname || '').trim();
  if (!name || name.length < 2) {
    return { ok: false, error: 'Никнейм минимум 2 символа' };
  }
  if (name.length > 32) {
    return { ok: false, error: 'Никнейм слишком длинный (макс. 32)' };
  }

  const base = getOtherProfilesDir();
  if (!base) {
    fs.mkdirSync(path.join(require('os').homedir(), 'Documents', 'Arma 3 - Other Profiles'), { recursive: true });
  }
  const profilesDir = getOtherProfilesDir();
  if (!profilesDir) {
    return { ok: false, error: 'Не удалось создать папку профилей Arma 3' };
  }

  const folderName = encodeProfileFolder(name);
  const targetDir = path.join(profilesDir, folderName);
  if (fs.existsSync(targetDir)) {
    const existing = listPlayerProfiles().find((p) => p.id === folderName);
    return {
      ok: true,
      alreadyExists: true,
      profile: existing || { id: folderName, displayName: name, rank: '—' },
    };
  }

  try {
    copyProfileTemplate(targetDir, folderName, name);
    const metaPath = path.join(targetDir, 'rim_launcher_meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.faceIndex = Math.max(0, Math.min(FACE_NAMES.length - 1, faceIndex | 0));
    meta.faceName = FACE_NAMES[meta.faceIndex];
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch (e) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch {}
    return { ok: false, error: e.message || 'Ошибка создания профиля' };
  }

  const profile = listPlayerProfiles().find((p) => p.id === folderName);
  return {
    ok: true,
    profile: profile || { id: folderName, displayName: name, rank: '—' },
    faceName: FACE_NAMES[Math.max(0, Math.min(FACE_NAMES.length - 1, faceIndex | 0))],
  };
}

module.exports = { createPlayerProfile, FACE_NAMES };
