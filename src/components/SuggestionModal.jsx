import { useState } from 'react';

export default function SuggestionModal({ open, onClose, discordUserId, api }) {
  const [text, setText] = useState('');
  const [links, setLinks] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!discordUserId) {
      setStatus('Укажите Discord ID в настройках');
      return;
    }
    if (!text.trim()) {
      setStatus('Напишите предложение');
      return;
    }
    setLoading(true);
    const res = await api.submitSuggestion({
      discord_user_id: discordUserId,
      text: text.trim(),
      links: links.trim(),
    });
    setLoading(false);
    if (res.success) {
      setStatus('Предложение отправлено!');
      setText('');
      setLinks('');
      setTimeout(onClose, 1200);
    } else {
      setStatus(res.error || 'Ошибка');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Предложение</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>Ваше предложение</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} />
          </label>
          <label className="field">
            <span>Ссылки (необязательно)</span>
            <input value={links} onChange={(e) => setLinks(e.target.value)} />
          </label>
          {status && <p className={status.includes('отправлено') ? 'form-success' : 'form-error'}>{status}</p>}
          <button type="button" className="btn-save" disabled={loading} onClick={submit}>
            Отправить
          </button>
        </div>
      </section>
    </div>
  );
}
