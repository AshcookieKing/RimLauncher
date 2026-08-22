import { useEffect, useState } from 'react';
import LogoHolo from './LogoHolo';

const api = window.rimLauncher;

function AuthGateBackground() {
  return (
    <div className="auth-gate-bg" aria-hidden="true">
      <img src="./assets/maxresdefaul.jpg" alt="" className="auth-gate-bg-image" />
      <div className="auth-gate-bg-dim" />
      <div className="auth-gate-bg-vignette" />
      <div className="auth-gate-bg-glow" />
    </div>
  );
}

export default function UpdateModal({ update, onDismiss }) {
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState({ percent: 0, received: 0, total: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!update?.updateAvailable) return undefined;
    const unsub = api.onUpdateDownloadProgress?.((payload) => {
      setProgress({
        percent: payload?.percent ?? 0,
        received: payload?.received ?? 0,
        total: payload?.total ?? 0,
      });
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [update?.updateAvailable]);

  if (!update?.updateAvailable) return null;

  const formatSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} МБ`;
  };

  const startUpdate = async () => {
    setError('');
    setPhase('downloading');
    setProgress({ percent: 0, received: 0, total: 0 });
    try {
      const result = await api.downloadUpdate?.(update);
      if (!result?.ok) {
        setPhase('error');
        setError(result?.error || 'Не удалось скачать обновление');
        return;
      }
      setPhase('applying');
      await api.applyUpdate?.(result.path);
    } catch (e) {
      setPhase('error');
      setError(e.message || 'Ошибка обновления');
    }
  };

  const openInBrowser = () => {
    const url = update.downloadUrl || update.releasePage;
    if (url) api.openUpdatePage(url);
  };

  return (
    <div className="auth-gate-overlay update-modal-overlay">
      <AuthGateBackground />
      <section className="auth-gate-card update-modal" onClick={(e) => e.stopPropagation()}>
        <header className="auth-gate-header">
          <LogoHolo size="sm" />
          <span>Обновление лаунчера</span>
        </header>
        <div className="update-modal__body">
          <p className="update-modal__version">
            <strong>Доступно обновление {update.remoteVersion}</strong>
            <span>Текущая версия: {update.currentVersion}</span>
          </p>
          {update.releaseName && <p className="update-modal__title">{update.releaseName}</p>}
          {update.releaseNotes && (
            <pre className="update-modal__notes">{update.releaseNotes.trim()}</pre>
          )}

          {phase === 'downloading' && (
            <div className="update-modal__progress">
              <div className="update-modal__progress-bar">
                <div
                  className="update-modal__progress-fill"
                  style={{ width: `${Math.max(progress.percent, 2)}%` }}
                />
              </div>
              <span>
                Загрузка… {progress.percent}%
                {progress.total ? ` · ${formatSize(progress.received)} / ${formatSize(progress.total)}` : ''}
              </span>
            </div>
          )}

          {phase === 'applying' && (
            <p className="update-modal__hint">Установка… Лаунчер перезапустится через несколько секунд.</p>
          )}

          {phase === 'error' && error && <p className="form-error">{error}</p>}

          <div className="update-modal__actions">
            {phase === 'idle' || phase === 'error' ? (
              <>
                <button type="button" className="btn-save" onClick={startUpdate}>
                  Обновить сейчас
                </button>
                <button type="button" className="btn-ghost-sm" onClick={openInBrowser}>
                  Скачать в браузере
                </button>
                <button type="button" className="btn-ghost-sm" onClick={onDismiss}>
                  Позже
                </button>
              </>
            ) : null}
            {phase === 'downloading' || phase === 'applying' ? (
              <p className="update-modal__hint">Не закрывайте окно до завершения загрузки.</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
