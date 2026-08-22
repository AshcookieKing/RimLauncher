export default function MainPanel({
  statusText,
  summary,
  modCount,
  serverHost,
  serverPort,
  onPlay,
  onCheckMods,
  onOpenSettings,
  launching,
  checking,
}) {
  return (
    <section className="panel main-panel">
      <div className="panel-corner tl" />
      <div className="panel-corner tr" />
      <div className="panel-corner bl" />
      <div className="panel-corner br" />

      <h1 className="server-title">
        <span className="subtitle">Star Wars — Clone Wars</span>
        STARFRONT
      </h1>
      <p className="server-desc">
        Тактический RP-сервер эпохи Войн клонов. Подключайся через лаунчер StarFront с полным набором модов.
      </p>

      <div className="status-line">
        <span className="status-pulse" />
        <span>{statusText}</span>
      </div>

      {summary && (
        <div className="mod-summary">
          <span className="pill ok">{summary.ok} OK</span>
          <span className="pill warn">{summary.outdated} обновить</span>
          <span className="pill bad">{summary.missing} нет</span>
        </div>
      )}

      <div className="server-info">
        <div className="info-row">
          <span className="label">Сервер</span>
          <span className="value">{serverHost || '— укажите в настройках —'}</span>
        </div>
        <div className="info-row">
          <span className="label">Порт</span>
          <span className="value">{serverPort || 2302}</span>
        </div>
        <div className="info-row">
          <span className="label">Модов в пресете</span>
          <span className="value">{modCount}</span>
        </div>
      </div>

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-play"
          onClick={onPlay}
          disabled={launching || !serverHost}
          title={!serverHost ? 'Укажите IP сервера в настройках' : ''}
        >
          <span className="btn-glow" />
          {launching ? 'ЗАПУСК…' : 'ИГРАТЬ НА СЕРВЕРЕ'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCheckMods} disabled={checking}>
          {checking ? 'ПРОВЕРКА…' : 'ПРОВЕРИТЬ ОБНОВЛЕНИЯ'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
          НАСТРОЙКИ
        </button>
      </div>
    </section>
  );
}
