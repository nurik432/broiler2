# Telegram Mini App — Фундамент мобильного интерфейса

Дата: 2026-09-10

## Проблема

Приложение — Vite + React SPA с десктопной компоновкой: боковой сайдбар
(`src/components/Sidebar.jsx`), шапка с выходом (`src/layouts/MainLayout.jsx`),
вход по email/паролю через Supabase (`src/components/Auth.jsx`). На мобильном
единственная адаптация — гамбургер-меню поверх тех же страниц. Таблицы и
модалки не рассчитаны на телефон, вход требует ручного ввода логина при
каждом открытии, а сценарий «открыл бота в Telegram и внёс суточные
показатели по цеху» вообще не поддержан.

Нужен отдельный, полностью мобильный интерфейс, который показывается, когда
приложение открыто как Telegram Mini App, с автоматическим входом по данным
Telegram — не ломая существующий десктоп.

## Цель

1. Полный паритет функций на мобильном (все клиентские страницы + админские),
   реализованный поэтапно; этот документ описывает **только Фундамент**.
2. Автовход через Telegram `initData` с серверной проверкой подписи; разовая
   привязка Telegram-аккаунта к аккаунту Supabase по email/паролю, дальше —
   вход без ввода логина.
3. Нативный вид Telegram: цвета из `themeParams`, авто светлая/тёмная тема,
   штатные `MainButton` / `BackButton`.
4. Тот же Vite-entry и те же маршруты: внутри Telegram рендерится отдельная
   оболочка и мобильные экраны, вне Telegram — нынешний десктоп без изменений.

## Вне рамок (этой итерации — Фундамент)

- **Мобильные версии 12 клиентских экранов** (batch log, batch report,
  workshops, tasks, expenses, sales, salaries, debts, feed, coal, medicines,
  notes) и **3 админских** — идут подпроектами B/C. В Фундаменте на их
  маршрутах стоит `<MobileStub>`, чтобы deep-link не давал 404.
- **Отвязка Telegram-аккаунта** через UI (политика чтения своей связки
  закладывается, экран — позже).
- **Push-уведомления из бота, команды бота, inline-режим** — не трогаем,
  бот нужен только как контейнер Mini App.
- **Отдельный бандл / отдельный деплой** (`telegram.html`) — сознательно
  отклонено в пользу авто-переключения оболочки в общем entry.
- **Адаптив десктопных страниц** — мобильные экраны пишутся отдельно, а не
  через брейкпоинты существующих компонентов.
- **Мультиаккаунт на один Telegram ID** — один `tg_id` ↔ один `user_id`.

## Принятые решения

| Вопрос | Решение |
|---|---|
| Архитектура | Платформенный свитч в `App.jsx` + параллельное дерево `src/mobile/`; общий слой — `hooks/`, `utils/`, `constants/`, `supabaseClient.js` |
| Поставка | Тот же entry, детект `isTelegram()` по наличию непустого `window.Telegram.WebApp.initData` |
| Вход | Автовход через `initData`; проверка подписи в Supabase Edge Function |
| Минт сессии | `auth.admin.generateLink({type:'magiclink'})` → клиент `verifyOtp(token_hash)` (полноценная сессия с refresh-токеном). Кастомный JWT отклонён — протухает за час |
| Привязка | Разовая: первый запуск — форма email/пароль, `tg_id` пишется в `telegram_links`, дальше автологин |
| Конфликт `tg_id` | `ON CONFLICT (tg_id) DO UPDATE` — перепривязка к новому аккаунту |
| Макс. возраст `auth_date` | 24 часа |
| Корневой таб | Список «Партии» (в Фундаменте). Экран «Дашборд норма/факт» — позже, в B |
| Стиль | Нативный Telegram: `themeParams` → CSS-переменные, `colorScheme` → `data-theme` |
| Telegram SDK | Статический `<script>` в `index.html` (рекомендация Telegram, ~1 КБ, десктоп игнорирует) |
| Тест-раннер | В репо нет. Ручная матрица + `deno test` на HMAC + dev-харнесс `?tg_debug=1` |

## Архитектура

### Платформенный свитч

`src/App.jsx` сводится к:

```jsx
import { isTelegram } from './mobile/telegram/context';
import DesktopApp from './DesktopApp';
import TelegramApp from './mobile/TelegramApp';

export default function App() {
  return isTelegram() ? <TelegramApp /> : <DesktopApp />;
}
```

