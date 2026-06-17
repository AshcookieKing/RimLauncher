import { useEffect } from 'react';

export default function EventToast({ event, onClose, onOpen }) {
  useEffect(() => {
    if (!event) return undefined;
    const t = setTimeout(onClose, 20000);
    return () => clearTimeout(t);
  }, [event, onClose]);

  if (!event) return null;

  return (
    <div className="event-toast-overlay" role="alert">
      <button type="button" className="event-toast" onClick={() => onOpen?.(event)}>
        <span className="event-toast-badge">🔴 Ивент</span>
        <strong>{event.title || 'Ивент начался'}</strong>
        <span className="event-toast-sub">
          {event.date}
          {event.time ? ` · ${event.time}` : ''}
        </span>
        <span className="event-toast-hint">Нажмите для подробностей</span>
      </button>
      <button type="button" className="event-toast-close" onClick={onClose} aria-label="Закрыть">
        ✕
      </button>
    </div>
  );
}
