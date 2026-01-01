const https = require('https');
const botConfig = require('./bot-config.cjs');

const CACHE_MS = 90_000;
const cache = { news: { at: 0, items: [] }, events: { at: 0, data: null } };

function discordRequest(path, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const token = botConfig.botToken;
    if (!token) return reject(new Error('Discord bot token не настроен'));
    const req = https.request(
      {
        hostname: 'discord.com',
        path: `/api/v10${path}`,
        method: 'GET',
        timeout: timeoutMs,
        headers: { Authorization: `Bot ${token}`, 'User-Agent': 'StarFrontLauncher/1.2' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Discord ${res.statusCode}: ${data.slice(0, 120)}`));
            return;
          }
          try {
            resolve(JSON.parse(data || 'null'));
          } catch {
            reject(new Error('Неверный ответ Discord'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Таймаут Discord'));
    });
    req.end();
  });
}

function stripDiscord(text) {
  return String(text || '')
    .replace(/<@&\d+>/g, '')
    .replace(/<@!?\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMessage(msg, channelId) {
  let title = '';
  let body = '';
  const embed = msg.embeds?.[0];
  if (embed) {
    title = embed.title || '';
    body = embed.description || '';
    if (embed.video?.url) body = `${body}\n${embed.video.url}`.trim();
    else if (embed.image?.url) body = `${body}\n${embed.image.url}`.trim();
  }
  const content = (msg.content || '').trim();
  if (!title && content) title = content.split('\n', 1)[0].slice(0, 120);
  if (!body) body = content !== title ? content : '';

  let media_url = null;
  for (const att of msg.attachments || []) {
    if (att.content_type?.startsWith('video/') || att.url) {
      media_url = att.url;
      if (att.content_type?.startsWith('video/')) break;
    }
  }

  const cid = String(channelId);
  let type = 'news';
  let type_label = 'Новости';
  if (cid === String(botConfig.eventsChannelId) || cid === String(botConfig.announceChannelId)) {
    type = 'announce';
    type_label = 'Анонс ивента';
  }
  if (botConfig.newsChannelIds.map(String).includes(cid)) {
    type = 'media';
    type_label = 'Видео / медиа';
  }

  return {
    id: String(msg.id),
    channel_id: cid,
    type,
    type_label,
    title: stripDiscord(title) || type_label,
    body: stripDiscord(body || title).slice(0, 2000),
    author: msg.author?.global_name || msg.author?.username || '—',
    timestamp: msg.timestamp || null,
    url: `https://discord.com/channels/${botConfig.guildId}/${cid}/${msg.id}`,
    media_url,
  };
}

async function fetchChannelMessages(channelId, limit = 15) {
  const rows = await discordRequest(`/channels/${channelId}/messages?limit=${limit}`);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((m) => m.content || m.embeds?.length || m.attachments?.length)
    .map((m) => parseMessage(m, channelId));
}

async function fetchNewsDirect(force = false) {
  const now = Date.now();
  if (!force && cache.news.items.length && now - cache.news.at < CACHE_MS) {
    return cache.news.items;
  }
  const seen = new Set();
  const news = [];
  for (const channelId of botConfig.newsChannelIds || []) {
    try {
      for (const item of await fetchChannelMessages(channelId, 15)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        news.push(item);
      }
    } catch (e) {
      console.warn('discord-direct news', channelId, e.message);
    }
  }
  news.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  cache.news = { at: now, items: news.slice(0, 20) };
  return cache.news.items;
}

async function fetchEventsDirect(force = false) {
  const now = Date.now();
  if (!force && cache.events.data && now - cache.events.at < CACHE_MS) {
    return cache.events.data;
  }
  const channelPosts = await fetchChannelMessages(botConfig.eventsChannelId, 10).catch(() => []);
  const data = {
    channel_posts: channelPosts,
    next_event: channelPosts[0] || null,
    live: [],
  };
  cache.events = { at: now, data };
  return data;
}

module.exports = {
  botConfig,
  fetchNewsDirect,
  fetchEventsDirect,
};
