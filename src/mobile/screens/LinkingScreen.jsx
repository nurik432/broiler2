// src/mobile/screens/LinkingScreen.jsx
import { useState } from 'react';
import { telegramLink } from '../telegram/auth';

export default function LinkingScreen({ onLinked }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { ok, message } = await telegramLink(email.trim(), password);
      if (ok) onLinked();
      else setErr(message || 'Не удалось войти');
    } catch (e) {
      setErr(e.message || 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 bg-tg-bg text-tg-text">
      <h1 className="text-xl font-bold mb-1">Привязка аккаунта</h1>
      <p className="text-sm text-tg-hint mb-6">
        Введите логин от веб-версии один раз — дальше вход будет автоматическим.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email" inputMode="email" autoComplete="email" required
          placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base bg-tg-secondary text-tg-text outline-none"
          style={{ minHeight: 48 }}
        />
        <input
          type="password" autoComplete="current-password" required
          placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base bg-tg-secondary text-tg-text outline-none"
          style={{ minHeight: 48 }}
        />
        {err && <p className="text-sm text-tg-destructive">{err}</p>}
        <button
          type="submit" disabled={busy}
          className="mt-2 rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
          style={{ minHeight: 48 }}
        >
          {busy ? 'Привязываем…' : 'Привязать аккаунт'}
        </button>
      </form>
    </div>
  );
}
