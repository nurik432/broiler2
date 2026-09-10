// src/mobile/components/EmptyState.jsx
export default function EmptyState({ icon = '📭', title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-base font-medium text-tg-text">{title}</p>
      {hint && <p className="text-sm text-tg-hint mt-1">{hint}</p>}
    </div>
  );
}
