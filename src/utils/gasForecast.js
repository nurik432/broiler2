// src/utils/gasForecast.js
// Прогноз остатка предоплаченного баланса газа по последним показаниям счётчика.

/**
 * Оценивает, на сколько дней хватит текущего баланса, по среднему расходу
 * (в деньгах) за последние показания счётчика.
 * @param {Array<{reading_date: string, reading_value: number, amount: number|null}>} readings
 * @param {number} currentBalance
 * @returns {{ dailyM3: number, dailyAmount: number, daysRemaining: number, projectedEmptyDate: Date } | null}
 */
export function forecastGasBalance(readings, currentBalance) {
  const withReading = (readings || [])
    .filter(r => r.reading_value != null)
    .sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));
  if (withReading.length < 2) return null;

  const recent = withReading.slice(-5);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const daysSpan = (new Date(last.reading_date) - new Date(first.reading_date)) / 86400000;
  if (daysSpan <= 0) return null;

  const consumedM3 = last.reading_value - first.reading_value;
  const spentAmount = recent.slice(1).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const dailyM3 = consumedM3 / daysSpan;
  const dailyAmount = spentAmount / daysSpan;
  if (dailyAmount <= 0) {
    return { dailyM3: 0, dailyAmount: 0, daysRemaining: null, projectedEmptyDate: null };
  }

  const daysRemaining = Math.max(0, Math.floor(currentBalance / dailyAmount));
  const projectedEmptyDate = new Date(Date.now() + daysRemaining * 86400000);

  return {
    dailyM3: Math.round(dailyM3 * 100) / 100,
    dailyAmount: Math.round(dailyAmount * 100) / 100,
    daysRemaining,
    projectedEmptyDate
  };
}
