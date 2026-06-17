import { useCallback, useEffect, useState } from 'react';

const TOPICS = [
  { id: 'map_bug', label: 'Баг с картой' },
  { id: 'ts_issue', label: 'Не работает ТС' },
  { id: 'cant_join', label: 'Не могу зайти' },
  { id: 'ace_error', label: 'Ace ругается' },
  { id: 'custom', label: 'Своя тема' },
];

export default function SupportModal({ open, onClose, discordUserId, playerName, api }) {
  const [step, setStep] = useState('pick');
  const [topic, setTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [supportOnline, setSupportOnline] = useState(false);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [tipNote, setTipNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadMessages = useCallback(
    async (ticketId) => {
      const data = await api.ticketMessages(ticketId);
      if (data.success) {
        setMessages(data.messages || []);
        setSupportOnline(data.support_online?.online);
      }
    },
    [api]
  );

  useEffect(() => {
    if (!open || !discordUserId) return;
    (async () => {
      const active = await api.getActiveTicket(discordUserId);
      if (active.ticket) {
        setTicket(active.ticket);
        setStep('chat');
        await loadMessages(active.ticket.id);
      }
    })();
  }, [open, discordUserId, api, loadMessages]);

  useEffect(() => {
    if (!open || step !== 'chat' || !ticket?.id) return;
    const t = setInterval(() => loadMessages(ticket.id), 4000);
    return () => clearInterval(t);
  }, [open, step, ticket, loadMessages]);

  if (!open) return null;

  const startTicket = async () => {
    if (!discordUserId) {
      setError('Укажите Discord ID в настройках');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.createTicket({
        discord_user_id: discordUserId,
        topic_key: topic,
        custom_topic: customTopic,
        player_name: playerName,
      });
      if (!res.success) {
        setError(res.error || 'Не удалось создать тикет');
        return;
      }
      setTicket(res.ticket);
      setStep('chat');
      await loadMessages(res.ticket.id);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || !ticket) return;
    setLoading(true);
    const res = await api.ticketSend(ticket.id, { discord_user_id: discordUserId, content: text.trim() });
    setLoading(false);
    if (res.success) {
      setText('');
      setMessages(res.messages || []);
      setSupportOnline(res.support_online?.online);
    } else setError(res.error || 'Ошибка отправки');
  };

  const closeTicket = async () => {
    if (!ticket) return;
    await api.ticketClose(ticket.id, { discord_user_id: discordUserId });
    setStep('rate');
  };

  const submitRating = async () => {
    if (ticket) {
      await api.ticketRate(ticket.id, {
        discord_user_id: discordUserId,
        rating,
        tip_note: tipNote,
      });
    }
    setTicket(null);
    setStep('pick');
    setTopic('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel support-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Тех. поддержка</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        {step === 'pick' && (
          <div className="modal-body">
            <p className="block-hint">Выберите проблему — откроется чат с тех. администрацией в Discord.</p>
            <div className="topic-grid">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`topic-btn ${topic === t.id ? 'active' : ''}`}
                  onClick={() => setTopic(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {topic === 'custom' && (
              <label className="field">
                <span>Опишите тему</span>
                <input value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="Ваша тема" />
              </label>
            )}
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn-save" disabled={!topic || loading} onClick={startTicket}>
              Создать обращение
            </button>
          </div>
        )}

        {step === 'chat' && ticket && (
          <div className="modal-body ticket-chat">
            <div className="support-status" data-online={supportOnline}>
              Тех. поддержка: онлайн
            </div>
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
                placeholder="Сообщение…"
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button type="button" onClick={sendMessage} disabled={loading}>
                →
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn-ghost-sm" onClick={closeTicket}>
              Закрыть заявку
            </button>
          </div>
        )}

        {step === 'rate' && (
          <div className="modal-body">
            <p>Оцените работу поддержки:</p>
            <div className="rating-row">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={rating >= n ? 'star on' : 'star'} onClick={() => setRating(n)}>
                  ★
                </button>
              ))}
            </div>
            <label className="field">
              <span>Чаевые / комментарий (необязательно)</span>
              <input value={tipNote} onChange={(e) => setTipNote(e.target.value)} placeholder="Boosty и благодарность" />
            </label>
            <button type="button" className="btn-ghost-sm" onClick={() => api.openUrl('https://boosty.to/imagundi/donate')}>
              Оставить чаевые на Boosty
            </button>
            <button type="button" className="btn-save" onClick={submitRating}>
              Готово
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
