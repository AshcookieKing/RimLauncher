const ROLE_LABELS = {
  '1473748089285251262': 'ВАР',
  '1473748089385783472': 'БСО',
  '1473748089385783478': 'ДЖЕДАИ',
  '1473748089285251260': 'НАЙМЫ',
};

export function formatDiscordText(text) {
  if (!text) return '';
  return String(text)
    .replace(/<@&(\d+)>/g, (_, id) => `@${ROLE_LABELS[id] || 'роль'}`)
    .replace(/<@!?(\d+)>/g, () => '@игрок')
    .replace(/<#(\d+)>/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