`src/DesktopApp.jsx` — нынешнее содержимое `App.jsx` (владение сессией через
`supabase.auth.getSession` / `onAuthStateChange`, ветка admin/client, весь
`<Routes>`-дерево) переносится **без функциональных изменений**.

### Дерево `src/mobile/`

```
src/mobile/
  TelegramApp.jsx            # ThemeProvider + AuthGate + Routes под TelegramLayout
  telegram/
    context.js               # isTelegram(), getWebApp(), getInitDataRaw()
    sdk.js                    # initTelegram(): ready/expand/тема хедера
    theme.js                  # applyThemeParams(), subscribeTheme()
    auth.js                   # telegramSignIn(), telegramLink(email,password)
    useTelegramBackButton.js
    useTelegramMainButton.js
    useTelegramHaptics.js
    mockTelegram.js           # dev-харнесс для ?tg_debug=1
  layouts/
    TelegramLayout.jsx        # хедер + <main> + BottomTabBar
    BottomTabBar.jsx
    MoreSheet.jsx
  screens/
    SplashScreen.jsx
    LinkingScreen.jsx
    AuthErrorScreen.jsx
    MobileStub.jsx            # заглушка для ещё не сделанных маршрутов
  pages/
    MobileBatchesPage.jsx     # корневой экран Фундамента
    MobileDailyEntryPage.jsx  # второй экран Фундамента
  components/
    Card.jsx  ListRow.jsx  BottomSheet.jsx  FormField.jsx
    NumberStepper.jsx  SegmentedControl.jsx  StatusPill.jsx
    Spinner.jsx  EmptyState.jsx  SectionHeader.jsx
```

Общий код (`src/hooks/**`, `src/utils/**`, `src/constants/**`,
`src/supabaseClient.js`) переиспользуется как есть. Доменная логика
(нормы ROSS-308 через `utils/normComparison.js`, синк сводной партии через
`utils/summaryBatchSync.js`, зарплаты через `utils/calculateSalary.js`) **не
дублируется**.

## Детект контекста и SDK

- `index.html`: в `<head>` добавляется
  `<script src="https://telegram.org/js/telegram-web-app.js"></script>`.
- `context.js::isTelegram()` →
  `typeof window.Telegram?.WebApp?.initData === 'string' && window.Telegram.WebApp.initData.length > 0`.
  Используется именно сырой `initData` — он нужен для проверки подписи и пуст
  вне Telegram.
- `sdk.js::initTelegram()` вызывается один раз в `TelegramApp` до рендера
  контента: `WebApp.ready()`, `WebApp.expand()`,
  `WebApp.disableVerticalSwipes?.()`, синхронизация `headerColor` /
  `backgroundColor` с текущей темой.

## Мост темы

`telegram/theme.js`:

- `applyThemeParams(webApp)` — пишет CSS-переменные на
  `document.documentElement`:

  | Telegram `themeParams` | CSS-переменная |
  |---|---|
  | `bg_color` | `--tg-bg` |
  | `text_color` | `--tg-text` |
  | `hint_color` | `--tg-hint` |
  | `link_color` | `--tg-link` |
  | `button_color` | `--tg-button` |
  | `button_text_color` | `--tg-button-text` |
  | `secondary_bg_color` | `--tg-secondary-bg` |
  | `section_bg_color` | `--tg-section-bg` |
  | `destructive_text_color` | `--tg-destructive` |

- Отсутствующие ключи (старые клиенты) — фолбэки отдельными наборами для
  light и dark.
- `webApp.colorScheme` (`'light'|'dark'`) → атрибут `data-theme` и
  `color-scheme` на `<html>`.
- `subscribeTheme(cb)` — подписка на событие `themeChanged`, переприменение
  на лету.

`src/index.css` — добавляется `@theme`-блок Tailwind v4, маппящий
`--color-tg-*` на `var(--tg-*)`, чтобы работали утилиты `bg-tg-bg`,
`text-tg-text`, `bg-tg-section` и т.д. На десктоп не влияет (эти классы там
не используются).

## Авторизация

### Таблица `telegram_links`

Новая миграция `supabase/migrations/<timestamp>_create_telegram_links.sql`:

