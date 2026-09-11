# Telegram Mini App — C: админ-панель

Дата: 2026-09-11

## Проблема

`TelegramApp.jsx` не различает роли — любой аутентифицированный Telegram-
пользователь получает клиентский `AuthedRoutes` (партии/дневной ввод/задачи
и т.д.). Десктопный `DesktopApp.jsx` ветвится на `AdminLayout` (роуты
`AdminDashboardPage`, `AdminCreateClientPage`, `AdminClientDetailPage`), когда
`session.user.app_metadata.role === 'admin'`, но в мобильной оболочке такого
ветвления нет вовсе. Это последний подпроект из роадмапа Фундамента.

## Цель

Добавить в `TelegramApp.jsx` то же ветвление по роли и три мобильных экрана,
достигающих функционального паритета с `AdminDashboardPage` (сводка по
клиентам + платформенный тренд), `AdminCreateClientPage` (создание клиента)
и `AdminClientDetailPage` (профиль клиента, бан/разбан, сброс пароля,
удаление аккаунта, тренды, цеха, партии с удалением).

## Вне рамок

- Изменения RPC (`admin_client_summary`, `admin_platform_trend`,
  `admin_create_client`, `admin_client_detail`, `admin_client_trend`,
  `admin_set_client_banned`, `admin_reset_client_password`,
  `admin_delete_client_account`, `admin_delete_batches`) и их прав доступа —
  используются как есть.
- Десктопные `AdminLayout.jsx` / `AdminDashboardPage.jsx` /
  `AdminCreateClientPage.jsx` / `AdminClientDetailPage.jsx` не трогаются.
- Полный визуальный паритет с десктопной таблицей — сводка клиентов и партий
  превращаются в карточки (см. «Принятые решения»); интерактивная сортировка
  по клику на столбец не переносится.

## Принятые решения

| Вопрос | Решение |
|---|---|
| `TrendChart.jsx` | Переиспользуется **без изменений** — чистый inline-SVG компонент на голых inline-стилях, без завязки на десктопную Tailwind-палитру и без внешних зависимостей; уже адаптивен (`width:100%` через `viewBox`). На мобильных графиках раскладываются в столбец (`flex-col`), а не в `grid` как на десктопе — под узкий экран. |
| Таблица клиентов → список карточек | Каждый клиент — `Card` с ключевыми метриками, тап открывает `/client/:id` (как клик по строке на десктопе). Сортировка по клику на столбец не переносится — список сортируется по email (как дефолт на десктопе), плюс поиск по email остаётся. |
| Таблица партий (мульти-выбор для удаления) → список карточек с чекбоксом | Каждая партия — `Card` с чекбоксом вверху; выбранные копятся в `selectedBatchIds`, снизу секции — кнопка «Удалить выбранные (N)». Вместо `window.confirm` — `ConfirmSheet` с тем же предупреждающим текстом, что на десктопе (единственное отклонение от паритета текста подтверждения: механизм диалога, не формулировка). |
| Удаление аккаунта (набор email для подтверждения) | Переносится как есть — текстовый инпут, кнопка неактивна, пока введённый текст не совпадает с `profile.email` побайтово (`.trim()`), как на десктопе. Без дополнительного `ConfirmSheet` — набор точного email уже служит подтверждением. |
| Layout: `TelegramAdminLayout` | Новый, отдельный от `TelegramLayout` (клиентского) — шапка с заголовком по роуту + кнопка «Выйти» справа (как в десктопном `AdminLayout`), нижняя навигация из 2 вкладок (Клиенты / + Клиент, без «Ещё» — в админке больше нечего туда класть). Не переиспользует `BottomTabBar`/`MoreSheet` (те жёстко заточены под клиентские роуты). |
| Логаут в админке | `telegramUnlink()` + `window.location.reload()` — та же механика, что в `MoreSheet.jsx` клиентской оболочки (не `supabase.auth.signOut()`, как на десктопе), потому что вся мобильная оболочка держится на Telegram-привязке аккаунта, а не на обычной email/password сессии. |
| Определение роли в `TelegramApp.jsx` | Роль читается уже **после** входа в `phase === 'ready'` (внутри нового компонента-диспетчера), а не внутри `run()` — так it работает одинаково что после прямого входа (`telegramSignIn` вернул `ok`), что после экрана привязки (`LinkingScreen` → `onLinked` → `setPhase('ready')`), не трогая существующую логику `run()`/`LinkingScreen`. |
| `useTelegramBackButton` `ROOTS` | Добавляем `/create-client` в общий `ROOTS` (наряду с `/`, `/daily-entry`, `/tasks`) — кнопка Back прячется на обеих верхнеуровневых вкладках админки. Безопасно для клиентской оболочки: путь `/create-client` там не существует. |
| Заголовок страницы клиента (`/client/:id`) | Статичный «Клиент» в шапке layout (как `/batch/:id` → статичное «Партия» в клиентском `TelegramLayout`) — email клиента показывается крупно в теле страницы, а не в заголовке шапки. |

