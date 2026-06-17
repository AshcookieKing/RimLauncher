const fs = require('fs');
const path = require('path');
const os = require('os');
const { matchRankFromText, getRankDisplay } = require('./var-ranks.cjs');

const SKIP_PROFILES = new Set([
  'BULDOZER',
  'HEADLESSCLIENT',
  'ADMINISTRATION',
  'HC1',
  'HC2',
  'HC_4',
  'HC_5',
  'HC_6',
  'HC_7',
]);

function decodeProfileName(name) {
  try {
    return decodeURIComponent(name.replace(/\+/g, ' ')).trim();
  } catch {
    return name.trim();
  }
}

function getOtherProfilesDir() {
  const dir = path.join(os.homedir(), 'Documents', 'Arma 3 - Other Profiles');
  return fs.existsSync(dir) ? dir : null;
}

function listPlayerProfiles() {
  const base = getOtherProfilesDir();
  if (!base) return [];

  const profiles = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folderName = entry.name;
    const displayName = decodeProfileName(folderName);
    const upper = displayName.toUpperCase();
    if (SKIP_PROFILES.has(upper.replace(/\s/g, ''))) continue;
    if (/^HC\d*$/i.test(displayName) || /^PLAYER\s*\d+$/i.test(displayName)) continue;

    const fullPath = path.join(base, folderName);
    let lastUsed = 0;
    try {
      for (const f of fs.readdirSync(fullPath)) {
        const st = fs.statSync(path.join(fullPath, f));
        if (st.mtimeMs > lastUsed) lastUsed = st.mtimeMs;
      }
    } catch {}

    const rank = getRankDisplay(displayName);
    profiles.push({
      id: folderName,
      displayName,
      rank: rank || '—',
      rankCode: matchRankFromText(displayName)?.code || null,
      lastUsed,
      path: fullPath,
    });
  }

  return profiles.sort((a, b) => b.lastUsed - a.lastUsed);
}

function pickActiveProfile(preferredName, profileId) {
  const profiles = listPlayerProfiles();
  if (!profiles.length) return null;

  if (profileId) {
    const byId = profiles.find((p) => p.id === profileId || p.path === profileId);
    if (byId) return byId;
  }

  if (preferredName) {
    const pref = preferredName.trim().toLowerCase();
    const match = profiles.find(
      (p) =>
        p.displayName.toLowerCase() === pref ||
        p.displayName.toLowerCase().includes(pref) ||
        pref.includes(p.displayName.toLowerCase())
    );
    if (match) return match;
  }

  return profiles[0];
}

function getArmaProfileInfo(options = {}) {
  const active = pickActiveProfile(options.playerName, options.profileId);
  if (!active) {
    return {
      found: false,
      displayName: options.playerName || '—',
      rank: '—',
      faction: 'ВАР',
      profiles: [],
    };
  }

  return {
    found: true,
    displayName: active.displayName,
    inGameName: active.displayName,
    rank: active.rank,
    rankCode: active.rankCode,
    faction: 'ВАР',
    role: active.rank,
    profilePath: active.path,
    profiles: listPlayerProfiles().slice(0, 20),
  };
}

module.exports = {
  getOtherProfilesDir,
  listPlayerProfiles,
  pickActiveProfile,
  getArmaProfileInfo,
  decodeProfileName,
};
