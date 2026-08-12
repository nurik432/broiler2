// src/pages/admin/AdminCreateClientPage.jsx

import { useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function AdminCreateClientPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok: bool, message: string }

  async function handleSubmit(e) {
    e.preventDefault();
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
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2937', marginBottom: 20 }}>
        + Создать клиента
      </h2>

      <form onSubmit={handleSubmit} style={{
        background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: 24,
      }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email клиента *</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="client@example.com"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Пароль *</label>
          <input
            type="text" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="минимум 6 символов"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <button
          type="submit" disabled={submitting}
          style={{
            padding: '10px 20px', background: '#4f46e5', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Создание...' : 'Создать аккаунт'}
        </button>

        {result && (
          <p style={{
            marginTop: 16, padding: 10, borderRadius: 6, fontSize: 14,
            background: result.ok ? '#28a74515' : '#dc354515',
            color: result.ok ? '#28a745' : '#dc3545',
          }}>
            {result.message}
          </p>
        )}
      </form>

      <p style={{ fontSize: 12, color: '#999', marginTop: 12 }}>
        Аккаунт создаётся сразу активным (email подтверждён), клиент может входить сразу с этими данными.
        Передайте их клиенту вручную.
      </p>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: '500' };
const inputStyle = { padding: '8px 10px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
