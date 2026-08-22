import { useState } from 'react';
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

export default function NewbieGate({ api, onComplete }) {
  const [busy, setBusy] = useState(false);

  const answer = async (isNewbie) => {
    if (busy) return;
    setBusy(true);
    try {
      if (isNewbie) {
        // Общий Discord сервера — без привязки к конкретному батальону
        await api.openDiscordInvite?.('https://discord.com/channels/1496874607364411558');
      }
      const saved = await api.saveSettings({ newbiePromptComplete: true });
      onComplete?.(saved);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-gate-overlay">
      <AuthGateBackground />
      <div className="auth-gate-card auth-gate-card--minimal newbie-gate-card">
        <header className="auth-gate-header">
          <LogoHolo size="sm" />
          <span>StarFront</span>
        </header>
        <p className="auth-gate-lead">Вы новичок?</p>
        <p className="auth-gate-hint">
          Если да — откроем Discord сервера. Подразделения: CG, 104‑й, RS.
        </p>
        <div className="newbie-gate-actions">
          <button type="button" className="auth-gate-btn newbie-gate-btn-yes" disabled={busy} onClick={() => answer(true)}>
            Да
          </button>
          <button type="button" className="auth-gate-btn newbie-gate-btn-no" disabled={busy} onClick={() => answer(false)}>
            Нет
          </button>
        </div>
      </div>
    </div>
  );
}
