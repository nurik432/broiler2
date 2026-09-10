// src/mobile/screens/AuthErrorScreen.jsx
export default function AuthErrorScreen({ message, onRetry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-tg-bg text-tg-text">
      <div className="text-4xl">⚠️</div>
      <p className="text-base font-medium">Не удалось авторизоваться через Telegram</p>
      {message && <p className="text-xs text-tg-hint break-words">{message}</p>}
      <button
        onClick={onRetry}
        className="mt-2 px-5 py-3 rounded-xl bg-tg-button text-tg-button-text text-sm font-semibold"
      >
        Повторить
      </button>
      <p className="text-xs text-tg-hint">Если не помогает — закройте и откройте приложение заново.</p>
    </div>
  );
}
