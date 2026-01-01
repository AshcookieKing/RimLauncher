import { useCallback, useEffect, useState } from 'react';

export default function BattalionLeaveModal({ open, onClose, battalion, leaveRequest: leaveProp, api, profile }) {
  const [leaveReq, setLeaveReq] = useState(leaveProp || null);
  const [messages, setMessages] = useState([]);
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [discordUserId, setDiscordUserId] = useState('');

  const loadLeave = useCallback(async () => {
    const uid = discordUserId || (await api.getDiscordUserId());
    if (!uid) return;
    const data = await api.getActiveLeaveRequest(uid);
    if (data?.request) {
      setLeaveReq(data.request);
      setMessages(data.messages || []);
    }
  }, [api, discordUserId]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setStatus('');
    (async () => {
      const uid = await api.getDiscordUserId();
      setDiscordUserId(uid || '');
      if (leaveProp) {
        setLeaveReq(leaveProp);
        return;
      }
      if (uid) await loadLeave();
    })();
  }, [open, api, leaveProp, loadLeave]);

  useEffect(() => {
    if (!open || !leaveReq?.id) return;
    const t = setInterval(loadLeave, 4000);
    return () => clearInterval(t);
  }, [open, leaveReq?.id, loadLeave]);

  if (!open) return null;

  const submitLeave = async () => {
    setLoading(true);
    setError('');
    const uid = discordUserId || (await api.getDiscordUserId());
    if (!uid) {
      setError('Не удалось привязать Discord');
      setLoading(false);
      return;
    }
    const res = await api.createLeaveRequest({
      discord_user_id: uid,
      reason: reason.trim(),
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Не удалось отправить рапорт');
      return;
    }
    setLeaveReq(res.request);
    setMessages(res.messages || []);
    setStatus('StarFront: рапорт отправлен командиру.');
  };

  const sendMessage = async () => {
    if (!text.trim() || !leaveReq?.id) return;
    const uid = discordUserId || (await api.getDiscordUserId());
    const res = await api.leaveSend(leaveReq.id, { discord_user_id: uid, content: text.trim() });
    if (res.success) {
      setText('');
      setMessages(res.messages || []);
      setLeaveReq(res.request || leaveReq);
    } else setError(res.error || 'Ошибка');
  };

  const mode =
    leaveReq?.status === 'approved'
      ? 'done'
      : leaveReq?.status === 'rejected'
        ? 'closed'
        : leaveReq?.status === 'processing'
          ? 'chat'
          : leaveReq
            ? 'pending'
            : 'form';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Покинуть легион · {battalion?.label || '—'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        {mode === 'form' && (
          <div className="modal-body">
            <p className="block-hint bot-hint">
              StarFront: отправлю командиру рапорт с вашими данными (ник, позывной). После одобрения — снятие ролей
              батальона.
            </p>
            {battalion && (
              <p className="block-hint">
                Подразделение: <strong>{battalion.label}</strong> · в строю: <strong>{battalion.member_count}</strong> ·
                командир: <strong>{battalion.commander_name}</strong>
              </p>
            )}
            <label className="field">
              <span>Причина (необязательно)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn-save" disabled={loading} onClick={submitLeave}>
              Подать рапорт на выход
            </button>
          </div>
        )}

        {mode === 'pending' && leaveReq && (
          <div className="modal-body">
            <p className="form-success">Рапорт #{leaveReq.id} отправлен</p>
            <p className="block-hint bot-hint">Ожидайте решения командира в Discord или здесь.</p>
            {messages.length > 0 && (
              <div className="chat-messages unit-messages-preview">
                {messages.map((m) => (
                  <div key={m.id} className={`chat-msg chat-msg--${m.author_type}`}>
                    <span className="chat-author">{m.author_name || m.author_type}</span>
                    <p>{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            {status && <p className="form-success">{status}</p>}
          </div>
        )}

        {mode === 'chat' && leaveReq && (
          <div className="modal-body ticket-chat">
            <p className="block-hint">Рапорт #{leaveReq.id} · в работе</p>
            <div className="chat-messages">
              {messages.map((m) => (
                <div key={m.id} className={`chat-msg chat-msg--${m.author_type}`}>
                  <span className="chat-author">{m.author_name || m.author_type}</span>
                  <p>{m.content}</p>
                </div>
              ))}
            </div>
            <div className="chat-input-row">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Сообщение командиру…"
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button type="button" onClick={sendMessage}>
                →
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        )}

        {(mode === 'done' || mode === 'closed') && (
          <div className="modal-body">
            <p className={mode === 'done' ? 'form-success' : 'form-error'}>
              {mode === 'done' ? `Рапорт #${leaveReq.id} одобрён` : `Рапорт #${leaveReq.id} отклонён`}
            </p>
            {messages.length > 0 && (
              <div className="chat-messages">
                {messages.map((m) => (
                  <div key={m.id} className={`chat-msg chat-msg--${m.author_type}`}>
                    <span className="chat-author">{m.author_name || m.author_type}</span>
                    <p>{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn-save" onClick={onClose}>
              Закрыть
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