```sql
create table public.telegram_links (
  tg_id       bigint primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  tg_username text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index telegram_links_user_id_key on public.telegram_links(user_id);

alter table public.telegram_links enable row level security;

create policy "read own telegram link" on public.telegram_links
  for select to authenticated using (user_id = auth.uid());
```

Политик на insert/update/delete нет → запись только через service_role
(Edge Function). Связь 1:1 в обе стороны.

### Edge Function `supabase/functions/telegram-auth/index.ts`

Одна функция, ветвление по полю `action` в теле запроса.

**Общее — проверка подписи `initData`** (`verify.ts`):
1. Разобрать query-string `initData`, извлечь `hash`, собрать
   `data_check_string` (остальные пары, отсортированы, склеены через `\n`).
2. `secret = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)`.
3. Валидно, если `HMAC_SHA256(key=secret, msg=data_check_string) == hash`
   (hex).
4. Отклонить, если `now - auth_date > 86400` секунд.
5. Вернуть распарсенного `user` (`id`, `username`, `first_name`).

**`action: "login"`** (без `Authorization`):
- Проверить подпись → `tg_id = user.id`.
- `select user_id, email from telegram_links where tg_id = $1` (service role).
  - Найдено → `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })`,
    вернуть `{ linked: true, token_hash: <properties.hashed_token> }`.
  - Не найдено → `{ linked: false }`.

**`action: "link"`** (с `Authorization: Bearer <access_token>`):
- Проверить подпись → `tg_id`, `tg_username`.
- `supabaseAdmin.auth.getUser(jwt)` → `user_id`, `email`.
- `insert into telegram_links (tg_id, user_id, email, tg_username)
   values (...) on conflict (tg_id) do update set
   user_id = excluded.user_id, email = excluded.email,
   tg_username = excluded.tg_username, updated_at = now()`.
- Вернуть `{ ok: true }`.

Инфраструктура:
- `supabase/functions/_shared/cors.ts` — обработка `OPTIONS` и заголовок
  `Access-Control-Allow-Origin` для домена Vercel.
