import { formatDiscordText } from '../utils/discordText';

export default function AnnouncementModal({ open, onClose, announcement }) {
  if (!open || !announcement) return null;

  const title = formatDiscordText(announcement.title);
  const body = formatDiscordText(announcement.body);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Объявление</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <h3 className="announce-title">{title}</h3>
          {body && body !== title && <p className="announce-body">{body}</p>}
          {announcement.author && <p className="block-hint">Автор: {announcement.author}</p>}
        </div>
      </section>
    </div>
  );
}
