import { useCallback, useEffect, useRef, useState } from 'react';

const UNITS_FALLBACK = [
  { id: 'test', label: '🧪 Тест' },
  { id: 'cg', label: 'CG (Ударная гвардия)' },
  { id: '104', label: '104‑й батальон' },
  { id: '83', label: '83‑й батальон' },
  { id: '38', label: '38‑й батальон' },
];

const UNIT_APP_ID_KEY = 'rim_unit_app_id';

export default function SupportHubModal({
  open,
  onClose,
  playerName,
  supportOnline: supportOnlineProp,
  unitApplication: unitAppProp,
  units: unitsProp,
  api,
  onOpenSettings,
  initialMode,
  leaveApproved = false,
  battalion = null,
  onRefresh,
}) {
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
  const [unitForm, setUnitForm] = useState({
    nick: '',
    character_nick: '',
    callsign: '',
    call_time: '',
    timezone: '',
    experience: '',
    desired_position: '',
    reason: '',
  });
  /** Локально закрытая заявка: не давать устаревшему unitAppProp вернуть её в «активна». */
  const localClosedRef = useRef(null);

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
    if (app.status === 'left') return 'unit-closed';
    if (app.status === 'approved' && !app.role_granted) return 'unit-role';
    // role_requested = процесс завершён, не держим как активную
    if (app.status === 'role_requested' || (app.status === 'approved' && app.role_granted)) return 'unit-closed';
    if (app.status === 'processing') return 'unit-chat';
    if (app.status === 'pending') return 'unit-pending';
    if (app.status === 'rejected' || app.status === 'withdrawn') return 'unit-closed';
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
        if (['pending', 'processing', 'approved'].includes(st) && !(st === 'approved' && data.application.role_granted)) {
          applyUnitData(data);
          localStorage.setItem(UNIT_APP_ID_KEY, String(data.application.id));
          return;
        }
        if (['withdrawn', 'rejected', 'left', 'role_requested'].includes(st) || (st === 'approved' && data.application.role_granted)) {
          localStorage.removeItem(UNIT_APP_ID_KEY);
          localClosedRef.current = null;
          setUnitApp(null);
          setUnitMessages([]);
          setMode('unit-select');
          return;
        }
      } else {
        localStorage.removeItem(UNIT_APP_ID_KEY);
      }
    }

    const appId = localStorage.getItem(UNIT_APP_ID_KEY);
    if (appId) {
      const data = await api.getActiveUnitApplication({ appId });
      if (data?.application) {
        const st = data.application.status;
        if (['pending', 'processing'].includes(st) || (st === 'approved' && !data.application.role_granted)) {
          applyUnitData(data);
        } else {
          // role_requested / closed — не блокируем новую заявку
          localStorage.removeItem(UNIT_APP_ID_KEY);
          localClosedRef.current = null;
          setUnitApp(null);
          setUnitMessages([]);
          setMode('unit-select');
        }
      } else {
        localStorage.removeItem(UNIT_APP_ID_KEY);
        setUnitApp(null);
        setMode('unit-select');
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
    if (unitAppProp) {
      const propId = Number(unitAppProp.id || 0);
      const closed = localClosedRef.current;
      if (closed && closed.id === propId) {
        if (['withdrawn', 'rejected', 'left', 'role_requested'].includes(unitAppProp.status)) {
          localClosedRef.current = null;
          localStorage.removeItem(UNIT_APP_ID_KEY);
          setUnitApp(null);
          setMode('unit-select');
        }
        return;
      }
      if (
        unitAppProp.status === 'left' ||
        unitAppProp.status === 'role_requested' ||
        (leaveApproved && ['approved', 'role_requested'].includes(unitAppProp.status))
      ) {
        localStorage.removeItem(UNIT_APP_ID_KEY);
        localClosedRef.current = null;
        setUnitApp(null);
        setMode('unit-select');
        return;
      }
      if (['withdrawn', 'rejected'].includes(unitAppProp.status)) {
        localStorage.removeItem(UNIT_APP_ID_KEY);
        localClosedRef.current = null;
        setUnitApp(null);
        setMode('unit-select');
        return;
      }
      if (localClosedRef.current && mode === 'unit-closed') {
        return;
      }
      setUnitApp(unitAppProp);
      const next = unitModeFromApp(unitAppProp);
      if (['unit-pending', 'unit-chat', 'unit-role'].includes(next) && mode !== next) {
        setMode(next);
      } else if (next === 'unit-closed' || next === 'unit-select') {
        localStorage.removeItem(UNIT_APP_ID_KEY);
        setUnitApp(null);
        setMode('unit-select');
      }
    } else {
      // Нет активной заявки с API — не держим старый unit-done / role_requested экран
      localClosedRef.current = null;
      if (['unit-done', 'unit-closed'].includes(mode) || (mode === 'unit-role' && !unitApp)) {
        localStorage.removeItem(UNIT_APP_ID_KEY);
        setUnitApp(null);
        if (mode === 'unit-done' || mode === 'unit-closed') setMode('unit-select');
      } else if (leaveApproved && !battalion) {
        localStorage.removeItem(UNIT_APP_ID_KEY);
        if (['unit-done', 'unit-role', 'unit-pending', 'unit-chat'].includes(mode)) {
          setUnitApp(null);
          setMode('unit-select');
        }
      }
    }
  }, [unitAppProp, leaveApproved, battalion, mode, unitModeFromApp, unitApp]);

  const markUnitClosed = useCallback((app, status = 'withdrawn') => {
    const closed = { ...(app || {}), status };
    const id = Number(closed.id || 0);
    if (id) localClosedRef.current = { id, status };
    localStorage.removeItem(UNIT_APP_ID_KEY);
    setUnitApp(closed);
    setUnitMessages([]);
    setSelectedUnit('');
    setMode('unit-closed');
  }, []);

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

      if (initialMode === 'unit-select' || initialMode === 'unit-form') {
        await loadUnitState();
        // Prefer subdivision flow when opened from CR card (unless active unit app already set mode)
        setMode((current) => {
          if (['unit-pending', 'unit-chat', 'unit-role', 'unit-done', 'unit-closed', 'unit-form'].includes(current)) {
            return current;
          }
          return 'unit-select';
        });
        return;
      }

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
  }, [open, api, loadTicketMessages, loadUnitState, playerName, refreshDiscordAuth, refreshSupportOnline, initialMode]);

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
        const st = data.application.status;
        if (['role_requested', 'withdrawn', 'rejected', 'left'].includes(st) || (st === 'approved' && data.application.role_granted)) {
          localClosedRef.current = null;
          localStorage.removeItem(UNIT_APP_ID_KEY);
          setUnitApp(null);
          setUnitMessages([]);
          setMode('unit-select');
          return;
        }
        if (localClosedRef.current && Number(data.application.id) === localClosedRef.current.id) {
          return;
        }
        setUnitApp(data.application);
        setUnitMessages(data.messages || []);
        if (st === 'approved' && mode !== 'unit-role' && !data.application.role_granted) {
          setMode('unit-role');
        }
        if (st === 'processing' && mode === 'unit-pending') {
          setMode('unit-chat');
        }
      } else {
        localClosedRef.current = null;
        localStorage.removeItem(UNIT_APP_ID_KEY);
        setUnitApp(null);
        if (['unit-done', 'unit-closed', 'unit-pending', 'unit-chat', 'unit-role'].includes(mode)) {
          setMode('unit-select');
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [open, mode, unitApp?.id, unitApp?.nick, discordUserId, api, playerName, unitForm.nick, nameCandidates]);

  if (!open) return null;

  const needDiscord = () => {
    setError('StarFront: не нашёл вас в Discord. Для тикета укажите ник как на сервере или выберите профиль Arma с тем же ником.');
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
    const uid = await ensureUid([], { requireLinked: true });
    if (!uid) {
      setError('Войдите через Discord в настройках → «Привязать Discord», затем повторите.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.createTicket({
        discord_user_id: uid,
        topic_key: 'custom',
        custom_topic: 'Поддержка',
        player_name: playerName,
      });
      if (!res?.success) {
        setError(res?.error || 'Не удалось создать тикет');
        return;
      }
      setTicket(res.ticket);
      setSupportOnline(true);
      setMode('ticket-chat');
      await loadTicketMessages(res.ticket.id);
    } catch (e) {
      setError(e?.message || 'Таймаут API — перезапустите бота на сервере');
    } finally {
      setLoading(false);
    }
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
    const uid = await ensureUid([], { requireLinked: true });
    if (!uid) {
      setError('Войдите через Discord в настройках, затем повторите.');
      return;
    }
    if (!suggestionText.trim()) {
      setError('Напишите предложение');
      return;
    }
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const res = await api.submitSuggestion({
        discord_user_id: uid,
        text: suggestionText.trim(),
        links: suggestionLinks.trim(),
      });
      if (res?.success) {
        setStatus('Предложение отправлено!');
        setSuggestionText('');
        setSuggestionLinks('');
      } else {
        setError(res?.error || 'Ошибка отправки');
      }
    } catch (e) {
      setError(e?.message || 'Таймаут API');
    } finally {
      setLoading(false);
    }
  };

  const submitUnitApplication = async () => {
    if (!selectedUnit) {
      setError('Выберите подразделение');
      return;
    }
    if (!unitForm.nick.trim() || !(unitForm.character_nick || unitForm.callsign).trim() || !unitForm.experience.trim()) {
      setError('Укажите Discord-ник, ник персонажа и опыт');
      return;
    }
    if (!unitForm.call_time.trim() || !unitForm.timezone.trim()) {
      setError('Укажите готовность играть и часовой пояс');
      return;
    }
    const uid = await ensureUid([], { requireLinked: true });
    if (!uid) {
      setError('Сначала нажмите «Войти через Discord» — так заявка привяжется к вашему аккаунту.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const characterNick = (unitForm.character_nick || unitForm.callsign).trim();
      const res = await api.createUnitApplication({
        discord_user_id: uid,
        unit_id: selectedUnit,
        discord_username: unitForm.nick.trim() || playerName,
        nick: unitForm.nick.trim(),
        character_nick: characterNick,
        callsign: characterNick,
        call_time: unitForm.call_time.trim(),
        timezone: unitForm.timezone.trim(),
        experience: unitForm.experience.trim(),
        reason: unitForm.experience.trim(),
        desired_position: unitForm.desired_position.trim(),
      });
      if (!res?.success) {
        setError(res?.error || 'Не удалось отправить заявку');
        return;
      }
      localStorage.setItem(UNIT_APP_ID_KEY, String(res.application.id));
      setUnitApp(res.application);
      setUnitMessages(res.messages || []);
      setMode('unit-pending');
      setStatus('Заявка отправлена командиру. Ожидайте ответа здесь или в Discord.');
    } catch (e) {
      setError(e?.message || 'Таймаут API');
    } finally {
      setLoading(false);
    }
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
      localStorage.removeItem(UNIT_APP_ID_KEY);
      localClosedRef.current = null;
      setUnitApp(null);
      setMode('unit-select');
      setStatus(
        res.role_granted
          ? 'StarFront: роль выдана. Можно подать новую заявку при необходимости.'
          : 'StarFront: запрос ролей отправлен. Заявка завершена — можно подать новую.'
      );
      try {
        await onRefresh?.();
      } catch {
        /* ignore */
      }
    } else setError(res.error || 'Ошибка');
  };

  const canWithdrawUnit =
    Boolean(unitApp?.id) && !['rejected', 'withdrawn', 'left'].includes(unitApp?.status);

  const withdrawUnitApplication = async () => {
    if (!unitApp?.id) return;
    if (!window.confirm('Отозвать заявку? После отзыва можно будет подать новую.')) return;
    setLoading(true);
    setError('');
    const uid = await ensureUid();
    let res = { success: false };
    try {
      res = (await api.withdrawUnitApplication(unitApp.id, {
        ...(uid ? { discord_user_id: uid } : {}),
        player_nick: unitForm.nick || unitApp.nick || playerName,
      })) || { success: false };
    } catch (e) {
      res = { success: false, error: e?.message || 'Ошибка API' };
    }
    setLoading(false);
    const alreadyClosed = /уже закрыта/i.test(String(res.error || ''));
    if (!res.success && !alreadyClosed) {
      setError(res.error || 'Не удалось отозвать заявку');
      return;
    }
    markUnitClosed(res.application || unitApp, 'withdrawn');
    // Сразу даём подать новую — не держим экран «отозвана»
    localClosedRef.current = null;
    setUnitApp(null);
    setMode('unit-select');
    setStatus('StarFront: заявка отозвана. Можно подать новую.');
    try {
      await onRefresh?.();
    } catch {
      /* ignore */
    }
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
              {units
                .filter((u) => {
                  const req = String(u.requires_faction || '').toUpperCase();
                  return !req || req === 'ВАР' || req === 'CR' || u.is_test;
                })
                .map((u) => (
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
                  <strong>{u.label}</strong>
                  {u.discord_tag ? <span className="unit-tag">{u.discord_tag}</span> : null}
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
            <p className="block-hint bot-hint">
              Заполните форму. Командир при одобрении выберет звание из списка — оно пойдёт в заявку на роли, но не впишется в ник.
              Ник персонажа: номер и позывной (можно с препиской, напр. [CR] 3472 Ima).
            </p>
            <label className="field">
              <span>Ник в Discord</span>
              <input value={unitForm.nick} onChange={(e) => setUnitForm((f) => ({ ...f, nick: e.target.value }))} placeholder={playerName || 'Discord nick'} />
            </label>
            <label className="field">
              <span>Ник персонажа (позывной)</span>
              <input
                value={unitForm.character_nick || unitForm.callsign}
                onChange={(e) =>
                  setUnitForm((f) => ({ ...f, character_nick: e.target.value, callsign: e.target.value }))
                }
                placeholder="[CR] 3472 Ima или 3472 Ima"
              />
            </label>
            <label className="field">
              <span>Сколько готовы играть</span>
              <input value={unitForm.call_time} onChange={(e) => setUnitForm((f) => ({ ...f, call_time: e.target.value }))} placeholder="2–3 часа вечером / каждый день" />
            </label>
            <label className="field">
              <span>Часовой пояс</span>
              <input value={unitForm.timezone} onChange={(e) => setUnitForm((f) => ({ ...f, timezone: e.target.value }))} placeholder="UTC+3" />
            </label>
            <label className="field">
              <span>Какой опыт</span>
              <textarea value={unitForm.experience} onChange={(e) => setUnitForm((f) => ({ ...f, experience: e.target.value }))} rows={3} placeholder="Arma / RP / подразделения…" />
            </label>
            <label className="field">
              <span>Желаемая специализация (необязательно, не должность командира)</span>
              <input value={unitForm.desired_position} onChange={(e) => setUnitForm((f) => ({ ...f, desired_position: e.target.value }))} placeholder="Medic / Pilot / …" />
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
            <p className="block-hint bot-hint">StarFront: заявка у командира. Ожидайте — он напишет здесь или в Discord.</p>
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
            <p className="form-success">Запрос ролей отправлен — заявка завершена</p>
            <p className="block-hint">Она больше не активна. Можно подать новую.</p>
            {status && <p className="block-hint">{status}</p>}
            {error && <p className="form-error">{error}</p>}
            <button
              type="button"
              className="btn-save"
              onClick={() => {
                localClosedRef.current = null;
                localStorage.removeItem(UNIT_APP_ID_KEY);
                setUnitApp(null);
                setUnitMessages([]);
                setMode('unit-select');
                setStatus('');
                onRefresh?.();
              }}
            >
              Подать новую заявку
            </button>
          </div>
        )}

        {mode === 'unit-closed' && unitApp && (
          <div className="modal-body">
            <p className={unitApp.status === 'rejected' ? 'form-error' : 'form-success'}>
              {unitApp.status === 'rejected'
                ? `Заявка #${unitApp.id} отклонена`
                : unitApp.status === 'left'
                  ? `Вы вышли из подразделения${unitApp.id ? ` · заявка #${unitApp.id} закрыта` : ''}`
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
                localClosedRef.current = null;
                localStorage.removeItem(UNIT_APP_ID_KEY);
                setUnitApp(null);
                setUnitMessages([]);
                setMode('unit-select');
                setStatus('');
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
