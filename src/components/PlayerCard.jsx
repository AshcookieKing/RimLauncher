import { formatDiscordText } from '../utils/discordText';

export default function PlayerCard({
  profile,
  online,
  maxPlayers,
  serverStatus,
  nextEvent,
  announcement,
  onOpenEvent,
  onOpenAnnouncement,
  showEventAnnouncement,
  showEventCalendar,
  battalion,
  leaveApproved,
  onLeaveBattalion,
}) {
  const playersOnline = Number(online) || 0;
  const st = String(serverStatus || '').toLowerCase();
  const isServerUp =
    st === 'online' ||
    st === 'running' ||
    st === 'started' ||
    playersOnline > 0;
  const statusLabel = isServerUp ? 'В СЕТИ' : st === 'offline' ? 'ОФФЛАЙН' : '—';

  const eventLabel = nextEvent
    ? nextEvent.is_live
      ? `🔴 Идёт: ${formatDiscordText(nextEvent.title)}`
      : `📅 Ближайший ивент: ${formatDiscordText(nextEvent.title)} · ${nextEvent.date}${nextEvent.time ? ` ${nextEvent.time}` : ''}`
    : null;

  const announceText = announcement
    ? formatDiscordText(
        `${announcement.title || ''}${announcement.body ? `: ${announcement.body}` : ''}`.trim()
      )
    : null;
  const announceLabel = announceText ? `📢 ${announceText.slice(0, 120)}${announceText.length > 120 ? '…' : ''}` : null;

  return (
    <aside className="player-card">
      {showEventAnnouncement !== false && announceLabel && (
        <button
          type="button"
          className="event-banner event-banner--announce"
          onClick={() => onOpenAnnouncement?.(announcement)}
          title="Открыть объявление"
        >
          {announceLabel}
        </button>
      )}
      {showEventCalendar !== false &&
        (eventLabel ? (
          <button
            type="button"
            className="event-banner"
            onClick={() => onOpenEvent?.(nextEvent)}
            title="Подробнее об ивенте"
          >
            {eventLabel}
          </button>
        ) : (
          <button type="button" className="event-banner event-banner--empty" onClick={() => onOpenEvent?.(null)}>
            📅 Ближайший ивент — нажмите для календаря
          </button>
        ))}
      <div className="player-card-inner">
        <h2 className="player-name">{profile.display_name || 'Гость'}</h2>
        {profile.in_game_name && profile.in_game_name !== profile.display_name && (
          <p className="player-nick">{profile.in_game_name}</p>
        )}
        <div className="player-meta">
          <div className="meta-block">
            <span className="meta-label">Звание / роль</span>
            <span className="meta-value">{profile.rank || profile.role || '—'}</span>
          </div>
          <div className="meta-block">
            <span className="meta-label">Фракция</span>
            <span className="meta-value">{profile.faction || '—'}</span>
          </div>
        </div>
        {!battalion && leaveApproved && (
          <p className="battalion-leave-done">Рапорт на выход из легиона одобрен.</p>
        )}
        {battalion && (
          <div className="battalion-block">
            <span className="meta-label">Информация батальона</span>
            <p className="battalion-line">
              Подразделение: <strong>{battalion.label}</strong>
            </p>
            <p className="battalion-line">
              В строю: <strong>{battalion.member_count}</strong> · Командир: <strong>{battalion.commander_name}</strong>
            </p>
            {onLeaveBattalion && (
              <button type="button" className="btn-ghost-sm btn-leave-battalion" onClick={onLeaveBattalion}>
                Покинуть легион
              </button>
            )}
          </div>
        )}
        <div className="online-block" title="Онлайн: прямой запрос A2S к серверу 109.248.4.45:2303 или API бота">
          <span className="online-pulse" data-status={isServerUp ? 'online' : serverStatus} />
          <span className="online-text">
            Игроков онлайн: <strong>{online}</strong>
            {maxPlayers ? ` / ${maxPlayers}` : ''}
          </span>
          <span className="server-status">{statusLabel}</span>
        </div>
      </div>
    </aside>
  );
}
