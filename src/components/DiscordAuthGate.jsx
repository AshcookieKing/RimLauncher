import { useEffect, useState } from 'react';
import LogoHolo from './LogoHolo';

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

export default function DiscordAuthGate({ api, onAuthenticated }) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = await api.getDiscordAuthStatus?.();
        if (!cancelled && auth?.linked) {
          onAuthenticated?.(auth);
          return;
        }
      } catch {}
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, onAuthenticated]);

  useEffect(() => {
    const handler = (payload) => {
      if (payload?.discordUserId) {
        onAuthenticated?.(payload);
        setLoading(false);
      }
    };
    api.onDiscordAuthUpdated?.(handler);
    return () => {};
  }, [api, onAuthenticated]);

  const login = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.loginDiscord();
      if (!res?.success) {
        setError(res?.error || 'Не удалось войти через Discord');
        return;
      }
      await api.fetchDiscordData?.();
      onAuthenticated?.(res);
    } catch (e) {
      setError(e.message || 'Ошибка авторизации Discord');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="auth-gate-overlay">
        <AuthGateBackground />
        <div className="auth-gate-card auth-gate-card--loading">
          <LogoHolo size="lg" />
          <div className="loader-ring" />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-gate-overlay">
      <AuthGateBackground />
      <div className="auth-gate-card auth-gate-card--minimal">
        <header className="auth-gate-header">
          <LogoHolo size="sm" />
          <span>StarFront Launcher</span>
        </header>
        {error && <p className="form-error auth-gate-error">{error}</p>}
        <button type="button" className="auth-gate-btn" disabled={loading} onClick={login}>
          <span className="auth-gate-btn-icon">›</span>
          {loading ? 'Авторизация…' : 'АВТОРИЗОВАТЬСЯ'}
        </button>
      </div>
    </div>
  );
}
