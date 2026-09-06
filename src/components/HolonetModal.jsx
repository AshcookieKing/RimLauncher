import { useEffect, useMemo, useState } from 'react';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { formatDiscordText } from '../utils/discordText';
import { youtubeEmbedUrl, youtubeWatchUrl } from '../utils/youtube';

export const HOLONET_FALLBACK_IMAGE = './assets/holonews.jpg';

function normalizeVideos(post) {
  const out = [];
  const push = (v) => {
    if (!v) return;
    if (typeof v === 'string') {
      const embed = youtubeEmbedUrl(v);
      if (embed) {
        if (!out.some((x) => x.url === embed)) out.push({ url: embed, kind: 'youtube' });
        return;
      }
      if (!out.some((x) => x.url === v)) out.push({ url: v, kind: 'file' });
      return;
    }
    if (!v.url) return;
    if (v.kind === 'youtube' || youtubeEmbedUrl(v.url)) {
      const embed = youtubeEmbedUrl(v.url);
      if (embed && !out.some((x) => x.url === embed)) {
        out.push({ ...v, url: embed, kind: 'youtube' });
      }
      return;
    }
    if (!out.some((x) => x.url === v.url)) out.push(v);
  };
  (Array.isArray(post?.videos) ? post.videos : []).forEach(push);
  const media = post?.media_url;
  if (media && /\.(mp4|webm|mov|m4v|mkv|ogv)(\?|$)/i.test(String(media))) {
    push({ url: media, kind: 'file' });
  }
  return out;
}

function postImages(post) {
  const imgs = Array.isArray(post?.images) ? post.images.filter(Boolean) : [];
  if (imgs.length) return imgs;
  if (post?.media_url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(post.media_url))) {
    return [post.media_url];
  }
  return [];
}

function postMediaItems(post) {
  const items = [];
  for (const v of normalizeVideos(post)) {
    items.push({
      type: v.kind === 'youtube' ? 'youtube' : 'video',
      url: v.url,
      poster: v.poster || null,
    });
  }
  for (const img of postImages(post)) {
    items.push({ type: 'image', url: img });
  }
  if (!items.length) {
    items.push({ type: 'image', url: HOLONET_FALLBACK_IMAGE });
  }
  return items;
}

function coverOf(post) {
  const videos = normalizeVideos(post);
  const poster = videos.find((v) => v.poster)?.poster;
  if (poster) return poster;
  const imgs = postImages(post);
  if (imgs.length) return imgs[0];
  return HOLONET_FALLBACK_IMAGE;
}

function hasVideo(post) {
  return Boolean(post?.has_video) || normalizeVideos(post).length > 0;
}

