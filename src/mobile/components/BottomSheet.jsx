// src/mobile/components/BottomSheet.jsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-tg-bg text-tg-text p-4"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--tg-hint)' }} />
        {title && <h2 className="text-base font-semibold mb-3">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