## Архитектура

```
src/mobile/
  layouts/
    TelegramAdminLayout.jsx          # NEW — шапка + нижняя нав. (Клиенты / + Клиент)
  pages/admin/
    MobileAdminDashboardPage.jsx     # NEW — /
    MobileAdminCreateClientPage.jsx  # NEW — /create-client
    MobileAdminClientDetailPage.jsx  # NEW — /client/:clientId
  telegram/
    useTelegramBackButton.js         # MODIFIED — ROOTS += '/create-client'
  TelegramApp.jsx                    # MODIFIED — роль-диспетчер + роуты админки
```

Переиспользуется без изменений: `src/components/admin/TrendChart.jsx`,
`src/mobile/components/{Card,ConfirmSheet,FormField,StatGrid,EmptyState,
Spinner}.jsx`, `src/mobile/telegram/auth.js` (`telegramUnlink`),
`src/supabaseClient.js`, все admin RPC.

## MobileAdminDashboardPage

### Данные

```js
supabase.rpc('admin_client_summary')
// [{ client_user_id, email, workshops_count, active_batches, current_flock,
//    mortality_total, expenses_total, sales_total, last_sign_in_at }]
supabase.rpc('admin_platform_trend')
// [{ week_start, mortality, expenses, sales }]
```

### Поведение

- `StatGrid` — 6 карточек (Клиентов / Цехов всего / Активных партий /
  Текущее поголовье / Расходы всего / Продажи всего), суммы по всем
  клиентам без фильтра поиска (как на десктопе).
- 3 стековых `TrendChart` (падёж/расходы/продажи по неделям), с
  `SectionHeader` над каждым.
- Поиск по email — фильтрует список карточек ниже.
- Список клиентов: `Card` на клиента, `onClick` → `navigate('/client/' + id)`.
  Показывает email (жирным, `var(--tg-link)`), затем компактную строку
  метрик (цехов/партий/поголовье), падёж (красный, если > 0), расходы и
  продажи (`numberFmt`, без валютного символа — как на десктопе), дату
  последнего входа мелким hint-текстом.
- `EmptyState`, если после поиска ничего не найдено / клиентов ещё нет.

## MobileAdminCreateClientPage

### Данные

```js
supabase.rpc('admin_create_client', { client_email, client_password })
// returns new user id (string)
```

### Поведение

- `Card`-форма: email (`type="email"`, required), пароль (`type="text"`,
  `minLength={6}`, required — как на десктопе, специально не маскируется,
  чтобы админ мог свериться визуально перед передачей клиенту), кнопка
  «Создать аккаунт».
- Результат — цветная плашка под формой (зелёная/красная), на успехе поля
  очищаются.
- Подсказка снизу: аккаунт активен сразу, креды передаются клиенту вручную
  (тот же текст, что на десктопе).

## MobileAdminClientDetailPage

### Данные