function MediaPlayer({ item }) {
  if (!item) return null;
  if (item.type === 'youtube') {
    const watch = youtubeWatchUrl(item.url);
    return (
      <div className="holonet-video-block">
        <div className="holonet-video-wrap">
          <iframe
            className="holonet-video-frame"
            src={youtubeEmbedUrl(item.url) || item.url}
            title="Holonet video"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        {watch && (
          <button
            type="button"
            className="link-btn holonet-yt-fallback"
            onClick={() => window.rimLauncher.openUrl(watch)}
          >
            Открыть на YouTube
          </button>
        )}
      </div>
    );
  }
  if (item.type === 'video') {
    return (
      <video
        className="holonet-video"
        src={item.url}
        poster={item.poster || undefined}
        controls
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <img
      src={item.url}
      alt=""
      onError={(e) => {
        e.currentTarget.src = HOLONET_FALLBACK_IMAGE;
      }}
    />
  );
}

export function HolonetStrip({ posts, visible, onOpenPost, onOpenAll }) {
  const items = useMemo(() => (posts || []).filter((p) => p?.id), [posts]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible || items.length < 2) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [visible, items.length]);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  if (!visible) return null;

  if (!items.length) {
    return (
      <section className="holonet-strip" aria-label="Holonet">
        <header className="holonet-strip-head">
          <div>
            <span className="holonet-kicker">Galactic Newsfeed</span>
            <h3 className="holonet-title">HOLONET</h3>
          </div>
          <button type="button" className="btn-ghost-sm" onClick={onOpenAll}>
            Все передачи
          </button>
        </header>
        <button type="button" className="holonet-slide" onClick={onOpenAll}>
          <div className="holonet-slide-media" style={{ backgroundImage: `url(${HOLONET_FALLBACK_IMAGE})` }}>
            <div className="holonet-slide-shade" />
          </div>
          <div className="holonet-slide-copy">
            <span className="holonet-slide-meta">Ожидание сигнала</span>
            <strong>Нет передач</strong>
            <p>Канал Holonet пуст или бот ещё не видит сообщения. Нажмите «Все передачи» / Обновить.</p>
          </div>
        </button>
      </section>
    );
  }

  const active = items[index] || items[0];
  const cover = coverOf(active);
  const videoBadge = hasVideo(active);

  return (
    <section className="holonet-strip" aria-label="Holonet">
      <header className="holonet-strip-head">
        <div>
          <span className="holonet-kicker">Galactic Newsfeed</span>
          <h3 className="holonet-title">HOLONET</h3>
        </div>
        <button type="button" className="btn-ghost-sm" onClick={onOpenAll}>
          Все передачи
        </button>
      </header>

      <div className="holonet-slider">
        <button
          type="button"
          className="holonet-slide"
          onClick={() => onOpenPost?.(active)}
          title="Открыть передачу"
        >
          <div className="holonet-slide-media" style={{ backgroundImage: `url(${cover})` }}>
            <div className="holonet-slide-shade" />
            {videoBadge && <span className="holonet-play-badge">▶ Видео</span>}
          </div>
          <div className="holonet-slide-copy">
            <span className="holonet-slide-meta">
              {active.author || 'Holonet'}
              {active.timestamp ? ` · ${new Date(active.timestamp).toLocaleDateString('ru-RU')}` : ''}
            </span>
            <strong>{formatDiscordText(active.title)}</strong>
            <p>
              {formatDiscordText((active.body || '').slice(0, 140))}
              {(active.body || '').length > 140 ? '…' : ''}
            </p>
          </div>
        </button>

        {items.length > 1 && (
          <div className="holonet-dots">
            {items.slice(0, 8).map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`holonet-dot ${i === index ? 'active' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`Передача ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="holonet-thumbs">
        {items.slice(0, 6).map((p, i) => {
          const thumb = coverOf(p);
          return (
            <button
              key={p.id}
              type="button"
              className={`holonet-thumb ${i === index ? 'active' : ''}`}
              onClick={() => {
                setIndex(i);
                onOpenPost?.(p);
              }}
              style={{ backgroundImage: `url(${thumb})` }}
              title={formatDiscordText(p.title)}
            >
              {hasVideo(p) && <span className="holonet-thumb-play">▶</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function HolonetModal({ open, posts, focusId, onClose, onRefresh }) {
  useEscapeClose(open, onClose);
  const items = useMemo(() => (posts || []).filter((p) => p?.id), [posts]);
  const [activeId, setActiveId] = useState(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!open) return;
    setActiveId(focusId || items[0]?.id || null);
    setSlide(0);
  }, [open, focusId, items]);

  if (!open) return null;

  const active = items.find((p) => p.id === activeId) || items[0] || null;
  const media = active ? postMediaItems(active) : [];
  const current = media[slide] || media[0] || null;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <section className="modal holonet-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>HOLONET</h2>
          <div className="modal-actions">
            <button type="button" className="btn-ghost-sm" onClick={onRefresh}>
              Обновить
            </button>
            <button type="button" className="btn-ghost-sm" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>
        <p className="block-hint news-modal-hint">
          Галактические новости · фото и видео из Discord можно смотреть прямо здесь
        </p>

        <div className="holonet-modal-layout">
          <aside className="holonet-rail">
            {items.length === 0 && <p className="news-empty">Передач пока нет</p>}
            {items.map((p) => {
              const thumb = coverOf(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`holonet-rail-item ${active?.id === p.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveId(p.id);
                    setSlide(0);
                  }}
                >
                  <span className="holonet-rail-thumb" style={{ backgroundImage: `url(${thumb})` }}>
                    {hasVideo(p) && <span className="holonet-thumb-play">▶</span>}
                  </span>
                  <span className="holonet-rail-copy">
                    <strong>{formatDiscordText(p.title)}</strong>
                    <small>
                      {p.author || 'Holonet'}
                      {hasVideo(p) ? ' · видео' : ''}
                    </small>
                  </span>
                </button>
              );
            })}
          </aside>

          <div className="holonet-detail">
            {!active && <p className="news-empty">Выберите передачу</p>}
            {active && (
              <>
                <div className="holonet-detail-media">
                  <MediaPlayer item={current} />
                  {media.length > 1 && (
                    <div className="holonet-media-nav">
                      <button
                        type="button"
                        className="btn-ghost-sm"
                        onClick={() => setSlide((s) => (s - 1 + media.length) % media.length)}
                      >
                        ←
                      </button>
                      <span>
                        {slide + 1} / {media.length}
                        {current?.type !== 'image' ? ' · видео' : ''}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost-sm"
                        onClick={() => setSlide((s) => (s + 1) % media.length)}
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
                <h3>{formatDiscordText(active.title)}</h3>
                <p className="holonet-detail-meta">
                  {active.author || 'Holonet'}
                  {active.timestamp ? ` · ${new Date(active.timestamp).toLocaleString('ru-RU')}` : ''}
                </p>
                <p className="holonet-detail-body">{formatDiscordText(active.body || '')}</p>
                {active.url && (
                  <button type="button" className="link-btn" onClick={() => window.rimLauncher.openUrl(active.url)}>
                    Открыть в Discord
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
