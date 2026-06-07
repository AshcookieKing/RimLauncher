export default function LaunchDock({ progress, message, launching, onStart }) {
  return (
    <footer className="launch-dock">
      <div className="launch-status">
        <span className="launch-msg">{message}</span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
        <span className="progress-pct">{Math.round(progress)}%</span>
      </div>
      <button type="button" className="btn-start" onClick={onStart} disabled={launching}>
        <span className="btn-start-glow" />
        {launching ? 'ЗАПУСК…' : 'СТАРТ'}
      </button>
    </footer>
  );
}
