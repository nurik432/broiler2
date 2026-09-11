import BottomSheet from './BottomSheet';

export default function ConfirmSheet({
  open, title, message, confirmLabel = 'Удалить', danger = true, onConfirm, onClose,
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {message && <p className="text-sm text-tg-hint mb-4">{message}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => { onConfirm(); onClose(); }}
          className="w-full rounded-xl px-4 py-3 text-base font-semibold text-white"
          style={{ minHeight: 48, background: danger ? 'var(--tg-destructive, #df3f40)' : 'var(--tg-button)' }}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl px-4 py-3 text-base bg-tg-secondary text-tg-text"
          style={{ minHeight: 48 }}
        >
          Отмена
        </button>
      </div>
    </BottomSheet>
  );
}