- Секрет `TELEGRAM_BOT_TOKEN` — через `supabase secrets set`.
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` инжектятся платформой.
- `verify.test.ts` — `deno test` на HMAC с известным вектором Telegram
  (валидный + просроченный + подделанный hash).

### Клиентский оркестратор `telegram/auth.js`

`telegramSignIn()` → `{ status: 'ok' | 'need-link' | 'error', error? }`:
1. `supabase.auth.getSession()` — если сессия жива, вернуть `ok` сразу
   (повторный запуск без обращения к функции; supabase-js сам обновляет
   токен).
2. Иначе POST `telegram-auth` `{ action: 'login', initData }`.
3. `linked: true` → `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`
   → `ok`.
4. `linked: false` → `need-link`.
5. 401 / сетевая ошибка → `error`.

`telegramLink(email, password)` → `{ ok, error? }`:
1. `supabase.auth.signInWithPassword({ email, password })`.
2. POST `telegram-auth` `{ action: 'link', initData }` +
   `Authorization: Bearer <access_token>`.
3. Успех → в приложение.

## Экраны оболочки

### `TelegramApp.jsx`

- `<TelegramThemeProvider>` — на маунте `initTelegram()` + `applyThemeParams()`,
  подписка `subscribeTheme`.
- `<TelegramAuthGate>` — гоняет `telegramSignIn()`:
  - `pending` → `<SplashScreen>` (лого + спиннер).
  - `need-link` → `<LinkingScreen>`.
  - `error` → `<AuthErrorScreen>` (текст + «Повторить» / «Открыть заново»).
  - `ok` → дети.
- `<Routes>` (react-router, тот же `BrowserRouter` из `main.jsx`),
  пути зеркалят десктоп, всё под `<TelegramLayout>`:
  - `/` → `<MobileBatchesPage>`
  - `/daily-entry` → `<MobileDailyEntryPage>`
  - `/medicines`, `/expenses`, `/salaries`, `/debts`, `/notes`, `/sales`,
    `/feed`, `/coal`, `/workshops`, `/tasks`, `/batch/:batchId`,
    `/batch/:batchId/report` → `<MobileStub title="…">`
  - роль `admin` (`session.user.app_metadata.role === 'admin'`) →
    `<TelegramAdminApp>` — стаб, наполняется в подпроекте C.

### `LinkingScreen.jsx`

Нативно-стилизованная форма (email + пароль), тексты RU, поля ≥ 44px,
ошибки inline. Подтверждение — через `MainButton` Telegram
(«Привязать аккаунт», состояние loading). Пояснение: «Введите логин от
веб-версии один раз — дальше вход автоматический».

## Навигация

`layouts/TelegramLayout.jsx` — колонка на всю высоту, фон `bg-tg-bg`:
- слим-хедер с заголовком текущей секции;
- `<main>` со скроллом, `padding-bottom` = высота таб-бара +
  `env(safe-area-inset-bottom)`;
- `<BottomTabBar>` — 4 таба + «Ещё»:
  **Партии** (`/`), **Ввод** (`/daily-entry`), **Задачи** (`/tasks`),
  **Ещё** (открывает `<MoreSheet>`).
- `<MoreSheet>` — bottom sheet, сгруппированный список:
  *Финансы* (Расходы, Продажи, Зарплаты, Долги),
  *Учёт* (Цеха, Корм, Уголь),
  *Справочники* (Лекарства, Заметки),
  + **Выйти** (`supabase.auth.signOut()` → `SplashScreen`).

Хуки:
- `useTelegramBackButton()` — на не-корневых маршрутах показывает нативный
  `BackButton`, клик → `navigate(-1)`; на маршрутах-табах прячет.
- `useTelegramMainButton({ text, onClick, visible, loading })` — экран
  формы/детали управляет нативной нижней кнопкой (напр. «Сохранить» на
  Дневном вводе); хук чистит обработчики при размонтировании.
- `useTelegramHaptics()` — `impactOccurred('light')` на успешном сохранении
  (опционально, degrade-gracefully).

## Мобильные примитивы `components/`

`Card`, `ListRow` (label / value / chevron), `BottomSheet` (React-портал,
backdrop, свайп-вниз для закрытия), `FormField` (крупные инпуты),
`NumberStepper` (±, для падежа/корма/воды), `SegmentedControl`,
`StatusPill` (`ok` / `warning` / `critical` — цвет по статусу, **статус
берётся из `utils/normComparison.js`, пороги не переопределяются**),
`Spinner`, `EmptyState`, `SectionHeader`. Цвета — `var(--tg-*)`,
раскладка — Tailwind.

## Экраны в составе Фундамента

### `MobileBatchesPage.jsx` (корень `/`)

Список партий карточками. Данные — тем же запросом/хуком, что и десктопный
`BatchesPage` (RPC `get_batches_with_stats` / текущий источник). Карточка:
название, цех, возраст, поголовье, короткий статус. Тап → `/batch/:id`
(пока `MobileStub`). Пустое состояние — `<EmptyState>`.
Проверяет: раскладку, табы, тему, скролл, пустое состояние.

### `MobileDailyEntryPage.jsx` (`/daily-entry`)

Форма суточного ввода: выбор цеха/партии (`SegmentedControl` или
`BottomSheet`-пикер), поля падёж (природный/халяльный), корм, вода, вес —
крупные `NumberStepper` / `FormField`. Сохранение — через `MainButton`.
После записи **обязательно** вызывает `syncSummaryBatchLog(logDate, userId)`
из `utils/summaryBatchSync.js` (инвариант проекта — иначе сводная партия
разъезжается). При наличии — переиспользует существующую логику записи из
`DailyEntryPage`, вынесенную в общий хук; если выносить дорого, дублируется
только последовательность вызовов Supabase, синк остаётся общим.
Проверяет: формы, нативную кнопку, запись в БД, синк сводной партии,
haptics.

## Крайние случаи

| Ситуация | Поведение |
|---|---|
| Открыто вне Telegram (браузер) | `isTelegram()` = false → обычный `DesktopApp` |
| `initData` невалиден / подделан / просрочен (>24 ч) | Функция → 401 → `AuthErrorScreen` |
| `telegram-auth` вернул `linked: false` | `LinkingScreen` |
| `signInWithPassword` не прошёл | inline-ошибка на `LinkingScreen`, остаёмся |
| `tg_id` уже привязан к другому `user_id` | `ON CONFLICT DO UPDATE` — перепривязка |
| Сессия жива, роль admin | `TelegramAdminApp` (стаб) |
| Оффлайн при запуске | `SplashScreen` с кнопкой «Повторить» |
| Telegram Desktop / Web (не телефон) | Тоже мобильный UI — приемлемо |
| Открыт ещё не сделанный раздел | `MobileStub` с заголовком, без 404 |

## Тестирование

В репозитории нет тест-раннера. Проверка:

- **Dev-харнесс:** query-параметр `?tg_debug=1` (`telegram/mockTelegram.js`)
  подкладывает фейковый `window.Telegram.WebApp` с мок-`initData`; вызов
  Edge Function при `import.meta.env.DEV && mock` мокается —
  оболочку и экраны можно гонять в обычном браузере / Browser pane.
- **`deno test`** (`supabase/functions/telegram-auth/verify.test.ts`) —
  HMAC-проверка: валидный вектор, просроченный `auth_date`, подделанный
  `hash`.
- **Ручная матрица** (на реальном боте):
  1. Новый пользователь → `LinkingScreen` → ввод логина → приложение.
  2. Повторный запуск привязанного → вход мгновенный, без формы.
  3. Протухшая Supabase-сессия → тихая ре-авторизация через функцию.
  4. Подделанный `initData` → `AuthErrorScreen`.
  5. Тот же URL в обычном браузере → десктоп не изменился.
  6. Переключение light/dark в Telegram → тема меняется на лету.
  7. `BackButton` на `/batch/:id` возвращает на список.
  8. `MainButton` «Сохранить» на Дневном вводе пишет лог и синкает сводную
     партию.
- `npm run lint` и `npm run build` — зелёные.

## Затрагиваемые файлы

**Новые:**
- `supabase/migrations/<timestamp>_create_telegram_links.sql`
- `supabase/functions/telegram-auth/index.ts`
- `supabase/functions/telegram-auth/verify.ts`
- `supabase/functions/telegram-auth/verify.test.ts`
- `supabase/functions/_shared/cors.ts`
- `src/DesktopApp.jsx`
- `src/mobile/TelegramApp.jsx`
- `src/mobile/telegram/{context,sdk,theme,auth,mockTelegram}.js`
- `src/mobile/telegram/{useTelegramBackButton,useTelegramMainButton,useTelegramHaptics}.js`
- `src/mobile/layouts/{TelegramLayout,BottomTabBar,MoreSheet}.jsx`
- `src/mobile/screens/{SplashScreen,LinkingScreen,AuthErrorScreen,MobileStub}.jsx`
- `src/mobile/pages/{MobileBatchesPage,MobileDailyEntryPage}.jsx`
- `src/mobile/components/*` (10 примитивов)
- `docs/telegram-mini-app.md` — настройка бота через BotFather, секреты,
  деплой функции и миграции, привязка Mini App URL.

**Изменяются:**
- `src/App.jsx` — сводится к платформенному свитчу.
- `index.html` — тег `<script>` Telegram SDK.
- `src/index.css` — `@theme`-блок `--color-tg-*` + обработка `data-theme`.
- `CLAUDE.md` — абзац про мобильную оболочку и `src/mobile/`.

**Не трогаются:** `src/pages/**`, `src/hooks/**`, `src/utils/**`,
`src/constants/**`, `src/components/**`, `src/layouts/{MainLayout,AdminLayout}.jsx`,
`src/main.jsx`, `vercel.json`.

## Roadmap (после Фундамента)

Каждый подпроект — своя спека → план → реализация; `MobileStub` на маршруте
заменяется реальным экраном.

- **B1 — ежедневный цикл:** batch log, batch report, workshops, tasks.
- **B2 — финансы:** expenses, sales, salaries, debts, feed, coal.
- **B3 — справочники:** medicines, notes.
- **C — админ:** `AdminDashboardPage`, `AdminCreateClientPage`,
  `AdminClientDetailPage` под `TelegramAdminApp`.

## Открытые вопросы (не блокируют реализацию оболочки, нужны к деплою)

1. **Боевой проект Supabase.** В организации два проекта «Broiler app», оба
   сейчас `INACTIVE`. Нужен ref того, на который смотрит `VITE_SUPABASE_URL`
   в `.env.local` (не в гите) — туда применяются миграция и функция.
2. **Токен бота.** Существующий бот или новый через BotFather; после
   создания — `supabase secrets set TELEGRAM_BOT_TOKEN=…` и указание
   Mini App URL (домен Vercel) в настройках бота.
3. **Домен Vercel** для `Access-Control-Allow-Origin` в `_shared/cors.ts`.
