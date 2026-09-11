// src/mobile/pages/MobileNotesPage.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import Card from '../components/Card';
import ConfirmSheet from '../components/ConfirmSheet';
import FormField from '../components/FormField';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const fieldClass = 'w-full rounded-xl px-3 bg-tg-secondary text-tg-text';

export default function MobileNotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // { id, audioUrl }

  async function fetchNotes() {
    setLoading(true);
    const { data, error } = await supabase.from('notes').select('*').order('created_at', { ascending: false });
    if (error) window.alert('Ошибка: ' + error.message);
    else setNotes(data || []);
    setLoading(false);
  }

  useEffect(() => { fetchNotes(); }, []);

  async function submitNote() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
      const { error } = await supabase.from('notes').insert([{ content, user_id: user.id, type: 'text' }]);
      if (error) window.alert('Ошибка: ' + error.message);
      else { setContent(''); await fetchNotes(); }
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!confirmTarget) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.alert('Не удалось определить пользователя. Попробуйте войти заново.'); return; }
    if (confirmTarget.audioUrl && confirmTarget.audioUrl.startsWith('http')) {
      const filePath = confirmTarget.audioUrl.split('/voice-notes/')[1];
      if (filePath) await supabase.storage.from('voice-notes').remove([filePath]);
    }
    const { error } = await supabase.from('notes').delete().eq('id', confirmTarget.id);
    if (error) window.alert('Ошибка: ' + error.message);
    setConfirmTarget(null);
    await fetchNotes();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3 py-3">
      <Card>
        <div className="flex flex-col gap-3">
          <FormField label="Новая заметка">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Введите текст заметки..."
              className={fieldClass}
              style={{ minHeight: 88, paddingTop: 8, paddingBottom: 8 }}
              rows={4}
            />
          </FormField>
          <button
            type="button" onClick={submitNote} disabled={submitting || !content.trim()}
            className="rounded-xl px-4 py-3 text-base font-semibold bg-tg-button text-tg-button-text disabled:opacity-60"
            style={{ minHeight: 48 }}
          >
            {submitting ? 'Сохранение…' : '💾 Сохранить'}
          </button>
          <p className="text-xs text-tg-hint">Голосовые заметки пока можно записать только в веб-версии — здесь их можно прослушать.</p>
        </div>
      </Card>

      {notes.length === 0 ? (
        <EmptyState icon="📝" title="Заметок пока нет" hint="Создайте первую заметку выше" />
      ) : (
        notes.map((note) => (
          <Card key={note.id}>
            <p className="text-sm text-tg-text whitespace-pre-wrap">{note.type === 'voice' ? '🎤 ' : ''}{note.content}</p>
            {note.audio_url && (
              <audio src={note.audio_url} controls className="w-full mt-2" style={{ height: 36 }} />
            )}
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-tg-hint">{new Date(note.created_at).toLocaleString('ru-RU')}</p>
              <button type="button" onClick={() => setConfirmTarget({ id: note.id, audioUrl: note.audio_url })} className="rounded-lg px-3 py-2 text-xs text-tg-destructive bg-tg-secondary" style={{ minHeight: 36 }}>🗑 Удалить</button>
            </div>
          </Card>
        ))
      )}

      <ConfirmSheet open={!!confirmTarget} title="Удалить заметку?" onConfirm={confirmDelete} onClose={() => setConfirmTarget(null)} />
    </div>
  );
}
