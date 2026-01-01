import LogoHolo from './LogoHolo';

export default function TitleBar({
  rimPoints,
  onOpenSettings,
  onOpenNews,
  onOpenGuide,
  onOpenSupport,
  onOpenRpRules,
  onOpenDonate,
}) {
  return (
    <header className="title-bar">
      <LogoHolo size="md" />
      <span className="title-text">STARFRONT</span>

      <div className="title-actions">
        <button type="button" className="title-link title-link--support" onClick={onOpenSupport}>
          ПОДДЕРЖКА
        </button>
        <button type="button" className="title-link" onClick={onOpenRpRules}>
          РП ПРАВИЛА
        </button>
        <button type="button" className="title-link" onClick={onOpenGuide}>
          ГАЙД
        </button>
        <button type="button" className="title-link" onClick={onOpenNews}>
          НОВОСТИ
        </button>
        <button type="button" className="title-link" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>

      <div
        className="rim-points-badge rim-points-badge--click"
        title="Услуги Студии и пожертвования"
        role="button"
        tabIndex={0}
        onClick={onOpenDonate}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenDonate?.()}
      >
        <span className="rp-label">STAR POINT</span>
        <span className="rp-value">{rimPoints ?? 0}</span>
      </div>

      <div className="window-controls">
        <button type="button" className="win-btn" onClick={() => window.rimLauncher.minimize()} title="Свернуть">
          —
        </button>
        <button type="button" className="win-btn close" onClick={() => window.rimLauncher.close()} title="Закрыть">
          ✕
        </button>
      </div>
    </header>
  );
}
