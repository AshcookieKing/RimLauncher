const STATUS_LABEL = {
  ok: { text: 'OK', className: 'ok' },
  outdated: { text: 'Обновить', className: 'warn' },
  missing: { text: 'Нет', className: 'bad' },
  unknown: { text: '—', className: '' },
};

export default function ModsPanel({ mods, lastCheck, checking, onBack, onRecheck, onSubscribe, onOpenUrl }) {
  const filterOrder = { missing: 0, outdated: 1, unknown: 2, ok: 3 };
  const sorted = [...mods].sort(
    (a, b) => (filterOrder[a.status] ?? 9) - (filterOrder[b.status] ?? 9)
  );

  return (
    <section className="panel mods-panel">
      <header className="panel-header">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← НАЗАД
        </button>
        <h2>МОДЫ ПРЕСЕТА</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRecheck} disabled={checking}>
          {checking ? '…' : 'ОБНОВИТЬ СПИСОК'}
        </button>
      </header>

      {lastCheck && (
        <p className="mods-meta">Последняя проверка: {lastCheck.toLocaleString('ru-RU')}</p>
      )}

      <ul className="mods-list">
        {sorted.map((mod) => {
          const st = STATUS_LABEL[mod.status] || STATUS_LABEL.unknown;
          return (
            <li key={mod.workshopId} className={`mod-item ${st.className}`}>
              <div className="mod-info">
                <span className="mod-name">{mod.name}</span>
                <span className="mod-id">Steam ID: {mod.workshopId}</span>
              </div>
              <span className={`mod-badge ${st.className}`}>{st.text}</span>
              <div className="mod-actions">
                {mod.status === 'missing' && (
                  <button type="button" className="btn btn-sm" onClick={() => onSubscribe(mod.workshopId)}>
                    Подписаться
                  </button>
                )}
                {mod.status === 'outdated' && (
                  <button type="button" className="btn btn-sm" onClick={() => onSubscribe(mod.workshopId)}>
                    Обновить в Steam
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenUrl(mod.steamUrl)}>
                  Steam
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
