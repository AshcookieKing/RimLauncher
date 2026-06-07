export default function NewsModal({ open, news, onClose, onRefresh }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <section className="modal news-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>НОВОСТИ ПРОЕКТА</h2>
          <div className="modal-actions">
            <button type="button" className="btn-ghost-sm" onClick={onRefresh}>
              Обновить
            </button>
            <button type="button" className="btn-ghost-sm" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>
        <ul className="news-list">
          {news.length === 0 && <li className="news-empty">Новостей пока нет или бот недоступен</li>}
          {news.map((item) => (
            <li key={item.id} className="news-item">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <div className="news-footer">
                {item.timestamp && (
                  <time>{new Date(item.timestamp).toLocaleString('ru-RU')}</time>
                )}
                {item.url && (
                  <button type="button" className="link-btn" onClick={() => window.rimLauncher.openUrl(item.url)}>
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
