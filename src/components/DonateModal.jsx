import { useCallback, useEffect, useState } from 'react';

const FALLBACK_SHOP = [
  { id: 'test_payment', title: 'Тест оплаты', amount: 2, rim_points: 2, category: 'test', description: 'Проверка оплаты — только ЮMoney (на Boosty мин. 10 ₽).', yoomoney_only: true },
  { id: 'mercenary', title: 'Наёмник', amount: 2000, rim_points: 2000, category: 'role', description: 'Вольный наемник — квента, контракты, снаряжение.' },
  { id: 'arc', title: 'ARC', amount: 1200, rim_points: 1200, category: 'role', description: 'Элита армии — джетпак, спецвооружение.' },
  { id: 'rc_squad', title: 'RC Отряд', amount: 4000, rim_points: 4000, category: 'role', description: 'RC отряд республики.' },
  { id: 'jedi', title: 'Джедай', amount: 2000, rim_points: 2000, category: 'role', description: 'Квента + экзамен, световой меч.' },
  { id: 'paint_uniform', title: 'Покраска формы', amount: 1500, rim_points: 1500, category: 'extra', description: 'Доп. услуга.' },
  { id: 'paint_uniform_full', title: 'Покраска формы под ключ', amount: 1500, rim_points: 1500, category: 'extra', description: 'Покраска под ключ.' },
  { id: 'model_custom', title: 'Создание модели с нуля', amount: 10000, rim_points: 10000, category: 'extra', description: '3D-модель с нуля.' },
  { id: 'weapon_custom', title: 'Создание оружия под ключ', amount: 5000, rim_points: 5000, category: 'extra', description: 'Оружие под ключ.' },
];

const BOOSTY_MIN_RUB = 10;

