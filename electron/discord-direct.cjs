const https = require('https');
const botConfig = require('./bot-config.cjs');

const CACHE_MS = 90_000;
const cache = { news: { at: 0, items: [] }, events: { at: 0, data: null }, holonet: { at: 0, items: [] } };

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

function isImageUrl(url, contentType) {
  const u = String(url || '').toLowerCase();
  const ct = String(contentType || '').toLowerCase();
  return ct.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);
}

function isVideoUrl(url, contentType) {
  const u = String(url || '').toLowerCase();
  const ct = String(contentType || '').toLowerCase();
  if (ct.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|mkv|ogv)(\?|$)/i.test(u);
}

function youtubeIdFromUrl(url) {
  const m = String(url || '').match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/i
  );
  return m ? m[1] : null;
}

function parseMessage(msg, channelId, forcedType) {
  let title = '';
  let body = '';
  const images = [];
  const videos = [];
  const pushVideo = (url, meta = {}) => {
    if (!url || videos.some((v) => v.url === url)) return;
    videos.push({ url, ...meta });
  };
  const embeds = msg.embeds || [];
  const embed = embeds[0];
  if (embed) {
    title = embed.title || '';
    body = embed.description || '';
    if (embed.video?.url) {
      const yt = youtubeIdFromUrl(embed.url || embed.video.url);
      if (yt) pushVideo(`https://www.youtube-nocookie.com/embed/${yt}`, { kind: 'youtube', poster: embed.thumbnail?.url || null });
      else if (isVideoUrl(embed.video.url) || /\.discordapp\.net|\.discordcdn\.com/i.test(embed.video.url)) {
        pushVideo(embed.video.url, { kind: 'file', poster: embed.thumbnail?.url || embed.image?.url || null });
      } else {
        pushVideo(embed.video.url, { kind: 'file', poster: embed.thumbnail?.url || null });
      }
    } else if (embed.url && youtubeIdFromUrl(embed.url)) {
      const yt = youtubeIdFromUrl(embed.url);
      pushVideo(`https://www.youtube-nocookie.com/embed/${yt}`, { kind: 'youtube', poster: embed.thumbnail?.url || null });
    }
    if (embed.image?.url) images.push(embed.image.url);
    if (embed.thumbnail?.url && !images.includes(embed.thumbnail.url)) images.push(embed.thumbnail.url);
  }
  for (const e of embeds.slice(1)) {
    if (e.image?.url && !images.includes(e.image.url)) images.push(e.image.url);
    if (e.video?.url) {
      const yt = youtubeIdFromUrl(e.url || e.video.url);
      if (yt) pushVideo(`https://www.youtube-nocookie.com/embed/${yt}`, { kind: 'youtube', poster: e.thumbnail?.url || null });
      else pushVideo(e.video.url, { kind: 'file', poster: e.thumbnail?.url || null });
    } else if (e.url && youtubeIdFromUrl(e.url)) {
      pushVideo(`https://www.youtube-nocookie.com/embed/${youtubeIdFromUrl(e.url)}`, {
        kind: 'youtube',
        poster: e.thumbnail?.url || null,
      });
    }
  }
  const content = (msg.content || '').trim();
  if (!title && content) title = content.split('\n', 1)[0].slice(0, 120);
  if (!body) body = content !== title ? content : '';
  const ytInBody = youtubeIdFromUrl(content);
  if (ytInBody) {
    pushVideo(`https://www.youtube-nocookie.com/embed/${ytInBody}`, { kind: 'youtube' });
  }

  let media_url = null;
  for (const att of msg.attachments || []) {
    if (!att.url) continue;
    if (isImageUrl(att.url, att.content_type)) {
      if (!images.includes(att.url)) images.push(att.url);
      if (!media_url) media_url = att.url;
    } else if (isVideoUrl(att.url, att.content_type)) {
      pushVideo(att.url, {
        kind: 'file',
        poster: att.proxy_url && isImageUrl(att.proxy_url) ? att.proxy_url : null,
      });
      if (!media_url) media_url = att.url;
    } else if (!media_url) {
      media_url = att.url;
    }
  }
  if (!media_url && videos[0]) media_url = videos[0].url;
  if (!media_url && images[0]) media_url = images[0];

  const cid = String(channelId);
  let type = forcedType || 'news';
  let type_label = forcedType === 'holonet' ? 'Holonet' : 'Новости';
  if (!forcedType) {
    if (cid === String(botConfig.eventsChannelId) || cid === String(botConfig.announceChannelId)) {
      type = 'announce';
      type_label = 'Анонс ивента';
    }
    if ((botConfig.newsChannelIds || []).map(String).includes(cid)) {
      type = 'media';
      type_label = 'Видео / медиа';
    }
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
    images: images.slice(0, 12),
    videos: videos.slice(0, 8),
    has_video: videos.length > 0,
  };
}

async function fetchChannelMessages(channelId, limit = 15, forcedType) {
  const rows = await discordRequest(`/channels/${channelId}/messages?limit=${limit}`);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((m) => m.content || m.embeds?.length || m.attachments?.length)
    .map((m) => parseMessage(m, channelId, forcedType));
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

async function fetchHolonetDirect(force = false) {
  const now = Date.now();
  if (!force && cache.holonet.items.length && now - cache.holonet.at < CACHE_MS) {
    return cache.holonet.items;
  }
  const channelId = botConfig.holonetChannelId;
  if (!channelId) return [];
  try {
    const items = await fetchChannelMessages(channelId, 20, 'holonet');
    items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    cache.holonet = { at: now, items: items.slice(0, 20) };
    return cache.holonet.items;
  } catch (e) {
    console.warn('discord-direct holonet', e.message);
    return cache.holonet.items || [];
  }
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
  fetchHolonetDirect,
  fetchEventsDirect,
};
