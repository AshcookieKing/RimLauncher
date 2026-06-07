/** Звания ВАР по [Уставу 13-й СА](https://docs.google.com/document/d/1Ucpl_lrnF7r_56hqMlcccZ1vc8jvF1y4_ylrXdx0jhQ/edit) */
const RANKS = [
  { code: 'MC', name: 'Маршал-Коммандер (MC)', order: 100 },
  { code: 'CC', name: 'Клон-Коммандер (CC)', order: 95 },
  { code: 'HGEN', name: 'Высший Генерал-Джедай (HGEN)', order: 94 },
  { code: 'SGEN', name: 'Старший Генерал-Джедай (SGEN)', order: 93 },
  { code: 'GEN', name: 'Генерал-Джедай (GEN)', order: 92 },
  { code: 'FL.ADM', name: 'Адмирал Флота (FL.ADM)', order: 91 },
  { code: 'ADM', name: 'Адмирал (ADM)', order: 90 },
  { code: 'FL.CMD', name: 'Командор Флота (FL.CMD)', order: 89 },
  { code: 'FL.SCPT', name: 'Старший Капитан Флота (FL.SCPT)', order: 88 },
  { code: 'FL.CPT', name: 'Капитан Флота (FL.CPT)', order: 87 },
  { code: 'COL', name: 'Полковник (COL)', order: 85 },
  { code: 'COM', name: 'Коммандер (COM)', order: 84 },
  { code: 'MAJ', name: 'Майор (MAJ)', order: 80 },
  { code: 'CPT', name: 'Капитан (CPT)', order: 75 },
  { code: 'LT', name: 'Лейтенант (LT)', order: 70 },
  { code: 'MSG', name: 'Мастер-Сержант (MSG)', order: 65 },
  { code: 'SGT', name: 'Сержант (SGT)', order: 60 },
  { code: 'CPL', name: 'Капрал (CPL)', order: 55 },
  { code: 'PVT', name: 'Клон-Рядовой (PVT)', order: 50 },
  { code: 'CT', name: 'Клон-Солдат (CT)', order: 45 },
  { code: 'CR', name: 'Клон-Рекрут (CR)', order: 40 },
  { code: 'ARC', name: 'ARC (коммандос)', order: 35 },
  { code: 'RC', name: 'RC (коммандос)', order: 34 },
];

const CODE_SET = new Set(RANKS.map((r) => r.code));

function normalizeCode(raw) {
  if (!raw) return null;
  const u = raw.toUpperCase().replace(/\./g, '.');
  if (CODE_SET.has(u)) return u;
  const alt = u.replace('FL.', 'FL.');
  if (CODE_SET.has(alt)) return alt;
  return null;
}

function matchRankFromText(text) {
  if (!text) return null;
  const decoded = decodeURIComponent(text.replace(/\+/g, ' '));
  const upper = decoded.toUpperCase();

  const bracket = upper.match(/\[([A-Z]{2,6}(?:\.[A-Z]+)?)\]/);
  if (bracket) {
    const c = normalizeCode(bracket[1]);
    if (c) return RANKS.find((r) => r.code === c);
  }

  const tokens = upper.split(/[\s|_\-\[\]()]+/).filter(Boolean);
  for (const token of tokens) {
    const c = normalizeCode(token);
    if (c) return RANKS.find((r) => r.code === c);
  }

  for (const rank of RANKS) {
    const re = new RegExp(`\\b${rank.code.replace('.', '\\.')}\\b`, 'i');
    if (re.test(upper)) return rank;
  }

  if (/\bREC(RUIT)?\b/i.test(upper)) return RANKS.find((r) => r.code === 'CR');
  if (/\bCOLONEL\b/i.test(upper)) return RANKS.find((r) => r.code === 'COL');
  if (/\bCAPTAIN\b/i.test(upper)) return RANKS.find((r) => r.code === 'CPT');
  if (/\bSERGEANT\b/i.test(upper)) return RANKS.find((r) => r.code === 'SGT');

  return null;
}

function getRankDisplay(text) {
  const rank = matchRankFromText(text);
  return rank ? rank.name : null;
}

module.exports = { RANKS, matchRankFromText, getRankDisplay, normalizeCode };
