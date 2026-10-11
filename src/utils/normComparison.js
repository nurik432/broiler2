import {
  getNormForDay,
  getWeekMortalityNorm,
  DEVIATION_THRESHOLDS,
  ROSS308_STANDARDS,
} from '../constants/broilerStandards';

/**
 * Сравнить фактическое значение с нормой ROSS-308
 * @param {number} day   - день выращивания (age из Supabase)
 * @param {'weight'|'dailyFeed'|'waterNorm'|'temp'|'humidity'} field
 * @param {number|string} value - фактическое значение (уже в единицах нормы: г, г, мл)
 * @returns {{ normLabel, deviation, percent, status: 'ok'|'warning'|'critical' } | null}
 */
export function compareWithNorm(day, field, value) {
  if (value === '' || value === null || value === undefined) return null;
  const norm = getNormForDay(day);
  if (!norm) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;

  // Диапазонные поля (температура, влажность)
  if (field === 'temp') {
    const ok   = num >= norm.tempMin && num <= norm.tempMax;
    const warn = num >= norm.tempMin - 2 && num <= norm.tempMax + 2;
    return {
      normLabel: `${norm.tempMin}–${norm.tempMax}°C`,
      deviation: null,
      percent: null,
      status: ok ? 'ok' : warn ? 'warning' : 'critical',
    };
  }
  if (field === 'humidity') {
    const ok   = num >= norm.humidMin && num <= norm.humidMax;
    const warn = num >= norm.humidMin - 5 && num <= norm.humidMax + 5;
    return {
      normLabel: `${norm.humidMin}–${norm.humidMax}%`,
      deviation: null,
      percent: null,
      status: ok ? 'ok' : warn ? 'warning' : 'critical',
    };
  }

  // Числовые поля (weight, dailyFeed, waterNorm)
  const normValue = norm[field];
  if (!normValue) return null;
  const deviation = Math.round(num - normValue);
  const percent   = Math.round(Math.abs(deviation / normValue) * 100);
  const status    = percent <= DEVIATION_THRESHOLDS.ok      ? 'ok'
                  : percent <= DEVIATION_THRESHOLDS.warning ? 'warning'
                  : 'critical';

  // Единицы для отображения
  const units = { weight: 'г', dailyFeed: 'г', waterNorm: 'мл' };
  const unit = units[field] || '';
  return { normLabel: `${normValue} ${unit}`, deviation, percent, status };
}

/**
 * Разложить суммарный падёж на естественный и халяль.
 * Естественный = всего − халяль, чтобы старые записи без разбивки
 * (только mortality) попадали в естественный и доли сходились с итогом.
 */
function splitMortality(logs) {
  const totalDead  = logs.reduce((sum, r) => sum + (r.mortality || 0), 0);
  const totalHalal = logs.reduce((sum, r) => sum + (r.mortality_halal || 0), 0);
  return { totalDead, totalHalal, totalNatural: Math.max(totalDead - totalHalal, 0) };
}

/**
 * Рассчитать накопительный падёж и сверить с нормой ROSS-308
 * @param {Array<{age: number, mortality: number, mortality_halal?: number}>} logs - все записи журнала партии
 * @param {number} initialBirds - начальное поголовье
 * @returns {{ totalDead, totalNatural, totalHalal, factPercent, naturalPercent, halalPercent, normPercent, status, currentWeek } | null}
 */
export function calcMortality(logs, initialBirds) {
  if (!logs?.length || !initialBirds) return null;
  const { totalDead, totalNatural, totalHalal } = splitMortality(logs);
  const lastAge      = Math.max(...logs.map(r => r.age));
  const currentWeek  = Math.ceil(lastAge / 7);
  const factPercent  = (totalDead / initialBirds) * 100;
  const normPercent  = getWeekMortalityNorm(currentWeek);
  const status       = factPercent <= normPercent       ? 'ok'
                     : factPercent <= normPercent * 1.3 ? 'warning'
                     : 'critical';
  return {
    totalDead,
    totalNatural,
    totalHalal,
    factPercent: factPercent.toFixed(2),
    naturalPercent: ((totalNatural / initialBirds) * 100).toFixed(2),
    halalPercent: ((totalHalal / initialBirds) * 100).toFixed(2),
    normPercent: normPercent.toFixed(1),
    status,
    currentWeek,
  };
}

/**
 * Прогноз живой массы к целевому дню убоя
 * @param {Array<{age: number, weight: number}>} logs
 * @param {number} targetDay - целевой день убоя (обычно 42)
 * @returns {{ forecastWeight, dailyGain } | null}
 */
export function forecastWeight(logs, targetDay = 42) {
  const withWeight = logs
    .filter(r => r.weight != null && r.weight > 0)
    .sort((a, b) => a.age - b.age);
  if (withWeight.length < 2) return null;

  const recent = withWeight.slice(-5);
  const first  = recent[0];
  const last   = recent[recent.length - 1];
  if (last.age === first.age) return null;
  const dailyGain = (last.weight - first.weight) / (last.age - first.age);
  const daysLeft  = targetDay - last.age;
  const forecastWeight = Math.round(last.weight + dailyGain * daysLeft);
  return { forecastWeight, dailyGain: Math.round(dailyGain) };
}

/**
 * Собрать по дням серию для графика массы: факт (только там, где есть взвешивание),
 * норма ROSS-308 (на каждый день таблицы стандарта) и прогноз (линейная
 * экстраполяция от последнего взвешивания до targetDay, тем же приростом, что и forecastWeight).
 * @param {Array<{age: number, weight: number}>} logs
 * @param {number} targetDay - целевой день убоя (обычно 42)
 * @returns {Array<{day, actual: number|null, standard: number|null, forecast: number|null}>}
 */