export default function DonateModal({ open, onClose, profile, shop: shopProp, boostyMinRub, api, onChatOpen }) {
  const boostyMin = Number(boostyMinRub) >= 1 ? Number(boostyMinRub) : BOOSTY_MIN_RUB;
  const shop = shopProp?.length ? shopProp : FALLBACK_SHOP;
  const testItems = shop.filter((i) => i.category === 'test');
  const roles = shop.filter((i) => i.category === 'role');
  const extras = shop.filter((i) => i.category === 'extra');
  const [selected, setSelected] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('yoomoney');
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
      if (data.last_paid) {
        setMessages(data.messages || []);
      } else {
        setMessages([]);
      }
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
    if (res.success) {
      startNewDonation();
    } else setError(res.error || 'Не удалось отменить');
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

  const support = async () => {
    setLoading(true);
    setError('');
    try {
      const uid = discordUserId || (await api.getDiscordUserId());
      if (!uid) {
        setError('Не удалось привязать Discord. Ник Arma должен совпадать с Discord на сервере StarFront.');
        return;
      }
      if (!selected) {
        setError('Выберите услугу из листа пожертвований');
        return;
      }
      if (paymentMethod === 'boosty' && (selected.yoomoney_only || selected.amount < boostyMin)) {
        setError(`На Boosty минимальная сумма — ${boostyMin} ₽. Для теста 2 ₽ используйте ЮMoney.`);
        return;
      }
      const res = await api.createDonation({
        discord_user_id: uid,
        amount_rub: selected.amount,
        tier_id: selected.id,
        item_title: selected.title,
        payment_method: paymentMethod,
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
          ? `Заказ создан. Переведите ровно ${exact} ₽ — комментарий не нужен.`
          : `Заказ «${selected.title}» создан. Оплатите ${selected.amount} ₽.`
      );
      const urls = res.payment_urls || {};
      const url = paymentMethod === 'yoomoney' ? urls.yoomoney || urls.yoomoney_quickpay : urls.boosty;
      if (url) await api.openUrl(url);
      setStep('waiting');
    } catch (e) {
      setError(e.message || 'Ошибка сети — проверьте, что бот запущен');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || !order?.id) return;
    const uid = discordUserId || (await api.getDiscordUserId());
    if (!uid) {
      setError('Discord не привязан — войдите на сервер StarFront с тем же ником');
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

  const boostyBlocked = (item) =>
    paymentMethod === 'boosty' && (item.yoomoney_only || Number(item.amount) < boostyMin);

  const renderItem = (item) => {
    const blocked = boostyBlocked(item);
    return (
    <button
      key={item.id}
      type="button"
      className={`donate-tier ${selected?.id === item.id ? 'active' : ''} ${blocked ? 'donate-tier--disabled' : ''}`}
      disabled={blocked}
      onClick={() => !blocked && setSelected(item)}
    >
      <strong>{item.title}</strong>
      <span>
        {item.amount} ₽ · {item.rim_points || item.amount} RIM POINT
      </span>
      <small>{item.description}</small>
      {blocked && <small className="donate-tier-note">На Boosty от {boostyMin} ₽ — выберите ЮMoney</small>}
    </button>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel donate-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Лист пожертвований</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        {step === 'form' && (
          <div className="modal-body">
            <p className="block-hint">1 ₽ = 1 RIM POINT · выберите услугу из листа пожертвований</p>
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
            {testItems.length > 0 && (
              <>
                <h4 className="shop-section-title">Тест</h4>
                <div className="donate-tiers">{testItems.map(renderItem)}</div>
              </>
            )}
            {roles.length > 0 && (
              <>
                <h4 className="shop-section-title">Роли</h4>
                <div className="donate-tiers">{roles.map(renderItem)}</div>
              </>
            )}
            {extras.length > 0 && (
              <>
                <h4 className="shop-section-title">Доп. услуги</h4>
                <div className="donate-tiers">{extras.map(renderItem)}</div>
              </>
            )}
            <p className="block-hint">
              Сумма: <strong>{selected ? `${selected.amount} ₽` : '—'}</strong>
            </p>
            <div className="pay-methods">
              <label className={`pay-method ${paymentMethod === 'yoomoney' ? 'active' : ''}`}>
                <input type="radio" checked={paymentMethod === 'yoomoney'} onChange={() => setPaymentMethod('yoomoney')} />
                ЮMoney
              </label>
              <label className={`pay-method ${paymentMethod === 'boosty' ? 'active' : ''}`}>
                <input
                  type="radio"
                  checked={paymentMethod === 'boosty'}
                  onChange={() => {
                    setPaymentMethod('boosty');
                    if (selected && (selected.yoomoney_only || selected.amount < boostyMin)) {
                      setSelected(null);
                    }
                  }}
                />
                Boosty <span className="pay-method-hint">от {boostyMin} ₽</span>
              </label>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn-save" disabled={loading || !selected} onClick={support}>
              {loading ? 'Отправка…' : 'Поддержать'}
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
              {paymentMethod === 'boosty' ? (
                <>
                  На Boosty укажите сумму <strong>до копеек</strong> и в сообщении к донату —{' '}
                  <strong>rim_order_{order?.id}</strong>. Бот проверяет донаты на Boosty автоматически (~30 сек).
                </>
              ) : (
                <>
                  Переведите ровно указанную сумму до копеек — комментарий не нужен. Другая сумма не засчитается.
                  Система сверяет переводы через YooMoney API (шлюз на сервере, ~15–20 сек).
                </>
              )}
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
                  const url =
                    paymentMethod === 'yoomoney'
                      ? urls.yoomoney || urls.yoomoney_quickpay || `https://yoomoney.ru/to/4100117678086877/${order?.amount_rub}?label=rim_order_${order?.id}`
                      : urls.boosty || `https://boosty.to/imagundi/donate?sum=${order?.amount_rub}&comment=rim_order_${order?.id}`;
                  api.openUrl(url);
                }}
              >
                Открыть оплату
              </button>
              <button type="button" className="btn-ghost-sm" disabled={loading} onClick={cancelOrder}>
                Отменить заказ
              </button>
              <button type="button" className="btn-ghost-sm" onClick={startNewDonation}>
                К списку услуг
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
            <p className="block-hint bot-hint">
              Напишите администратору (ник, позывной, что купили). Роли Discord выдаются вручную — номер батальона
              (282 и т.д.) в чате не активирует роль автоматически.
            </p>
            <div className="chat-messages">
              {messages.length === 0 && (
                <p className="block-hint">Напишите администратору — ответ придёт сюда и в Discord.</p>
              )}
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
                Новое пожертвование
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
