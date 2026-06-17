import { useState } from 'react';

export default function RimPointModal({ open, onClose, discordUserId, api, onSuccess }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const redeem = async () => {
    if (!discordUserId) {
      setStatus('Укажите Discord ID в настройках');
      return;
    }
    setLoading(true);
    setStatus('');
    const res = await api.redeemBoosty({ discordUserId, code: code.trim() });
    setLoading(false);
    if (res.success) {
      setStatus(`Зачислено ${res.added} RIM POINT. Баланс: ${res.rim_points}`);
      setCode('');
      onSuccess?.();
    } else {
      setStatus(res.error || 'Ошибка');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>RIM POINT</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="block-hint">
            Поддержите проект на Boosty — после оплаты получите ключ подтверждения. 1 ₽ = 1 RIM POINT.
          </p>
          <button type="button" className="btn-ghost-sm" onClick={() => api.openUrl('https://boosty.to/imagundi/donate')}>
            Открыть Boosty
          </button>
          <label className="field">
            <span>Ключ подтверждения</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="RIM-XXXX-XXXX" />
          </label>
          {status && <p className={status.includes('Зачислено') ? 'form-success' : 'form-error'}>{status}</p>}
          <button type="button" className="btn-save" disabled={loading || !code.trim()} onClick={redeem}>
            Подтвердить оплату
          </button>
        </div>
      </section>
    </div>
  );
}