export function buildWeightSeries(logs, targetDay = 42) {
  const withWeight = (logs || [])
    .filter(r => r.weight != null && r.weight > 0)
    .sort((a, b) => a.age - b.age);

  const forecast = forecastWeight(logs || [], targetDay);
  const lastActual = withWeight[withWeight.length - 1] || null;

  const maxStandardDay = ROSS308_STANDARDS[ROSS308_STANDARDS.length - 1]?.day || targetDay;
  const lastDay = Math.min(Math.max(targetDay, lastActual?.age || 0), maxStandardDay);

  const points = [];
  for (let day = 1; day <= lastDay; day++) {
    const norm = getNormForDay(day);
    const actualLog = withWeight.find(r => r.age === day);
    let forecastVal = null;
    if (forecast && lastActual && day >= lastActual.age) {
      forecastVal = day === lastActual.age
        ? lastActual.weight
        : Math.round(lastActual.weight + forecast.dailyGain * (day - lastActual.age));
    }
    points.push({
      day,
      actual: actualLog ? actualLog.weight : null,
      standard: norm ? norm.weight : null,
      forecast: forecastVal,
    });
  }
  return points;
}

/**
 * Выбрать топ N партий, наиболее схожих с текущей (активной) партией.
 * Алгоритм (по приоритету цеха и поголовья):
 * 1. Исключить текущую партию и сводные партии (is_summary).
 * 2. Приоритет тому же цеху:
 *    - Сначала предыдущие партии того же цеха (отсортированные по близости поголовья, затем по дате).
 *    - Оставшиеся места дополняются партиями из других цехов, наиболее близкими по поголовью.
 * 3. Всего возвращается не более limit (по умолчанию 10) партий.
 *
 * @param {Array<object>} allBatches - список всех остальных партий
 * @param {object} currentBatch - текущая партия { id, workshop_id, initial_quantity, is_summary }
 * @param {number} limit - максимальное количество партий (default: 10)
 * @returns {Array<object>} - массив отфильтрованных и отсортированных партий
 */
export function getTopSimilarBatches(allBatches, currentBatch, limit = 10) {
  if (!allBatches?.length || !currentBatch) return [];

  const currentInitial = Number(currentBatch.initial_quantity) || 0;
  const currentWorkshopId = currentBatch.workshop_id || null;
  const isCurrentSummary = Boolean(currentBatch.is_summary);

  // 1. Фильтруем: не текущая, исключаем сводные (если текущая не сводная)
  const validBatches = allBatches.filter(b => {
    if (!b || b.id === currentBatch.id) return false;
    if (!isCurrentSummary && (b.is_summary || b.batch_name?.includes('Сводка'))) return false;
    return true;
  });

  // Функция сравнения по близости поголовья и дате
  const compareBySimilarity = (a, b) => {
    const diffA = Math.abs((Number(a.initial_quantity) || 0) - currentInitial);
    const diffB = Math.abs((Number(b.initial_quantity) || 0) - currentInitial);
    if (diffA !== diffB) {
      return diffA - diffB;
    }
    const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
    const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
    return dateB - dateA;
  };

  // 2. Разделяем на партии того же цеха и другие
  const sameWorkshopBatches = [];
  const otherBatches = [];

  for (const b of validBatches) {
    if (currentWorkshopId && b.workshop_id && b.workshop_id === currentWorkshopId) {
      sameWorkshopBatches.push(b);
    } else {
      otherBatches.push(b);
    }
  }

  sameWorkshopBatches.sort(compareBySimilarity);
  otherBatches.sort(compareBySimilarity);

  // 3. Формируем итоговый список топ-limit
  const result = sameWorkshopBatches.slice(0, limit);
  const remainingSlots = limit - result.length;
  if (remainingSlots > 0) {
    result.push(...otherBatches.slice(0, remainingSlots));
  }

  return result;
}

/**
 * Рассчитать падёж по историческим партиям на указанный день
 * @param {Array} historicalBatches - [{id, batch_name, initial_quantity, workshop_id, is_summary, start_date}]
 * @param {Array} historicalLogs    - [{batch_id, age, mortality, mortality_halal}]
 * @param {number} targetAge        - текущий возраст для сравнения
 * @param {object} [currentBatch]   - текущая партия (для дополнительной фильтрации топ-10 схожих, если передано больше)
 * @returns {Array<{batchName, totalDead, totalNatural, totalHalal, percent, naturalPercent, halalPercent, initialQuantity}>}
 */
export function calcHistoricalMortality(historicalBatches, historicalLogs, targetAge, currentBatch = null) {
  if (!historicalBatches?.length || !historicalLogs?.length) return [];

  let batchesToCompare = historicalBatches;
  if (currentBatch && batchesToCompare.length > 10) {
    batchesToCompare = getTopSimilarBatches(batchesToCompare, currentBatch, 10);
  }

  return batchesToCompare.map(batch => {
    const batchLogs = historicalLogs.filter(
      l => l.batch_id === batch.id && l.age <= targetAge
    );
    const { totalDead, totalNatural, totalHalal } = splitMortality(batchLogs);
    const toPercent = n => batch.initial_quantity > 0
      ? ((n / batch.initial_quantity) * 100).toFixed(2)
      : '0.00';
    return {
      batchName: batch.batch_name,
      totalDead,
      totalNatural,
      totalHalal,
      percent: toPercent(totalDead),
      naturalPercent: toPercent(totalNatural),
      halalPercent: toPercent(totalHalal),
      initialQuantity: batch.initial_quantity,
      startDate: batch.start_date,
    };
  });
}
