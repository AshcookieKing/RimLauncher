import { useEffect, useState } from 'react';

export default function NewsToast({ item, onClose, onOpenNews }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!item) return undefined;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 400);
    }, 12000);
    return () => clearTimeout(t);
  }, [item, onClose]);

  if (!item || !visible) return null;

  const label = item.type_label || (item.type === 'devlog' ? 'Патч обновления' : 'Новости');

  return (
    <div className="news-toast" onClick={onOpenNews} role="button" tabIndex={0}>
      <span className="news-toast-badge">{label}</span>
      <strong>{item.title}</strong>
      <p>{item.body?.slice(0, 120)}</p>
      <button type="button" className="news-toast-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        ✕
      </button>
    </div>
  );
}
