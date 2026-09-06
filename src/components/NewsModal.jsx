import { useEscapeClose } from '../hooks/useEscapeClose';
import { youtubeEmbedUrl, youtubeWatchUrl } from '../utils/youtube';

function newsVideos(item) {
  const list = Array.isArray(item?.videos) ? item.videos : [];
  const out = [];
  for (const v of list) {
    const url = typeof v === 'string' ? v : v?.url;
    if (!url) continue;
    const embed = youtubeEmbedUrl(url);
    if (embed || (typeof v === 'object' && v.kind === 'youtube')) {
      out.push({
        url: embed || url,
        kind: 'youtube',
        poster: typeof v === 'object' ? v.poster : null,
      });
      continue;
    }
    const kind = (typeof v === 'object' && v.kind) || 'file';
    out.push({ url, kind, poster: typeof v === 'object' ? v.poster : null });
  }
  if (!out.length && item?.media_url) {
    const embed = youtubeEmbedUrl(item.media_url);
    if (embed) out.push({ url: embed, kind: 'youtube' });
    else if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(item.media_url))) {
      out.push({ url: item.media_url, kind: 'file' });
    }
  }
  return out;
}

function newsImages(item) {
  const imgs = Array.isArray(item?.images) ? item.images.filter(Boolean) : [];
  if (imgs.length) return imgs;
  if (item?.media_url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(item.media_url))) {
    return [item.media_url];
  }
  return [];
}

export default function NewsModal({ open, news, onClose, onRefresh, tiktokUrl }) {
  useEscapeClose(open, onClose);

  if (!open) return null;

  const openUrl = (url) => window.rimLauncher.openUrl(url);

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <section className="modal news-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>НОВОСТИ ПРОЕКТА</h2>
          <div className="modal-actions">
            {tiktokUrl && (
              <button type="button" className="btn-ghost-sm" onClick={() => openUrl(tiktokUrl)}>
                TikTok
              </button>
            )}
            <button type="button" className="btn-ghost-sm" onClick={onRefresh}>
              Обновить
            </button>
            <button type="button" className="btn-ghost-sm" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>
        <p className="block-hint news-modal-hint">Видео и медиа с Discord · смотрите прямо в лаунчере</p>
        <ul className="news-list">
          {news.length === 0 && <li className="news-empty">Новостей пока нет или бот недоступен</li>}
          {news.map((item) => {
            const videos = newsVideos(item);
            const images = newsImages(item);
            return (
              <li key={item.id} className={`news-item news-item--${item.type || 'news'}`}>
                {item.type_label && <span className="news-type-badge">{item.type_label}</span>}
                <h3>{item.title}</h3>
                {videos.map((v) =>
                  v.kind === 'youtube' ? (
                    <div key={v.url} className="news-video-block">
                      <div className="news-video-wrap">
                        <iframe
                          className="news-video-frame"
                          src={youtubeEmbedUrl(v.url) || v.url}
                          title={item.title || 'Видео'}
                          referrerPolicy="strict-origin-when-cross-origin"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => openUrl(youtubeWatchUrl(v.url))}
                      >
                        Открыть на YouTube
                      </button>
                    </div>
                  ) : (
                    <video
                      key={v.url}
                      className="news-video"
                      src={v.url}
                      poster={v.poster || undefined}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  )
                )}
                {!videos.length &&
                  images.slice(0, 2).map((src) => <img key={src} className="news-image" src={src} alt="" />)}
                <p>{item.body}</p>
                <div className="news-footer">
                  {item.timestamp && <time>{new Date(item.timestamp).toLocaleString('ru-RU')}</time>}
                  {item.url && (
                    <button type="button" className="link-btn" onClick={() => openUrl(item.url)}>
                      Discord
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
