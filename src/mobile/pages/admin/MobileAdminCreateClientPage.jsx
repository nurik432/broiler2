// src/mobile/pages/admin/MobileAdminCreateClientPage.jsx
import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import Card from '../../components/Card';
import FormField from '../../components/FormField';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

export default function MobileAdminCreateClientPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  async function handleSubmit() {
    if (!email.trim() || password.length < 6) {
      window.alert('Укажите email и пароль (минимум 6 символов).');
      return;
    }
    setSubmitting(true);
    setResult(null);
    const { data, error } = await supabase.rpc('admin_create_client', {
      client_email: email.trim(),
      client_password: password,
    });
    if (error) {
      setResult({ ok: false, message: error.message });
    } else {
      setResult({ ok: true, message: `Клиент создан: ${email.trim()} (id: ${data})` });
      setEmail('');
      setPassword('');
    }
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      <Card>
        <div className="flex flex-col gap-3">
          <FormField label="Email клиента *">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <FormField label="Пароль *">
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="минимум 6 символов" className={fieldClass} style={{ minHeight: 48 }} />
          </FormField>
          <button
            type="button" onClick={handleSubmit} disabled={submitting}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {submitting ? 'Создание…' : 'Создать аккаунт'}
          </button>
          {result && (
            <p className="text-sm rounded-lg px-3 py-2" style={{ background: `color-mix(in srgb, ${result.ok ? '#28a745' : '#dc3545'} 15%, transparent)`, color: result.ok ? '#28a745' : '#dc3545' }}>
              {result.message}
            </p>
          )}
        </div>
      </Card>
      <p className="text-xs text-tg-hint px-1">
        Аккаунт создаётся сразу активным (email подтверждён), клиент может входить сразу с этими данными. Передайте их клиенту вручную.
      </p>
    </div>
  );
}
