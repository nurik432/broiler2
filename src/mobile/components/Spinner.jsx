// src/mobile/components/Spinner.jsx
export default function Spinner({ size = 28 }) {
  return (
    <span
      aria-label="Загрузка"
      style={{
        width: size, height: size, display: 'inline-block',
        border: '3px solid var(--tg-hint, #999)', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'tg-spin 0.8s linear infinite',
      }}
    />
  );
}

if (typeof document !== 'undefined' && !document.getElementById('tg-spin-kf')) {
  const s = document.createElement('style');
  s.id = 'tg-spin-kf';
  s.textContent = '@keyframes tg-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}
