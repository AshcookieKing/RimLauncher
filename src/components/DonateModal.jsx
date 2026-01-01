import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEscapeClose } from '../hooks/useEscapeClose';

const BOOSTY_URL = 'https://boosty.to/imagundi/donate';

const FALLBACK_SHOP = [
  { id: 'paint_uniform', title: 'Покраска формы', amount: 1500, category: 'studio', description: 'Покраска формы по вашему ТЗ.' },
  {
    id: 'paint_uniform_full',
    title: 'Покраска формы под ключ',
    amount: 1500,
    category: 'studio',
    description: 'Покраска формы под ключ (ARC и др.).',
  },
  { id: 'model_custom', title: 'Создание модели с нуля', amount: 10000, category: 'studio', description: '3D-модель с нуля под заказ.' },
  { id: 'weapon_custom', title: 'Создание оружия под ключ', amount: 5000, category: 'studio', description: 'Оружие под ключ.' },
  {
    id: 'development_donate',
    title: 'Пожертвование на развитие',
    amount: 100,
    category: 'donate',
    custom_amount: true,
    min_amount: 10,
    description: 'Поддержка хостинга, разработки и рекламы проекта StarFront.',
  },
];

export default function DonateModal({ open, onClose, profile, shop: shopProp, api, onChatOpen }) {
  const shop = shopProp?.length ? shopProp : FALLBACK_SHOP;
  const studioItems = useMemo(() => shop.filter((i) => i.category === 'studio'), [shop]);
  const donateItems = useMemo(() => shop.filter((i) => i.category === 'donate'), [shop]);

  const [selected, setSelected] = useState(null);
  const [customAmount, setCustomAmount] = useState('100');
  const [step, setStep] = useState('form');
  const [order, setOrder] = useState(null);
  const [lastPaid, setLastPaid] = useState(null);
  const [paymentUrls, setPaymentUrls] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [discordUserId, setDiscordUserId] = useState('');

  useEscapeClose(open, onClose);

  const payAmount = useMemo(() => {
    if (!selected) return 0;
    if (selected.custom_amount) {
      const n = parseInt(String(customAmount).replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    }
    return Number(selected.amount) || 0;
  }, [selected, customAmount]);

  const loadMessages = useCallback(
    async (orderId) => {
      if (!orderId || !api.fetchDonationMessages) return;
      try {
        const data = await api.fetchDonationMessages(orderId);
        if (data.success) setMessages(data.messages || []);
      } catch {
        /* ignore */
      }
    },
    [api]
  );

  const startNewDonation = () => {
    setOrder(null);
    setPaymentUrls(null);
    setSelected(null);
    setStatus('');
    setError('');
    setStep('form');
  };

  const pollOrder = useCallback(async () => {
    const uid = discordUserId || (await api.getDiscordUserId());
    if (!uid) return;
    const data = await api.getActiveDonation(uid);
    if (data.last_paid) setLastPaid(data.last_paid);

    if (data.order?.status === 'pending') {
      setOrder(data.order);
      if (data.payment_urls) setPaymentUrls(data.payment_urls);
      if (step !== 'waiting') setStep('waiting');
      if (order?.id && data.order.id === order.id) {
        const check = await api.checkDonationPayment(data.order.id, { discord_user_id: uid });
        if (check.paid) {
          setOrder(check.order);
          setMessages(check.messages || []);
          setStep('chat');
          onChatOpen?.(check.order);
        } else if (check.message) {
          setStatus(check.message);
        }
      }
      return;
    }

    if (step === 'waiting' && order?.id) {
      const check = await api.checkDonationPayment(order.id, { discord_user_id: uid });
      if (check.paid) {
        setOrder(check.order);
        setMessages(check.messages || []);
        setStep('chat');
        onChatOpen?.(check.order);
      }
    }
  }, [discordUserId, api, onChatOpen, order?.id, step]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setStatus('');
    setSelected(null);
    (async () => {
      const uid = await api.getDiscordUserId();
      setDiscordUserId(uid || '');
      if (!uid) {
        setStep('form');
        return;
      }
      const data = await api.getActiveDonation(uid);
      setLastPaid(data.last_paid || null);
      if (data.order?.status === 'pending') {
        setOrder(data.order);
        setPaymentUrls(data.payment_urls || null);
        setStep('waiting');
        return;
      }
      setOrder(null);
      setPaymentUrls(null);
      setStep('form');
      setMessages(data.last_paid ? data.messages || [] : []);
    })();
  }, [open, api]);

  useEffect(() => {
    if (!open || step !== 'waiting') return;
    const t = setInterval(pollOrder, 3000);
    return () => clearInterval(t);
  }, [open, step, pollOrder]);

  useEffect(() => {
    if (!open || step !== 'chat' || !order?.id) return;
    loadMessages(order.id);
    const t = setInterval(() => loadMessages(order.id), 5000);
    return () => clearInterval(t);
  }, [open, step, order?.id, loadMessages]);

  const cancelOrder = async () => {
    if (!order?.id) return;
    const uid = discordUserId || (await api.getDiscordUserId());
    if (!uid) return;
    setLoading(true);
    const res = await api.cancelDonation(order.id, { discord_user_id: uid });
    setLoading(false);
    if (res.success) startNewDonation();
    else setError(res.error || 'Не удалось отменить');
  };

  const checkPayment = async () => {
    if (!order?.id) return;
    const uid = discordUserId || (await api.getDiscordUserId());
    if (!uid) return;
    setLoading(true);
    setError('');
    const res = await api.checkDonationPayment(order.id, { discord_user_id: uid });
    setLoading(false);
    if (res.paid) {
      setOrder(res.order);
      setMessages(res.messages || []);
      setStep('chat');
      onChatOpen?.(res.order);
    } else {
      setStatus(res.message || 'Оплата пока не найдена');
      if (res.payment_urls) setPaymentUrls(res.payment_urls);
    }
  };

  const openLastPaidChat = async () => {
    if (!lastPaid?.id) return;
    setOrder(lastPaid);
    setStep('chat');
    setError('');
    await loadMessages(lastPaid.id);
  };

  const payWithYooMoney = async () => {
    setLoading(true);
    setError('');
    try {
      const uid = discordUserId || (await api.getDiscordUserId());
      if (!uid) {
        setError('Привяжите Discord в настройках лаунчера.');
        return;
      }
      if (!selected) {
        setError('Выберите услугу или пожертвование');
        return;
      }
      const minAmount = selected.min_amount || 10;
      if (payAmount < minAmount) {
        setError(`Минимальная сумма — ${minAmount} ₽`);
        return;
      }

      const res = await api.createDonation({
        discord_user_id: uid,
        amount_rub: payAmount,
        tier_id: selected.id,
        item_title: selected.title,
        payment_method: 'yoomoney',
        player_name: profile?.display_name,
        player_profile: profile,
      });
      if (!res.success) {
        setError(res.error || 'Ошибка создания заказа');
        if (res.order?.status === 'pending') {
          setOrder(res.order);
          setStep('waiting');
        }
        return;
      }
      setOrder(res.order);
      setPaymentUrls(res.payment_urls || null);
      const exact = res.exact_amount || res.payment_urls?.exact_amount;
      setStatus(
        exact
          ? `Заказ создан. Переведите ровно ${exact} ₽ через ЮMoney — комментарий не нужен.`
          : `Заказ «${selected.title}» создан. Оплатите ${payAmount} ₽ через ЮMoney.`
      );
      const url = res.payment_urls?.yoomoney || res.payment_urls?.yoomoney_quickpay;
      if (url) await api.openUrl(url);
      setStep('waiting');
    } catch (e) {
      setError(e.message || 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || !order?.id) return;
    const uid = discordUserId || (await api.getDiscordUserId());
    if (!uid) {
      setError('Discord не привязан');
      return;
    }
    setLoading(true);
    setError('');
    const res = await api.donationSend(order.id, { discord_user_id: uid, content: text.trim() });
    setLoading(false);
    if (res.success) {
      setText('');
      setMessages(res.messages || []);
    } else {
      setError(res.error || 'Не удалось отправить сообщение');
    }
  };

  if (!open) return null;

  const renderItem = (item) => (
    <button
      key={item.id}
      type="button"
      className={`donate-tier ${selected?.id === item.id ? 'active' : ''}`}
      onClick={() => {
        setSelected(item);
        if (item.custom_amount) setCustomAmount(String(item.amount || 100));
      }}
    >
      <strong>{item.title}</strong>
      <span>{item.custom_amount ? 'Своя сумма · от 10 ₽' : `${item.amount} ₽`}</span>
      <small>{item.description}</small>
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel donate-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>STAR POINT · Услуги</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        {step === 'form' && (
          <div className="modal-body">
            <p className="block-hint">Оплата услуг — только через ЮMoney API. После оплаты откроется чат с администрацией.</p>
            {lastPaid && (
              <div className="donate-paid-banner">
                <p className="block-hint">
                  Последний заказ #{lastPaid.id} оплачен · {lastPaid.item_title || lastPaid.tier_id}
                </p>
                <button type="button" className="btn-ghost-sm" onClick={openLastPaidChat}>
                  Открыть чат заказа
                </button>
              </div>
            )}

            {studioItems.length > 0 && (
              <>
                <h4 className="shop-section-title">Услуги Студии</h4>
                <div className="donate-tiers">{studioItems.map(renderItem)}</div>
              </>
            )}

            {donateItems.length > 0 && (
              <>
                <h4 className="shop-section-title">Пожертвование</h4>
                <div className="donate-tiers">{donateItems.map(renderItem)}</div>
              </>
            )}

            {selected?.custom_amount && (
              <label className="field">
                <span>Сумма пожертвования (₽)</span>
                <input
                  type="number"
                  min={selected.min_amount || 10}
                  step="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                />
              </label>
            )}

            <p className="block-hint">
              К оплате: <strong>{selected ? `${payAmount} ₽` : '—'}</strong> · ЮMoney
            </p>

            <button type="button" className="btn-ghost-sm" onClick={() => api.openUrl(BOOSTY_URL)}>
              Или пожертвовать на Boosty
            </button>

            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn-save" disabled={loading || !selected || payAmount < 1} onClick={payWithYooMoney}>
              {loading ? 'Создание заказа…' : 'Оплатить через ЮMoney'}
            </button>
          </div>
        )}

        {step === 'waiting' && (
          <div className="modal-body">
            <p className="form-success">{status || 'Ожидание оплаты…'}</p>
            <p className="block-hint">
              Заказ #{order?.id} · {order?.item_title || order?.tier_id}
              {(order?.pay_amount_kopecks || paymentUrls?.exact_amount) && (
                <>
                  {' '}
                  · сумма:{' '}
                  <strong>
                    {order?.pay_amount_kopecks
                      ? `${(order.pay_amount_kopecks / 100).toFixed(2)} ₽`
                      : `${paymentUrls.exact_amount} ₽`}
                  </strong>
                </>
              )}
            </p>
            <p className="block-hint bot-hint">
              Переведите ровно указанную сумму до копеек — комментарий не нужен. Проверка через YooMoney API (~15–20 сек).
            </p>
            <div className="donate-wait-actions">
              <button type="button" className="btn-save" disabled={loading} onClick={checkPayment}>
                {loading ? 'Проверка…' : 'Проверить оплату'}
              </button>
              <button
                type="button"
                className="btn-ghost-sm"
                onClick={() => {
                  const urls = paymentUrls || {};
                  const url = urls.yoomoney || urls.yoomoney_quickpay;
                  if (url) api.openUrl(url);
                }}
              >
                Открыть ЮMoney
              </button>
              <button type="button" className="btn-ghost-sm" disabled={loading} onClick={cancelOrder}>
                Отменить заказ
              </button>
              <button type="button" className="btn-ghost-sm" onClick={startNewDonation}>
                К услугам
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        )}

        {step === 'chat' && order && (
          <div className="modal-body ticket-chat">
            <p className="form-success">
              Оплата получена · заказ #{order.id} · {order.item_title || order.tier_id}
            </p>
            <p className="block-hint bot-hint">Напишите администратору детали заказа — ответ придёт сюда и в Discord.</p>
            <div className="chat-messages">
              {messages.length === 0 && <p className="block-hint">Напишите администратору.</p>}
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
                placeholder="Сообщение по заказу…"
                disabled={loading}
                onKeyDown={(e) => e.key === 'Enter' && !loading && sendMessage()}
              />
              <button type="button" className="btn-save chat-send-btn" disabled={loading || !text.trim()} onClick={sendMessage}>
                {loading ? '…' : '→'}
              </button>
            </div>
            <div className="donate-wait-actions">
              <button type="button" className="btn-ghost-sm" disabled={loading} onClick={() => loadMessages(order.id)}>
                Обновить чат
              </button>
              <button type="button" className="btn-save" onClick={startNewDonation}>
                Новый заказ
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