```js
supabase.rpc('admin_client_detail', { target_user_id: clientId })
// { profile: {email, created_at, last_sign_in_at, banned_until},
//   workshops: [{id, name, capacity, is_active}],
//   batches: [{id, batch_name, is_summary, workshop_name, initial_quantity,
//              start_date, batch_end, is_active, current_flock,
//              mortality_total, last_log_date}] }
supabase.rpc('admin_client_trend', { target_user_id: clientId })
// [{ log_date, mortality, feed, avg_weight }]
supabase.rpc('admin_set_client_banned', { target_user_id, banned })
supabase.rpc('admin_reset_client_password', { target_user_id, new_password })
supabase.rpc('admin_delete_client_account', { target_user_id })
supabase.rpc('admin_delete_batches', { batch_ids })
```

### Поведение

- Профиль: email крупно, статус-бейдж (Активен/Заблокирован по
  `!!profile.banned_until`), даты регистрации/последнего входа.
- Кнопка «Заблокировать вход»/«Разблокировать» (цвет по состоянию) →
  `admin_set_client_banned` → перезагрузка `load()`.
- Кнопка «Сбросить пароль» открывает инлайн-форму (пароль ≥ 6 симв. +
  кнопка «Сохранить») → `admin_reset_client_password`; результат — цветная
  строка под формой.
- Опасная зона: текстовое поле «Введите email для подтверждения» + кнопка
  «Удалить аккаунт навсегда» (красная, неактивна пока текст ≠
  `profile.email.trim()`) → `admin_delete_client_account` → на успехе
  `navigate('/')`.
- 3 стековых `TrendChart` за 90 дней (падёж/корм/средний вес).
- Цеха: список `Card` (название, вместимость, статус).
- Партии: список `Card` с чекбоксом (мульти-выбор), бейдж «⭐ Сводка» для
  `is_summary`, метрики (цех, поголовье при старте, даты, статус, текущее
  поголовье, падёж — красным если > 0, дата последнего лога). Кнопка
  «Удалить выбранные (N)» снизу секции, неактивна при пустом выборе →
  открывает `ConfirmSheet` с тем же предупреждением, что на десктопе →
  `admin_delete_batches` → `load()`.
- Все ошибки RPC — баннер `text-tg-destructive` вверху страницы (как
  `actionError` на десктопе), не блокирующий остальной UI.

## Тестирование

- `npx eslint src` — без новых ошибок.
- `npm run build` — успешная сборка.
- Ручная проверка через Browser pane с `?tg_debug=1&tg_linked=1` — но
  роль-ветвление требует пользователя с `app_metadata.role === 'admin'` в
  реальном Supabase-проекте; при его отсутствии в подключённом окружении
  проверяется только рендер по коду (без входа реальным админом) и
  клиентская ветка остаётся не затронутой (регрессионная проверка: `/` и
  `/tasks` у обычного пользователя рендерятся как раньше).

## Файлы

- **Новые:** `src/mobile/layouts/TelegramAdminLayout.jsx`,
  `src/mobile/pages/admin/MobileAdminDashboardPage.jsx`,
  `src/mobile/pages/admin/MobileAdminCreateClientPage.jsx`,
  `src/mobile/pages/admin/MobileAdminClientDetailPage.jsx`.
- **Изменяются:** `src/mobile/TelegramApp.jsx` (роль-диспетчер + роуты
  админки), `src/mobile/telegram/useTelegramBackButton.js` (`ROOTS` +=
  `/create-client`).
- **Не трогаются:** `src/pages/admin/**`, `src/layouts/AdminLayout.jsx`,
  `src/components/admin/TrendChart.jsx`, `src/mobile/layouts/{TelegramLayout,
  BottomTabBar,MoreSheet}.jsx`, RPC/схема БД.

## Roadmap

После этого подпроекта весь роадмап Фундамента (`B1`/`B2`/`B3`/`C`) закрыт
— Telegram Mini App достигает полного функционального паритета с десктопом.
