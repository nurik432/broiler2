# Справочник клиентов и авто-распределение платежей по продажам

Дата: 2026-08-21

## Проблема

Сейчас платежи по продажам вносятся вручную, по одной продаже за раз:
открываешь модалку конкретной продажи (`src/pages/SalesPage.jsx`, клик по
строке) и добавляешь туда платёж (`payments.sale_id`). Это ломается на
практике: если клиент отдаёт одну крупную сумму, покрывающую сразу
несколько его продаж, приходится вручную открывать каждую продажу и
разносить сумму по частям, самостоятельно считая остатки. Кроме того,
форма не проверяет, что вводимая сумма не превышает остаток по продаже —
можно случайно занести переплату, и `balance` уйдёт в минус.

Дополнительная проблема: у продажи нет настоящего клиента как сущности —
только свободное текстовое поле `sales.customer_name`, без справочника и
без уникальности. Разносить платёж «по всем продажам этого клиента»
невозможно сделать надёжно, если «этот клиент» — это просто совпадение
текста.

## Цель

1. Завести настоящий справочник клиентов (`customers`), заменить текстовое
   поле продажи на ссылку на клиента.
2. Заменить ввод платежа «по одной продаже» на единое окно «Новое
   поступление»: выбрал клиента, ввёл сумму — система сама распределяет её
   по его неоплаченным продажам (от старых к новым), при необходимости
   разбивая сумму на несколько платежей.
3. Заодно устранить возможность переплаты — в новой модели она невозможна
   в принципе (алгоритм ограничен суммарным остатком клиента, а не суммой
   одной продажи).

## Вне рамок

- **Кредит/аванс клиента.** Если введённая сумма больше, чем весь долг
  клиента по всем его продажам — операция отклоняется с ошибкой. Хранить
  переплату как аванс на будущее — отдельная тема, не в этой итерации.
- **Объединение с `persons`.** Клиенты продаж — самостоятельная сущность,
  не связанная с `persons` (сотрудники/должники в других модулях). Не
  переиспользуем и не объединяем.
- **Удаление колонки `sales.customer_name`.** Физически колонку не
  удаляем в этой итерации (см. ниже) — только перестаём её читать/писать
  из фронтенда. Чистка — отдельная миграция после того, как новая модель
  обкатается на реальных данных.
- **История платежей по продаже остаётся только для чтения** — то есть
  посмотреть, какие платежи когда-то легли на конкретную продажу, всё ещё
  можно (кликом по строке), но добавлять платёж оттуда больше нельзя —
  только через «Новое поступление».

## Дизайн

### 1. Таблица `customers`

```sql
CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    full_name text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_can_manage_own_customers" ON public.customers
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.customers TO anon, authenticated, service_role;
```

Минимально — только имя, без телефона и прочих полей (не запрашивалось).
RLS-политика — тот же паттерн `auth.uid() = user_id`, что и везде в схеме
(см. `payments`/`sales`).

### 2. Миграция `sales`

```sql
ALTER TABLE public.sales ADD COLUMN customer_id uuid REFERENCES public.customers(id);
```

Nullable — как и сейчас с `customer_name`, не каждая продажа обязана иметь
клиента (разовые/безымянные продажи остаются возможны и просто не участвуют
в авто-распределении).

**Бэкофилл существующих данных** (одна миграция, идемпотентная):

```sql
-- 1. Создать по одному customers на каждое уникальное непустое
--    customer_name конкретного пользователя.
INSERT INTO public.customers (full_name, user_id)
SELECT DISTINCT ON (LOWER(TRIM(customer_name)), user_id)
    TRIM(customer_name), user_id
FROM public.sales
WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
ON CONFLICT DO NOTHING;

-- 2. Проставить customer_id всем продажам с непустым именем.
UPDATE public.sales s
SET customer_id = c.id
FROM public.customers c
WHERE s.customer_id IS NULL
  AND s.customer_name IS NOT NULL AND TRIM(s.customer_name) != ''
  AND LOWER(TRIM(s.customer_name)) = LOWER(c.full_name)
  AND s.user_id = c.user_id;
```

(Тот же приём, что уже использован в миграции `persons`/`employees` в этом
проекте — `DISTINCT ON` по нормализованному имени + `user_id`.)

`sales.customer_name` не удаляется физически — фронтенд просто перестаёт
её читать и писать.

### 3. `get_sales_with_stats()` — добавить `customer_id`

Функция уже недавно чинилась (добавили `batch_is_active`, миграция
`20260821160000`). Тем же приёмом (`DROP FUNCTION` + `CREATE`, т.к.
меняется набор колонок) добавляем `customer_id`, **сохраняя
`batch_is_active`** — чтобы не откатить прошлый фикс:

```sql
DROP FUNCTION IF EXISTS public.get_sales_with_stats();

CREATE FUNCTION public.get_sales_with_stats()
RETURNS TABLE(
    id uuid,
    sale_date date,
    customer_id uuid,
    customer_name text,
    weight_kg numeric,
    price_per_kg numeric,
    created_at timestamp with time zone,
    batch_id uuid,
    batch_name text,
    batch_is_active boolean,
    total_amount numeric,
    total_paid numeric,
    balance numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.sale_date,
        c.id AS customer_id,
        c.full_name AS customer_name,
        s.weight_kg,
        s.price_per_kg,
        s.created_at,
        s.batch_id,
        b.batch_name,
        b.is_active AS batch_is_active,
        (s.weight_kg * s.price_per_kg) as total_amount,
        COALESCE(p.total_paid, 0) as total_paid,
        (s.weight_kg * s.price_per_kg) - COALESCE(p.total_paid, 0) as balance
    FROM
        sales AS s
    LEFT JOIN (
        SELECT sale_id, SUM(amount) as total_paid
        FROM payments GROUP BY sale_id
    ) AS p ON s.id = p.sale_id
    LEFT JOIN broiler_batches AS b ON s.batch_id = b.id
    LEFT JOIN customers AS c ON s.customer_id = c.id
    WHERE
        s.user_id = auth.uid()
    ORDER BY
        s.sale_date DESC, s.created_at DESC;
END;
$$;

ALTER FUNCTION public.get_sales_with_stats() OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_sales_with_stats() TO anon, authenticated, service_role;
```

Название поля `customer_name` в ответе функции сохраняется (просто теперь
берётся из `customers.full_name`, а не из `sales.customer_name`) — чтобы
не трогать остальной код, который уже читает `sale.customer_name` (отчёт
по продажам и т.д.).

### 4. UI: форма «Добавить продажу» (`SalesPage.jsx`)

Текстовое поле «Покупатель» заменяется на `<select>` со списком клиентов
пользователя (аналог существующих пикеров партий — `activeBatches`-паттерн,
только для `customers`). Рядом — компактная форма «+ Новый клиент» (поле
имени + кнопка), создающая запись в `customers` и сразу выбирающая её.
Значение по умолчанию — пусто (продажа без клиента по-прежнему возможна).

Форма «Изменить» существующую продажу получает тот же пикер вместо
текстового поля.

### 5. UI: окно «Новое поступление»

Новая кнопка на странице продаж (например, рядом с «Показать продажи
архивных партий»), открывающая модалку:

- Выбор клиента (тот же список `customers`).
- Дата, сумма.
- Кнопка «Провести».

Логика на клиенте (JS, без новой SQL-функции — по аналогии с тем, как в
проекте уже считаются деривативные данные в JS, а не в БД):

```
1. unpaidSales = все продажи выбранного клиента (через get_sales_with_stats,
   отфильтрованные по customer_id) с balance > 0, отсортированные по
   sale_date по возрастанию (старые первыми).
2. totalOwed = сумма balance по unpaidSales.
3. если amount > totalOwed → ошибка "У клиента остаток всего X, введено Y",
   ничего не создаём.
4. иначе идём по unpaidSales по порядку:
     chunk = min(remaining, sale.balance)
     INSERT INTO payments (sale_id: sale.id, amount: chunk, payment_date, user_id)
     remaining -= chunk
     если remaining == 0 — стоп
```

Каждый созданный `payments`-ряд — самостоятельная запись с `amount > 0`
(ограничение `payments_amount_check` уже есть в схеме, ничего менять не
нужно) — при частичном закрытии продажи создаётся ровно один платёж на эту
продажу, при полном закрытии нескольких — по одному платежу на каждую.

### 6. Модалка по клику на продажу — становится read-only

Форма «Дата / Сумма / Добавить» внутри модалки (текущий `handleAddPayment`)
удаляется. Остаётся: сводка (к оплате/оплачено/остаток) и список истории
платежей (без формы редактирования отдельного платежа — редактировать
платёж после авто-распределения бессмысленно, только удалить).

## Раскатка

Как и с предыдущими миграциями в этом проекте: тестируем и проверяем на
локальном Docker Supabase, затем накатываем на прод тем же способом
(`psql` через connection string). Порядок:

1. `customers` + RLS + гранты.
2. `sales.customer_id` + бэкофилл.
3. Фикс `get_sales_with_stats()`.
4. Фронтенд (форма продажи, окно поступления, урезанная модалка).

## Тестирование

Тестов в проекте нет. Ручная проверка на локальном Docker:

- Создать клиента, 3 продажи на него (с разными датами и суммами).
- Внести платёж через «Новое поступление» на сумму, закрывающую первую
  продажу полностью и частично — вторую → проверить, что в `payments`
  появилось ровно 2 записи с правильными суммами, и остатки продаж
  пересчитались верно.
- Ввести сумму больше суммарного долга клиента → должна быть ошибка, ни
  одной записи в `payments` не создано.
- Продажа без клиента (`customer_id IS NULL`) не должна попадать ни в один
  расчёт распределения.
- Клик по строке продажи по-прежнему показывает историю платежей, но без
  формы добавления.
