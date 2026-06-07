import { useCallback, useEffect, useState } from 'react';

const UNITS_FALLBACK = [
  { id: 'test', label: '🧪 Тест' },
  { id: '282', label: '282' },
  { id: '327', label: '327' },
  { id: '346', label: '346' },
];

const UNIT_APP_ID_KEY = 'rim_unit_app_id';

export default function SupportHubModal({ open, onClose, playerName, supportOnline: supportOnlineProp, unitApplication: unitAppProp, units: unitsProp, api, onOpenSettings }) {
  const [mode, setMode] = useState('ticket-chat');
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [supportOnline, setSupportOnline] = useState(false);
  const [discordUserId, setDiscordUserId] = useState('');
  const [discordLinked, setDiscordLinked] = useState(false);
  const [discordUsername, setDiscordUsername] = useState('');
  const [text, setText] = useState('');
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestionLinks, setSuggestionLinks] = useState('');
  const [rating, setRating] = useState(5);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const [units, setUnits] = useState(unitsProp?.length ? unitsProp : UNITS_FALLBACK);
  const [unitApp, setUnitApp] = useState(unitAppProp || null);
  const [unitMessages, setUnitMessages] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [unitForm, setUnitForm] = useState({ nick: '', callsign: '', call_time: '', timezone: '', reason: '' });

  const getUnitMeta = useCallback(
    (unitId) => units.find((u) => u.id === unitId) || {},
    [units]
  );

  const openUnitDiscord = useCallback(
    (unitId) => {
      const url = getUnitMeta(unitId).discord_invite_url;
      if (url) api.openDiscordInvite?.(url);
    },
    [api, getUnitMeta]
  );

  const applySupportOnline = useCallback((data) => {
    if (data === true || data === false) {
      setSupportOnline(Boolean(data));
      return;
    }
    if (data) setSupportOnline(Boolean(data.online));
  }, []);

  const refreshSupportOnline = useCallback(async () => {
    try {
      const data = await api.getSupportOnline();
      if (data?.success !== false) applySupportOnline(data);
    } catch {}
  }, [api, applySupportOnline]);

  const loadTicketMessages = useCallback(
    async (ticketId) => {
      const data = await api.ticketMessages(ticketId);
      if (data.success) {
        setMessages(data.messages || []);
        applySupportOnline(data.support_online);
      }
    },
    [api, applySupportOnline]
  );

  const unitModeFromApp = useCallback((app) => {
    if (!app) return 'unit-select';
    if (app.status === 'approved' && !app.role_granted) return 'unit-role';
    if (app.status === 'role_requested' || (app.status === 'approved' && app.role_granted)) return 'unit-done';
    if (app.status === 'processing') return 'unit-chat';
    if (app.status === 'pending') return 'unit-pending';
    if (app.status === 'rejected' || app.status === 'withdrawn' || app.status === 'left') return 'unit-closed';
    return 'unit-select';
  }, []);

  const applyUnitData = useCallback(
    (data) => {
      if (!data?.application) return;
      setUnitApp(data.application);
      setUnitMessages(data.messages || []);
      setMode(unitModeFromApp(data.application));
    },
    [unitModeFromApp]
  );

  const refreshDiscordAuth = useCallback(async () => {
    const auth = await api.getDiscordAuthStatus?.();
    if (!auth) return;
    setDiscordLinked(Boolean(auth.linked));
    setDiscordUserId(auth.discordUserId || '');
    setDiscordUsername(auth.discordUsername || '');
    if (auth.discordUsername) {
      setUnitForm((f) => ({ ...f, nick: f.nick || auth.discordUsername }));
    }
  }, [api]);

  const loadUnitState = useCallback(async () => {
    await refreshDiscordAuth();

    const auth = await api.getDiscordAuthStatus?.();
    const uid = auth?.discordUserId || (await api.getDiscordUserId([], { allowResolve: false }));
    if (uid) {
      const data = await api.getActiveUnitApplication({ discordUserId: uid });
      if (data?.application) {
        const st = data.application.status;
        if (['pending', 'processing', 'approved', 'role_requested'].includes(st)) {
          applyUnitData(data);
          localStorage.setItem(UNIT_APP_ID_KEY, String(data.application.id));
          return;
        }
        if (['withdrawn', 'rejected', 'left'].includes(st)) {
          setUnitApp(data.application);
          setUnitMessages(data.messages || []);
          setMode('unit-closed');
          return;
        }
      }
    }

    const appId = localStorage.getItem(UNIT_APP_ID_KEY);
    if (appId) {
      const data = await api.getActiveUnitApplication({ appId });
      if (data?.application) {
        const st = data.application.status;
        if (['withdrawn', 'rejected', 'left'].includes(st)) {
          setUnitApp(data.application);
          setUnitMessages(data.messages || []);
          setMode('unit-closed');
        } else if (['pending', 'processing', 'approved', 'role_requested'].includes(st)) {
          applyUnitData(data);
        } else {
          localStorage.removeItem(UNIT_APP_ID_KEY);
        }
      } else {
        localStorage.removeItem(UNIT_APP_ID_KEY);
      }
    }
  }, [api, applyUnitData, discordUserId, refreshDiscordAuth]);

  const nameCandidates = useCallback(
    () => [playerName, unitForm.nick, unitForm.callsign].map((n) => String(n || '').trim()).filter(Boolean),
    [playerName, unitForm.nick, unitForm.callsign]
  );

  useEffect(() => {
    if (supportOnlineProp !== undefined) applySupportOnline(supportOnlineProp);
  }, [supportOnlineProp, applySupportOnline]);

  useEffect(() => {
    if (unitsProp?.length) setUnits(unitsProp);
  }, [unitsProp]);

  useEffect(() => {
    if (unitAppProp) setUnitApp(unitAppProp);
  }, [unitAppProp]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setStatus('');
    refreshSupportOnline();
    (async () => {
      await refreshDiscordAuth();
      const uid = (await api.getDiscordAuthStatus?.())?.discordUserId || '';
      setDiscordUserId(uid || '');

      const list = await api.getUnitList();
      if (list?.units?.length) setUnits(list.units);

      if (uid) {
        const active = await api.getActiveTicket(uid);
        if (active.ticket) {
          setTicket(active.ticket);
          setMode('ticket-chat');
          loadTicketMessages(active.ticket.id);
        } else {
          setMode('ticket-chat');
        }
      } else {
        setMode('ticket-chat');
      }

      await loadUnitState();
    })();
  }, [open, api, loadTicketMessages, loadUnitState, playerName, refreshDiscordAuth, refreshSupportOnline]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(refreshSupportOnline, 15000);
    return () => clearInterval(t);
  }, [open, refreshSupportOnline]);

  useEffect(() => {
    if (!open || mode !== 'ticket-chat' || !ticket?.id) return;
    const t = setInterval(() => loadTicketMessages(ticket.id), 4000);
    return () => clearInterval(t);
  }, [open, mode, ticket, loadTicketMessages]);

  useEffect(() => {
    if (!open || !['unit-chat', 'unit-pending', 'unit-role', 'unit-done', 'unit-closed'].includes(mode) || !unitApp?.id) return;
    const t = setInterval(async () => {
      const appId = localStorage.getItem(UNIT_APP_ID_KEY);
      let data = null;
      if (appId) {
        data = await api.getActiveUnitApplication({ appId });
      } else {
        const auth = await api.getDiscordAuthStatus?.();
        const uid = auth?.discordUserId || discordUserId || (await api.getDiscordUserId(nameCandidates(), { allowResolve: false }));
        if (uid) {
          data = await api.getActiveUnitApplication({ discordUserId: uid });
        } else {
          const nick = unitApp?.nick || unitForm.nick || playerName;
          if (nick) data = await api.getActiveUnitApplication({ nick });
        }
      }
      if (data?.application) {
        setUnitApp(data.application);
        setUnitMessages(data.messages || []);
        if (data.application.status === 'approved' && mode !== 'unit-role' && !data.application.role_granted) {
          setMode('unit-role');
        }
        if (data.application.status === 'processing' && mode === 'unit-pending') {
          setMode('unit-chat');
        }
        if (data.application.status === 'role_requested') {
          setMode('unit-done');
        }
        if (data.application.status === 'rejected' || data.application.status === 'withdrawn' || data.application.status === 'left') {
          setMode('unit-closed');
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [open, mode, unitApp?.id, unitApp?.nick, discordUserId, api, playerName, unitForm.nick, nameCandidates]);

  if (!open) return null;

  const needDiscord = () => {
    setError('Rim Launcher: не нашёл вас в Discord. Для тикета укажите ник как на сервере или выберите профиль Arma с тем же ником.');
  };

  const ensureUid = async (extra = [], { requireLinked = false } = {}) => {
    if (requireLinked) {
      const auth = await api.getDiscordAuthStatus?.();
      if (auth?.linked && auth.discordUserId) {
        setDiscordLinked(true);
        setDiscordUserId(auth.discordUserId);
        return auth.discordUserId;
      }
      return '';
    }
    const names = [...new Set([...nameCandidates(), ...extra])];
    let uid = discordUserId || (await api.getDiscordUserId(names, { allowResolve: true }));
    if (!uid) {
      await api.fetchDiscordData?.();
      uid = await api.getDiscordUserId(names, { allowResolve: true });
    }
    if (uid) setDiscordUserId(uid);
    return uid;
  };

  const startTicket = async () => {
    const uid = await ensureUid();
    if (!uid) return needDiscord();
    setLoading(true);
    setError('');
    const res = await api.createTicket({
      discord_user_id: uid,
      topic_key: 'custom',
      custom_topic: 'Поддержка',
      player_name: playerName,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Не удалось создать тикет');
      return;
    }
    setTicket(res.ticket);
    setSupportOnline(true);
    setMode('ticket-chat');
    await loadTicketMessages(res.ticket.id);
  };

  const sendMessage = async () => {
    if (!text.trim() || !ticket) return;
    const uid = await ensureUid();
    if (!uid) return needDiscord();
    setLoading(true);
    const res = await api.ticketSend(ticket.id, { discord_user_id: uid, content: text.trim() });
    setLoading(false);
    if (res.success) {
      setText('');
      setMessages(res.messages || []);
      setSupportOnline(true);
      applySupportOnline(res.support_online);
    } else setError(res.error || 'Ошибка отправки');
  };

  const submitSuggestion = async () => {
    const uid = await ensureUid();
    if (!uid) return needDiscord();
    if (!suggestionText.trim()) {
      setError('Напишите предложение');
      return;
    }
    setLoading(true);
    const res = await api.submitSuggestion({
      discord_user_id: uid,
      text: suggestionText.trim(),
      links: suggestionLinks.trim(),
    });
    setLoading(false);
    if (res.success) {
      setStatus('Предложение отправлено!');
      setSuggestionText('');
      setSuggestionLinks('');
    } else setError(res.error || 'Ошибка');
  };

  const submitUnitApplication = async () => {
    if (!selectedUnit) {
      setError('Выберите подразделение');
      return;
    }
    if (!unitForm.nick.trim() || !unitForm.callsign.trim() || !unitForm.reason.trim()) {
      setError('Rim Launcher: укажите Discord-ник, позывной и «Почему к нам»');
      return;
    }
    const uid = await ensureUid([], { requireLinked: true });
    if (!uid) {
      setError('Сначала нажмите «Войти через Discord» — так заявка привяжется к вашему аккаунту.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await api.createUnitApplication({
      discord_user_id: uid,
      unit_id: selectedUnit,
      discord_username: unitForm.nick.trim() || playerName,
      ...unitForm,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Не удалось отправить заявку');
      return;
    }
    localStorage.setItem(UNIT_APP_ID_KEY, String(res.application.id));
    setUnitApp(res.application);
    setUnitMessages(res.messages || []);
    setMode('unit-pending');
    setStatus('Rim Launcher: заявка отправлена командиру. Ожидайте ответа здесь или в Discord.');
  };

  const sendUnitMessage = async () => {
    if (!text.trim() || !unitApp?.id) return;
    setLoading(true);
    const uid = await ensureUid();
    const res = await api.unitApplicationSend(unitApp.id, {
      ...(uid ? { discord_user_id: uid } : {}),
      content: text.trim(),
      player_nick: unitForm.nick || unitApp.nick || playerName,
    });
    setLoading(false);
    if (res.success) {
      setText('');
      setUnitMessages(res.messages || []);
      setUnitApp(res.application || unitApp);
    } else setError(res.error || 'Ошибка отправки');
  };

  const submitRoleRequest = async () => {
    if (!unitApp?.id) return;
    setLoading(true);
    setError('');
    const uid = await ensureUid([], { requireLinked: true });
    if (!uid) {
      setError('Привяжите Discord в настройках лаунчера');
      setLoading(false);
      return;
    }
    const res = await api.submitUnitRoleRequest(unitApp.id, {
      discord_user_id: uid,
      auto_grant: true,
    });
    setLoading(false);
    if (res.success) {
      setUnitApp(res.application);
      setMode('unit-done');
      setStatus(res.role_granted ? 'Rim Launcher: роль батальона выдана автоматически' : 'Rim Launcher: запрос отправлен в Discord');
    } else setError(res.error || 'Ошибка');
  };

  const isTestUnit = unitApp?.unit_id === 'test';
  const canWithdrawUnit =
    Boolean(unitApp?.id) &&
    !['rejected', 'withdrawn', 'left'].includes(unitApp?.status) &&
    (isTestUnit ||
      (unitApp?.status !== 'role_requested' && !(unitApp?.status === 'approved' && unitApp?.role_granted)));

  const withdrawUnitApplication = async () => {
    if (!unitApp?.id) return;
    if (!window.confirm('Отозвать заявку? Её можно будет подать заново.')) return;
    setLoading(true);
    setError('');
    const uid = await ensureUid();
    const res = await api.withdrawUnitApplication(unitApp.id, {
      ...(uid ? { discord_user_id: uid } : {}),
      player_nick: unitForm.nick || unitApp.nick || playerName,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Не удалось отозвать заявку');
      return;
    }
    localStorage.removeItem(UNIT_APP_ID_KEY);
    setUnitApp(null);
    setUnitMessages([]);
    setMode('unit-select');
    setSelectedUnit('');
    setStatus('Rim Launcher: заявка отозвана. Можете подать новую.');
  };

  const closeTicket = async () => {
    if (!ticket) return;
    const uid = await ensureUid();
    if (uid) await api.ticketClose(ticket.id, { discord_user_id: uid });
    setTicket(null);
    setMode('rate');
  };

  const submitRating = async () => {
    if (ticket) {
      const uid = await ensureUid();
      if (uid) await api.ticketRate(ticket.id, { discord_user_id: uid, rating, tip_note: '' });
    }
    setTicket(null);
    onClose();
  };

  const onlineLabel = 'онлайн';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel support-hub" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header support-hub-header">
          <div className="support-hub-top">
            <h2>Поддержка</h2>
            <span className="support-status" data-online="true">
              {onlineLabel}
            </span>
            <button type="button" className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="hub-tabs">
            <button type="button" className={`hub-tab ${mode.startsWith('ticket') || mode === 'rate' ? 'active' : ''}`} onClick={() => setMode(ticket ? 'ticket-chat' : 'ticket-chat')}>
              Тикет
            </button>
            <button type="button" className={`hub-tab ${mode === 'suggestion' ? 'active' : ''}`} onClick={() => setMode('suggestion')}>
              Предложение
            </button>
            <button
              type="button"
              className={`hub-tab ${mode.startsWith('unit') ? 'active' : ''}`}
              onClick={() => setMode(unitModeFromApp(unitApp))}
            >
              Заявка в подразделение
            </button>
          </div>
        </header>

        {mode === 'ticket-chat' && (
          <div className="modal-body ticket-chat">
            {!ticket ? (
              <>
                <p className="block-hint">Напишите в чат — откроется тикет с тех. поддержкой</p>
                {error && <p className="form-error">{error}</p>}
                <button type="button" className="btn-save" disabled={loading} onClick={startTicket}>
                  Начать диалог
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}

        {mode === 'suggestion' && (
          <div className="modal-body">
            <label className="field">
              <span>Ваше предложение</span>
              <textarea value={suggestionText} onChange={(e) => setSuggestionText(e.target.value)} rows={5} />
            </label>
            <label className="field">
              <span>Ссылки (необязательно)</span>
              <input value={suggestionLinks} onChange={(e) => setSuggestionLinks(e.target.value)} />
            </label>
            {error && <p className="form-error">{error}</p>}
            {status && <p className="form-success">{status}</p>}
            <button type="button" className="btn-save" disabled={loading} onClick={submitSuggestion}>
              Отправить предложение
            </button>
          </div>
        )}

        {mode === 'unit-select' && (
          <div className="modal-body">
            {discordLinked ? (
              <p className="form-success">
                Discord: <strong>{discordUsername || discordUserId}</strong>
              </p>
            ) : (
              <p className="form-error">
                Для заявки нужна привязка Discord —{' '}
                <button
                  type="button"
                  className="btn-link-inline"
                  onClick={() => {
                    onClose();
                    onOpenSettings?.();
                  }}
                >
                  откройте настройки
                </button>
              </p>
            )}
            <p className="block-hint bot-hint">Выберите подразделение — дальше заполните форму.</p>
            <div className="topic-grid">
              {units.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`topic-btn ${selectedUnit === u.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedUnit(u.id);
                    setUnitForm((f) => ({ ...f, nick: f.nick || playerName || '' }));
                    setMode('unit-form');
                  }}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'unit-form' && (
          <div className="modal-body">
            <button type="button" className="btn-ghost-sm" onClick={() => setMode('unit-select')}>
              ← Назад
            </button>
            <p className="block-hint">Подразделение: {selectedUnit}</p>
            {!discordLinked && (
              <p className="form-error">
                Нужна привязка Discord —{' '}
                <button
                  type="button"
                  className="btn-link-inline"
                  onClick={() => {
                    onClose();
                    onOpenSettings?.();
                  }}
                >
                  настройки лаунчера
                </button>
              </p>
            )}
            {getUnitMeta(selectedUnit).discord_invite_url && (
              <button type="button" className="btn-ghost-sm" onClick={() => openUnitDiscord(selectedUnit)}>
                Discord-сервер {selectedUnit}
              </button>
            )}
            {discordLinked && (
              <p className="form-success">
                Аккаунт: <strong>{discordUsername || discordUserId}</strong>
              </p>
            )}
            <p className="block-hint bot-hint">Укажите позывной и остальное — заявка уйдёт командиру с вашим Discord ID.</p>
            <label className="field">
              <span>Discord-ник (как на сервере)</span>
              <input value={unitForm.nick} onChange={(e) => setUnitForm((f) => ({ ...f, nick: e.target.value }))} placeholder={playerName || 'CT 1234 Nickname'} />
            </label>
            <label className="field">
              <span>Позывной</span>
              <input value={unitForm.callsign} onChange={(e) => setUnitForm((f) => ({ ...f, callsign: e.target.value }))} />
            </label>
            <label className="field">
              <span>Когда удобно созвониться</span>
              <input value={unitForm.call_time} onChange={(e) => setUnitForm((f) => ({ ...f, call_time: e.target.value }))} />
            </label>
            <label className="field">
              <span>Часовой пояс</span>
              <input value={unitForm.timezone} onChange={(e) => setUnitForm((f) => ({ ...f, timezone: e.target.value }))} placeholder="UTC+3" />
            </label>
            <label className="field">
              <span>Почему именно к нам</span>
              <textarea value={unitForm.reason} onChange={(e) => setUnitForm((f) => ({ ...f, reason: e.target.value }))} rows={4} />
            </label>
            {error && <p className="form-error">{error}</p>}
            {status && <p className="form-success">{status}</p>}
            <button type="button" className="btn-save" disabled={loading} onClick={submitUnitApplication}>
              Отправить заявку
            </button>
          </div>
        )}

        {mode === 'unit-pending' && unitApp && (
          <div className="modal-body">
            <p className="form-success">Заявка #{unitApp.id} отправлена · подразделение {unitApp.unit_id}</p>
            <p className="block-hint bot-hint">Rim Launcher: заявка у командира. Ожидайте — он напишет здесь или в Discord.</p>
            {unitMessages.length > 0 && (
              <div className="chat-messages unit-messages-preview">
                {unitMessages.map((m) => (
                  <div key={m.id} className={`chat-msg chat-msg--${m.author_type}`}>
                    <span className="chat-author">{m.author_name || m.author_type}</span>
                    <p>{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            {status && <p className="form-success">{status}</p>}
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn-ghost-sm" disabled={loading} onClick={withdrawUnitApplication}>
              Отозвать заявку
            </button>
          </div>
        )}

        {mode === 'unit-chat' && unitApp && (
          <div className="modal-body ticket-chat">
            <p className="block-hint">Заявка #{unitApp.id} · {unitApp.unit_id} · в работе</p>
            <div className="chat-messages">
              {unitMessages.map((m) => (
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
                onKeyDown={(e) => e.key === 'Enter' && sendUnitMessage()}
              />
              <button type="button" onClick={sendUnitMessage} disabled={loading}>
                →
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn-ghost-sm" disabled={loading} onClick={withdrawUnitApplication}>
              Отозвать заявку
            </button>
          </div>
        )}

        {mode === 'unit-role' && unitApp && (
          <div className="modal-body">
            <p className="form-success">Заявка одобрена!</p>
            <p className="block-hint">
              Роль батальона {unitApp.unit_id} будет выдана автоматически по вашему подразделению.
            </p>
            <p className="block-hint">
              Ник по форме: [{unitApp.unit_id}] Звание &quot;номер&quot; &quot;{unitApp.callsign}&quot;
            </p>
            {getUnitMeta(unitApp.unit_id).discord_invite_url && (
              <button type="button" className="btn-ghost-sm" onClick={() => openUnitDiscord(unitApp.unit_id)}>
                Открыть Discord-сервер {unitApp.unit_id}
              </button>
            )}
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn-save" disabled={loading} onClick={submitRoleRequest}>
              Получить роль батальона
            </button>
            {canWithdrawUnit && (
              <button type="button" className="btn-ghost-sm" disabled={loading} onClick={withdrawUnitApplication}>
                Отозвать заявку
              </button>
            )}
          </div>
        )}

        {mode === 'unit-done' && (
          <div className="modal-body">
            <p className="form-success">Запрос ролей отправлен в Discord</p>
            {status && <p className="block-hint">{status}</p>}
            {error && <p className="form-error">{error}</p>}
            {canWithdrawUnit && (
              <button type="button" className="btn-ghost-sm" disabled={loading} onClick={withdrawUnitApplication}>
                Отозвать заявку
              </button>
            )}
          </div>
        )}

        {mode === 'unit-closed' && unitApp && (
          <div className="modal-body">
            <p className={unitApp.status === 'rejected' ? 'form-error' : 'form-success'}>
              {unitApp.status === 'rejected'
                ? `Заявка #${unitApp.id} отклонена`
                : `Заявка #${unitApp.id} отозвана`}
            </p>
            {unitMessages.length > 0 && (
              <div className="chat-messages">
                {unitMessages.map((m) => (
                  <div key={m.id} className={`chat-msg chat-msg--${m.author_type}`}>
                    <span className="chat-author">{m.author_name || m.author_type}</span>
                    <p>{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn-save"
              onClick={() => {
                localStorage.removeItem(UNIT_APP_ID_KEY);
                setUnitApp(null);
                setUnitMessages([]);
                setMode('unit-select');
              }}
            >
              Подать новую заявку
            </button>
          </div>
        )}

        {mode === 'rate' && (
          <div className="modal-body">
            <p>Оцените работу поддержки:</p>
            <div className="rating-row">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={rating >= n ? 'star on' : 'star'} onClick={() => setRating(n)}>
                  ★
                </button>
              ))}
            </div>
            <button type="button" className="btn-save" onClick={submitRating}>
              Готово
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
