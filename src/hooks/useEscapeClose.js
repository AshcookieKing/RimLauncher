import { useEffect } from 'react';

export function useEscapeClose(enabled, onClose) {
  useEffect(() => {
    if (!enabled || !onClose) return undefined;
    const handler = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onClose]);
}
