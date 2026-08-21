# Точная себестоимость и прибыль по активным партиям

Дата: 2026-08-21

## Проблема

`generate_batch_report()` (единственный существующий расчёт прибыли) считает
прибыль как `продажи − (расходы + зарплаты)`. Корм, лекарства и уголь —
реальные и часто крупнейшие затраты хозяйства — в этот расчёт не входят
вовсе:

- **Корм** (`feed_deliveries`) хранит только количество (`quantity_kg`), без
  цены. Цена корма сейчас существует только как ручной ввод в
  `localStorage` браузера (`src/pages/FeedPage.jsx`) — не сохраняется в БД,
  не участвует ни в каком расчёте прибыли, теряется при смене
  устройства/браузера.
- **Лекарства** (`medicine_transactions`) и **уголь** (`coal_transactions`)
  уже полноценно учитывают закупку/долг/оплату с ценой, но не привязаны ни к
  одной партии (`batch_id` отсутствует) — их стоимость физически некуда
  подставить в отчёт по конкретной партии.

Пользователь уже ведёт «сводную партию» (`is_summary = true`,
`src/utils/summaryBatchSync.js`) — агрегат по всем **активным** партиям, но
синхронизация сейчас касается только `daily_logs`. Финансовая сторона
(себестоимость/прибыль) в сводке не считается вовсе.

## Цель

Дать точный расчёт прибыли **по активным партиям в моменте** (не за всё
время бизнеса), включающий все реальные затраты: продажи, расходы, зарплаты,
корм, лекарства, уголь. Расчёт отображается через уже существующую сводную
партию.

## Вне рамок этой задачи

- **Автоматический зачёт долга при продаже** (когда продажа компании, у
  которой есть долг за корм, автоматически уменьшает этот долг) — реальная
  особенность бизнеса пользователя, но это про движение денег/долга, а не про
  расчёт себестоимости. Затрата на корм признаётся в момент закупки
  независимо от того, как и когда гасится долг. Откладывается как отдельная
  задача; пока зачёт (если случится) фиксируется вручную через существующие
  `debts`/`debt_payments`.
- Складские остатки, учёт поставщиков, планирование закупок — не требуются
  пользователем сейчас.
- Себестоимость/прибыль **за всё время** (включая архивные партии) — сводка
  сознательно ограничена активными партиями, в духе уже существующей логики
  `summaryBatchSync`.

## Дизайн

### 1. Изменения схемы

**`feed_deliveries`** — добавить поля покупки (миграция, все поля nullable —
существующие строки не ломаются):

```sql
ALTER TABLE public.feed_deliveries
  ADD COLUMN IF NOT EXISTS price_per_kg numeric,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS transaction_type text
    CHECK (transaction_type IS NULL OR transaction_type IN ('purchase', 'debt')),
  ADD COLUMN IF NOT EXISTS company text;
```

Каждая запись поставки корма теперь одновременно и запись о покупке.
`transaction_type`: `'purchase'` — оплачено сразу, `'debt'` — взято в долг.
Оплата долга за корм — через уже существующие `public.debts` /
`public.debt_payments` (привязка к `public.persons`, который уже
переиспользуется для сотрудников и должников) — новых таблиц не заводим.

**`medicine_transactions`** и **`coal_transactions`** — добавить
необязательную привязку к партии:

```sql
ALTER TABLE public.medicine_transactions
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.broiler_batches(id);

ALTER TABLE public.coal_transactions
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.broiler_batches(id);
```

`NULL` означает «общая/складская закупка, не привязанная к конкретной
партии» — такие записи всё равно считаются текущей затратой хозяйства (см.
ниже) и участвуют в сводке.

### 2. Расчёт: `get_active_summary_report()`

Новая SQL-функция, без параметров (использует `auth.uid()`), возвращает
разбивку по категориям + итог:

```sql
CREATE OR REPLACE FUNCTION public.get_active_summary_report()
RETURNS TABLE(
    total_sales numeric,
    total_feed_cost numeric,
    total_medicine_cost numeric,
    total_coal_cost numeric,
    total_expenses numeric,
    total_salaries numeric,
    total_cost numeric,
    profit numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
    active_ids uuid[];
    v_sales numeric;
    v_feed numeric;
    v_medicine numeric;
    v_coal numeric;
    v_expenses numeric;
    v_salaries numeric;
    v_cost numeric;
BEGIN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO active_ids
    FROM public.broiler_batches
    WHERE user_id = auth.uid() AND is_active = true AND is_summary = false;

    SELECT COALESCE(SUM(s.weight_kg * s.price_per_kg), 0) INTO v_sales
    FROM public.sales s
    WHERE s.user_id = auth.uid()
      AND (s.batch_id = ANY(active_ids) OR s.batch_id IS NULL);

    SELECT COALESCE(SUM(f.amount), 0) INTO v_feed
    FROM public.feed_deliveries f
    WHERE f.user_id = auth.uid() AND f.transaction_type IN ('purchase', 'debt')
      AND (f.batch_id = ANY(active_ids) OR f.batch_id IS NULL);

    SELECT COALESCE(SUM(m.amount), 0) INTO v_medicine
    FROM public.medicine_transactions m
    WHERE m.user_id = auth.uid() AND m.transaction_type IN ('purchase', 'debt')
      AND (m.batch_id = ANY(active_ids) OR m.batch_id IS NULL);

    SELECT COALESCE(SUM(c.amount), 0) INTO v_coal
    FROM public.coal_transactions c
    WHERE c.user_id = auth.uid() AND c.transaction_type IN ('purchase', 'debt')
      AND (c.batch_id = ANY(active_ids) OR c.batch_id IS NULL);

    SELECT COALESCE(SUM(e.amount), 0) INTO v_expenses
    FROM public.expenses e
    WHERE e.user_id = auth.uid()
      AND (e.batch_id = ANY(active_ids) OR e.batch_id IS NULL);

    SELECT COALESCE(SUM(sal.amount), 0) INTO v_salaries
    FROM public.salaries sal
    WHERE sal.user_id = auth.uid() AND sal.batch_id = ANY(active_ids);

    v_cost := v_feed + v_medicine + v_coal + v_expenses + v_salaries;

    RETURN QUERY SELECT
        v_sales, v_feed, v_medicine, v_coal, v_expenses, v_salaries,
        v_cost, (v_sales - v_cost);
END;
$$;
```

`transaction_type IN ('purchase', 'debt')` намеренно исключает `'payment'` —
платёж по долгу не новая затрата, а погашение уже учтённой (та же логика уже
используется в `get_medicine_summary`).

`salaries` не имеет смысла для `batch_id IS NULL` (зарплата всегда платится
в рамках конкретной партии/периода) — фильтруется только по активным
партиям, без варианта «без партии».

### 3. UI

- **`src/pages/FeedPage.jsx`** — форма ввода поставки получает поля цены за
  кг, типа операции (сразу/в долг), компании. Существующий трюк с
  `feedPrices` в `localStorage` удаляется целиком (расчёт стоимости корма
  переезжает на сервер и в реальные данные).
- **Страницы ввода лекарств/угля** — добавить необязательный выбор партии в
  форму транзакции.
- **`src/pages/BatchReportPage.jsx`** — при открытии отчёта для
  `is_summary`-партии вызывать `get_active_summary_report()` вместо
  `generate_batch_report`, показывать разбивку по всем категориям и итоговую
  прибыль.

### 4. Раскатка

Прод уже развёрнут (Vercel + облачный Supabase); текущий воркспейс — тестовый
контур:

1. Миграции пишем и проверяем локально через уже настроенный
   `npx supabase start` (Docker) — до полной сходимости расчёта.
2. После проверки — накатываем те же миграции на прод-Supabase
   (`supabase db push` с прод-креденшами или через SQL-редактор в Supabase
   Dashboard — способ уточняется в момент деплоя).
3. Фронтенд — обычный деплой на Vercel после мержа в `main`.

### 5. Тестирование

Автотестов в проекте нет. Ручная проверка в локальном Docker-Supabase:

- Завести тестовую партию, отметить активной.
- Добавить поставки корма с разными `transaction_type` (сразу/в долг) и
  ценами → сводка должна включать сумму.
- Добавить лекарства/уголь с привязкой к партии и без неё → оба варианта
  должны попасть в сводку.
- Добавить `'payment'`-транзакцию по лекарствам/углю → сводка не должна
  измениться (платёж не новая затрата).
- Архивировать партию (`is_active = false`) → все её затраты и продажи
  должны исчезнуть из сводки.
- Сверить итоговую прибыль вручную по всем введённым числам.
