// src/mobile/components/Card.jsx
export default function Card({ children, className = '', onClick, style }) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={`rounded-2xl bg-tg-section p-4 ${onClick ? 'active:opacity-70' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
