const fs = require('fs');
const path = require('path');

function parsePresetHtml(html) {
  const mods = [];
  const rowRe =
    /<tr[^>]*data-type="ModContainer"[^>]*>[\s\S]*?<td[^>]*data-type="DisplayName"[^>]*>([^<]*)<\/td>[\s\S]*?filedetails\/\?id=(\d+)/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    mods.push({
      name: m[1].trim(),
      workshopId: m[2],
      steamUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${m[2]}`,
    });
  }
  return mods;
}

function loadPreset(presetPath) {
  const html = fs.readFileSync(presetPath, 'utf8');
  return parsePresetHtml(html);
}

function resolvePresetPath(appPaths) {
  const candidates = [
    path.join(appPaths.cwd, 'preset', 'rim_preset.html'),
    path.join(appPaths.resources, 'preset', 'rim_preset.html'),
    path.join(appPaths.dirname, '..', 'preset', 'rim_preset.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

module.exports = { parsePresetHtml, loadPreset, resolvePresetPath };
