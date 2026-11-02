// src/utils/gasArchive.js

/**
 * Рассчитывает баланс газа для архивации:
 * сумма видимых пополнений минус сумма видимых расходов.
 * @param {Array<{amount: number|string, is_hidden?: boolean}>} topups
 * @param {Array<{amount: number|string, is_hidden?: boolean}>} readings
 * @returns {{ totalTopups: number, totalConsumed: number, remainingBalance: number, hasPositiveRemainder: boolean }}
 */
export function calculateGasArchiveBalance(topups = [], readings = []) {
  const visibleTopups = (topups || []).filter(t => !t.is_hidden);
  const visibleReadings = (readings || []).filter(r => !r.is_hidden);

  const totalTopups = visibleTopups.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalConsumed = visibleReadings.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const rawBalance = totalTopups - totalConsumed;
  const remainingBalance = Math.round(rawBalance * 100) / 100;

  return {
    totalTopups: Math.round(totalTopups * 100) / 100,
    totalConsumed: Math.round(totalConsumed * 100) / 100,
    remainingBalance,
    hasPositiveRemainder: remainingBalance > 0
  };
}

/**
 * Детектирует ситуацию, когда партия уже была архивирована, показания скрылись,
 * а пополнения не скрылись и остаток не был перенесён.
 * @param {Array<{amount: number|string, is_hidden?: boolean, description?: string}>} topups
 * @param {Array<{amount: number|string, is_hidden?: boolean}>} readings
 * @returns {{ visibleTopups: Array, totalTopups: number, hiddenConsumed: number, balance: number } | null}
 */
export function detectUnarchivedGasState(topups = [], readings = []) {
  const allReadings = readings || [];
  const allTopups = topups || [];

  const hiddenReadings = allReadings.filter(r => r.is_hidden);
  if (hiddenReadings.length === 0) return null;

  const visibleTopups = allTopups.filter(t => !t.is_hidden);
  if (visibleTopups.length === 0) return null;

  // Если уже есть запись о переносе остатка — ничего исправлять не нужно
  const hasCarryover = allTopups.some(t => t.description === 'Остаток с предыдущей партии');
  if (hasCarryover) return null;

  // Если ни одно пополнение не скрыто, а показания уже скрыты — пополнения забыли скрыть при архивации
  const anyHiddenTopup = allTopups.some(t => t.is_hidden);
  if (anyHiddenTopup) return null;

  const hiddenConsumed = Math.round(hiddenReadings.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) * 100) / 100;
  const totalTopups = Math.round(visibleTopups.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) * 100) / 100;
  const balance = Math.round((totalTopups - hiddenConsumed) * 100) / 100;

  return {
    visibleTopups,
    totalTopups,
    hiddenConsumed,
    balance
  };
}

/**
 * Архивация газовых записей:
 * 1. Получает текущие видимые пополнения и расходы.
 * 2. Скрывает все видимые показания счётчика (обнуление расхода для новой партии).
 * 3. Скрывает все видимые пополнения.
 * 4. Если на балансе осталась положительная сумма (пополнения > расходов),
 *    создаёт новую запись-пополнение с остатком для следующей партии.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} [dateString] Дата транзакции (ГГГГ-ММ-ДД), по умолчанию сегодня
 * @returns {Promise<{ totalTopups: number, totalConsumed: number, remainingBalance: number, hasPositiveRemainder: boolean, error?: any }>}
 */
export async function archiveGasRecords(supabase, dateString = new Date().toISOString().slice(0, 10)) {
  const [topupsRes, readingsRes] = await Promise.all([
    supabase.from('gas_topups').select('id, amount').eq('is_hidden', false),
    supabase.from('gas_meter_readings').select('id, amount').eq('is_hidden', false),
  ]);

  if (topupsRes.error) {
    console.error('Ошибка при получении пополнений газа:', topupsRes.error);
    return { error: topupsRes.error };
  }
  if (readingsRes.error) {
    console.error('Ошибка при получении показаний газа:', readingsRes.error);
    return { error: readingsRes.error };
  }

  const { totalTopups, totalConsumed, remainingBalance, hasPositiveRemainder } =
    calculateGasArchiveBalance(topupsRes.data || [], readingsRes.data || []);

  // 1. Скрываем все видимые показания счётчика
  const { error: hideReadingsErr } = await supabase
    .from('gas_meter_readings')
    .update({ is_hidden: true })
    .eq('is_hidden', false);

  if (hideReadingsErr) {
    console.error('Ошибка при скрытии показаний газа:', hideReadingsErr);
    return { error: hideReadingsErr };
  }

  // 2. Скрываем все видимые пополнения
  const { error: hideTopupsErr } = await supabase
    .from('gas_topups')
    .update({ is_hidden: true })
    .eq('is_hidden', false);

  if (hideTopupsErr) {
    console.error('Ошибка при скрытии пополнений газа:', hideTopupsErr);
    return { error: hideTopupsErr };
  }

  // 3. Если остаток положительный — создаём запись с остатком для новой партии
  if (hasPositiveRemainder) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertErr } = await supabase
      .from('gas_topups')
      .insert([{
        transaction_date: dateString,
        amount: remainingBalance,
        description: 'Остаток с предыдущей партии',
        is_hidden: false,
        user_id: user?.id,
      }]);

    if (insertErr) {
      console.error('Ошибка при переносе остатка газа:', insertErr);
      return { error: insertErr, totalTopups, totalConsumed, remainingBalance, hasPositiveRemainder };
    }
  }

  return {
    totalTopups,
    totalConsumed,
    remainingBalance,
    hasPositiveRemainder,
    error: null,
  };
}

