import { useEffect, useState } from 'react';
import { useEscapeClose } from '../hooks/useEscapeClose';

const FACTIONS = ['ВАР', 'БСО', 'ДЖЕДАИ', 'НАЙМЫ'];
const RANK_OPTIONS = ['', 'CT', 'CRT', 'PFC', 'LCPL', 'CPL', 'SGT', 'SSG', 'LT', '1LT', 'CPT', 'MAJ'];

const STATUS_LABEL = {
  approved: 'Верифицирован',
  pending: 'Ожидает модерации',
  rejected: 'Отклонён',
  superseded: 'Заменён',
  withdrawn: 'Отозвана',
};

/**
 * @param {'new'|'additional'|'reverify'} [mode]
 * @param {object|null} [prefill] — персонаж для переверификации
 */
export default function CharacterVerifyModal({
  open,
  onClose,
  api,
  onSubmitted,
  verification,
  verifications,
  mode = 'new',
  prefill = null,
}) {
  const [discordNick, setDiscordNick] = useState('');
  const [faction, setFaction] = useState('ВАР');
  const [characterNick, setCharacterNick] = useState('');
  const [rank, setRank] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [factions, setFactions] = useState(FACTIONS);
  const [pendingBlock, setPendingBlock] = useState(false);
  const [pendingId, setPendingId] = useState(null);

  useEscapeClose(open, onClose);

  const isReverify = mode === 'reverify' && prefill?.id;
  const isAdditional = mode === 'additional' || (mode === 'new' && verification?.status === 'approved');

  const refreshPending = async () => {
    try {
      const res = await api.getCharacterVerification?.();
      if (res?.factions?.length) setFactions(res.factions);
      const list = res?.verifications || verifications || [];
      const pending =
        list.find((v) => v.status === 'pending') ||
        (res?.verification?.status === 'pending' ? res.verification : null);
      if (pending) {
        setPendingBlock(true);
        setPendingId(pending.id);
        setStatus(
          isReverify || isAdditional
            ? 'Сначала дождитесь решения по текущей заявке.'
            : 'Заявка уже отправлена — ожидайте ✅ в Discord.'
        );
        return pending;
      }
      setPendingBlock(false);
      setPendingId(null);
      if (res?.verification?.status === 'approved') {
        setStatus('Заявка одобрена. Можно закрыть окно или верифицировать ещё из настроек.');
      } else {
        setStatus('');
      }
      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    setStatus('');
    setPendingBlock(false);
    setPendingId(null);
    if (prefill) {
      setFaction(prefill.faction || 'ВАР');
      setCharacterNick(prefill.character_nick || prefill.profile_nickname || '');
      setRank(prefill.rank || '');
    } else {
      setFaction('ВАР');
      setCharacterNick('');
      setRank('');
    }
    (async () => {
      try {
        const auth = await api.getDiscordAuthStatus?.();
        if (auth?.discordUsername) setDiscordNick((n) => n || auth.discordUsername);
        await refreshPending();
      } catch {}
    })();
  }, [open, api, prefill, isReverify, isAdditional]);

  // Пока модалка открыта и есть pending — опрашиваем статус
  useEffect(() => {
    if (!open || !pendingBlock) return undefined;
    const t = setInterval(() => {
      refreshPending().catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [open, pendingBlock]);

  // Синхронизация с данными с главной (после refreshDiscord)
  useEffect(() => {
    if (!open) return;
    const list = verifications || [];
    const pending = list.find((v) => v.status === 'pending');
    if (pending) {
      setPendingBlock(true);
      setPendingId(pending.id);
    } else if (pendingBlock) {
      setPendingBlock(false);
      setPendingId(null);
      if (verification?.status === 'approved') {
        setStatus('Заявка одобрена.');
      }
    }
  }, [open, verification, verifications]);

  if (!open) return null;

  const title = isReverify
    ? 'Переверификация персонажа'
    : isAdditional
      ? 'Верификация дополнительного персонажа'
      : 'Верификация персонажа';

  const submit = async () => {
    if (pendingBlock) return;
    if (!discordNick.trim()) {
      setError('Укажите ник в Discord');
      return;
    }
    if (!faction) {
      setError('Укажите фракцию');
      return;
    }
    if (!characterNick.trim() || !/\[[^\]]+\]/.test(characterNick)) {
      setError('Ник персонажа с препиской, пример: [CG] 0327 IMA или [CR] 0327 IMA');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const auth = await api.getDiscordAuthStatus?.();
      const uid = auth?.discordUserId;
      if (!uid) {
        setError('Сначала войдите через Discord в лаунчере');
        setLoading(false);
        return;
      }
      const submitMode = isReverify ? 'reverify' : isAdditional ? 'additional' : 'new';
      const res = await api.submitCharacterVerification({
        discord_user_id: uid,
        discord_nick: discordNick.trim(),
        discord_username: discordNick.trim(),
        faction,
        character_nick: characterNick.trim(),
        rank: rank.trim(),
        mode: submitMode,
        replaces_id: isReverify ? prefill.id : undefined,
      });
      if (!res?.success) {
        setError(res?.error || 'Не удалось отправить заявку');
        return;
      }
      setPendingBlock(true);
      setPendingId(res.verification?.id || null);
      setStatus('Заявка отправлена в Discord. После ✅ модератора профиль обновится.');
      onSubmitted?.(res.verification);
    } catch (e) {
      setError(e?.message || 'Ошибка API');
    } finally {
      setLoading(false);
    }
  };

  const cancelPending = async () => {
    setLoading(true);
    setError('');
    try {
      const auth = await api.getDiscordAuthStatus?.();
      const res = await api.cancelCharacterVerification?.({
        discord_user_id: auth?.discordUserId,
        verification_id: pendingId,
      });
      if (!res?.success) {
        setError(res?.error || 'Не удалось отозвать заявку');
        return;
      }
      setPendingBlock(false);
      setPendingId(null);
      setStatus('Заявка отозвана. Можно подать новую.');
      onSubmitted?.(res.verification);
    } catch (e) {
      setError(e?.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="block-hint">
            {isReverify
              ? 'Отправьте обновлённые данные. Старый персонаж будет заменён после одобрения.'
              : isAdditional
                ? 'Можно верифицировать ещё одного персонажа. Активного выбирайте в настройках.'
                : 'Чтобы начать играть, подайте заявку. Модерация поставит ✅ вручную в Discord. Если фракция ВАР и в нике преписка подразделения (CG, 104, 83, 38) — дополнительно одобряет командир.'}
          </p>
          {isReverify && prefill && (
            <p className="block-hint">
              Замена: <strong>{prefill.character_nick || prefill.profile_nickname}</strong>
              {prefill.status ? ` · ${STATUS_LABEL[prefill.status] || prefill.status}` : ''}
            </p>
          )}
          <label className="field">
            <span>Ник в Discord</span>
            <input value={discordNick} onChange={(e) => setDiscordNick(e.target.value)} placeholder="Ваш Discord" />
          </label>
          <label className="field">
            <span>Фракция персонажа</span>
            <select value={faction} onChange={(e) => setFaction(e.target.value)}>
              {factions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ник персонажа с препиской (позывной)</span>
            <input
              value={characterNick}
              onChange={(e) => setCharacterNick(e.target.value)}
              placeholder="[CG] 0327 IMA или [CR] 0327 IMA"
            />
          </label>
          <label className="field">
            <span>Звание (необязательно, только для карточки — в ник не пишется)</span>
            <select value={rank} onChange={(e) => setRank(e.target.value)}>
              {RANK_OPTIONS.map((r) => (
                <option key={r || 'none'} value={r}>
                  {r || '— не указывать —'}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="form-error">{error}</p>}
          {status && <p className="form-success">{status}</p>}
          <button type="button" className="btn-save" disabled={loading || pendingBlock} onClick={submit}>
            {pendingBlock
              ? 'Ожидает модерации'
              : isReverify
                ? 'Отправить переверификацию'
                : isAdditional
                  ? 'Верифицировать ещё'
                  : 'Подать заявку'}
          </button>
          {pendingBlock && (
            <div className="settings-actions-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn-ghost-sm" disabled={loading} onClick={() => refreshPending()}>
                Обновить статус
              </button>
              <button type="button" className="btn-ghost-sm" disabled={loading} onClick={cancelPending}>
                Отозвать заявку
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
