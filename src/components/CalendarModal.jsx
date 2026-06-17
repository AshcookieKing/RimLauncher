import { useEffect, useState } from 'react';
import { formatDiscordText } from '../utils/discordText';

export default function CalendarModal({ open, onClose, api, initialData, focusEvent }) {
  const [data, setData] = useState(initialData || null);

  useEffect(() => {
    if (!open) return;
    if (initialData) setData(initialData);
    else api.getEvents().then(setData).catch(() => {});
  }, [open, api, initialData]);

  if (!open) return null;

  const live = data?.live || [];
  const upcoming = data?.upcoming || [];
  const focused =
    focusEvent ||
    data?.next_event ||
    live[0] ||
    upcoming[0] ||
    null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel calendar-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Календарь ивентов</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          {focused ? (
            <article className={`cal-event cal-event--focus ${focused.is_live ? 'cal-event--live' : ''}`}>
              <h3 className="cal-section-title">{focused.is_live ? 'Сейчас идёт' : 'Ближайший ивент'}</h3>
              <strong>{formatDiscordText(focused.title)}</strong>
              {focused.description && <p>{formatDiscordText(focused.description)}</p>}
              <span>
                {focused.date} {focused.time}
                {focused.duration_minutes ? ` · ${focused.duration_minutes} мин` : ''}
              </span>
              {focused.author && <p className="block-hint">Ивентолог: {focused.author}</p>}
            </article>
          ) : (
            <p className="block-hint">Нет запланированных ивентов</p>
          )}

          {live.filter((e) => e.id !== focused?.id).length > 0 && (
            <>
              <h3 className="cal-section-title">Другие live</h3>
              {live
                .filter((e) => e.id !== focused?.id)
                .map((e) => (
                  <article key={e.id} className="cal-event cal-event--live">
                    <strong>{formatDiscordText(e.title)}</strong>
                    <p>{formatDiscordText(e.description)}</p>
                    <span>
                      {e.date} {e.time}
                    </span>
                  </article>
                ))}
            </>
          )}

          <h3 className="cal-section-title">Ближайшие</h3>
          {upcoming.filter((e) => e.id !== focused?.id).length === 0 && !focused && (
            <p className="block-hint">Нет запланированных ивентов</p>
          )}
          {upcoming
            .filter((e) => e.id !== focused?.id)
            .map((e) => (
              <article key={e.id} className="cal-event">
                <strong>{formatDiscordText(e.title)}</strong>
                <p>{formatDiscordText(e.description)}</p>
                <span>
                  {e.date} {e.time} · {e.duration_minutes} мин
                </span>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
