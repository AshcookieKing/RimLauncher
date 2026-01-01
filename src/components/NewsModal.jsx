import { useEscapeClose } from '../hooks/useEscapeClose';

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
        <p className="block-hint news-modal-hint">Видео и медиа с Discord · анонсы ивентов — в календаре</p>
        <ul className="news-list">
          {news.length === 0 && <li className="news-empty">Новостей пока нет или бот недоступен</li>}
          {news.map((item) => (
            <li key={item.id} className={`news-item news-item--${item.type || 'news'}`}>
              {item.type_label && <span className="news-type-badge">{item.type_label}</span>}
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <div className="news-footer">
                {item.timestamp && <time>{new Date(item.timestamp).toLocaleString('ru-RU')}</time>}
                {item.media_url && (
                  <button type="button" className="link-btn" onClick={() => openUrl(item.media_url)}>
                    Медиа
                  </button>
                )}
                {item.url && (
                  <button type="button" className="link-btn" onClick={() => openUrl(item.url)}>
                    Discord
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
