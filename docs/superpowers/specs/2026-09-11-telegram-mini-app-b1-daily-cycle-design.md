# Telegram Mini App — B1: ежедневный цикл (журнал партии, отчёт, цеха, задачи)

Дата: 2026-09-11

## Проблема

Фундамент мобильного интерфейса (`docs/superpowers/specs/2026-09-10-telegram-mini-app-foundation-design.md`)
дал рабочую оболочку — авторизацию, навигацию, тему — и два реальных экрана
(«Партии», «Дневной ввод»). Всё остальное в мобильной версии сейчас —
`<MobileStub>`. Самые нужные из оставшихся разделов для повседневной работы
на ферме — «ежедневный цикл»: журнал конкретной партии, её финансовый
отчёт, учёт по цехам и задачи. Это подпроект B1 по роадмапу Фундамента.

## Цель

Реализовать 4 мобильных экрана с полным функциональным паритетом
десктопных `BatchLogPage`, `BatchReportPage`, `WorkshopsPage`, `TasksPage`,
на примитивах и паттернах Фундамента (карточки, `BottomSheet`, нативные
Back/MainButton), заменив `<MobileStub>` на маршрутах `/batch/:batchId`,
`/batch/:batchId/report`, `/workshops`, `/tasks`.

## Вне рамок

- **B2** (расходы, продажи, зарплаты, долги, корм, уголь) и **B3**
  (лекарства, заметки) — отдельные подпроекты, не в этой итерации.
- **C** (3 админских экрана) — тоже отдельно.
- Изменение логики самих RPC (`generate_batch_report`,
  `get_active_summary_report`, `get_expenses_by_batch` и т.д.),
  `normComparison.js`, `broilerStandards.js`, `useTasks.js`, `useBatchData.js`
  — переиспользуются как есть.
- Исправление существующих десктопных страниц — не трогаем
  `src/pages/BatchLogPage.jsx` и остальные три.

## Принятые решения

| Вопрос | Решение |
|---|---|
| Объём «Журнала партии» | Полный паритет: вкладки (журнал/расходы/продажи/корм/зарплаты) + дашборд норма/факт (включая график recharts) + историческое сравнение падежа + редактируемые записи |
| Сводная таблица «все цеха» (`AllWorkshopsSummary`) | На мобильном — карточки-сводки без выбора цеха (как список партий), а не широкая таблица со скроллом |
| `syncSummaryBatchLog` при редактировании/удалении записи журнала | Вызывается (десктопный `JournalTable` этого не делает — расхождение с инвариантом CLAUDE.md; в мобильной версии не переносим этот пробел) |
| Фильтры задач | `BottomSheet` вместо 4 select-ов в ряд |
| Форма/редактирование цеха и задачи | `BottomSheet`-формы поверх примитивов Фундамента |
| Детализация цеха (`WorkshopDailyTable`) | Список карточек по дням вместо широкой таблицы |

## Архитектура

```
src/mobile/
  pages/
    MobileBatchLogPage.jsx        # /batch/:batchId
    MobileBatchReportPage.jsx     # /batch/:batchId/report
    MobileWorkshopsPage.jsx       # /workshops
    MobileTasksPage.jsx           # /tasks
    workshops/
      MobileWorkshopDetailPage.jsx  # /workshops/:workshopId — отдельный маршрут, см. §Цеха
  components/
    NormBadge.jsx        # компактный аналог NormIndicator для мобильных карточек
    WeightChart.jsx       # обёртка над recharts LineChart (перенос DashboardNormFact-графика)
    Tabs.jsx              # горизонтальные вкладки-чипы (журнал/расходы/…, статусы задач)
    ConfirmSheet.jsx      # BottomSheet-подтверждение (удаление записи/цеха/задачи) — замена window.confirm
```

`TelegramApp.jsx`: 4 существующих маршрута-стаба (`/batch/:batchId`,
`/batch/:batchId/report`, `/workshops`, `/tasks`) меняются с
`<MobileStub title=…/>` на реальные компоненты, плюс добавляется один
новый маршрут `/workshops/:workshopId`; остальное дерево (Routes,
TelegramLayout, auth gate) не трогается.

Переиспользуется без изменений: `src/utils/normComparison.js`
(`compareWithNorm`, `calcMortality`, `forecastWeight`,
`calcHistoricalMortality`, `buildWeightSeries`), `src/constants/broilerStandards.js`
(`getNormForDay`, `getWeekMortalityNorm`, `FEED_BAG_WEIGHT_G`),
`src/hooks/useTasks.js` (`useTasks`, `useEmployees`), `src/hooks/useBatchData.js`
(`useWorkshops`), `src/utils/summaryBatchSync.js` (`syncSummaryBatchLog`),
Foundation-примитивы (`Card`, `ListRow`, `SectionHeader`, `StatusPill`,
`EmptyState`, `Spinner`, `SegmentedControl`, `FormField`, `NumberStepper`,
`BottomSheet`), Telegram-хуки (`useTelegramMainButton`,
`useTelegramBackButton`, `useTelegramHaptics`). `recharts` уже в зависимостях
проекта (`DashboardNormFact.jsx`) — новых пакетов не добавляем.

## Журнал партии (`MobileBatchLogPage`)

### Данные

Один запрос при загрузке, зеркалящий `BatchLogPage.fetchAllBatchData`:
`Promise.all` из `broiler_batches` (по `batchId`), `daily_logs` (с join
`medicine:medicines(name)`, `order by log_date desc`), `medicines`,
RPC `get_expenses_by_batch`/`get_sales_by_batch`/`get_feed_by_batch`/`get_salaries_by_batch`
(`{batch_uuid: batchId}`), плюс отдельный запрос других партий
(`broiler_batches` где `id != batchId`) и их `daily_logs` (`age, mortality`)
для исторического сравнения — тот же набор вызовов, что на десктопе, один
к одному.

### Раскладка (сверху вниз)

1. Заголовок: название партии + `StatusPill` (активна/завершена), базовые
   цифры (начало, начальное поголовье, общий падёж, текущее поголовье) —
   `ListRow`-стопка в `Card`.
2. **Дашборд норма/факт** — вместо грида 4 карточки в ряд (десктоп)
   на мобильном это вертикальный стек `Card`: масса, падёж
   (накопительный, со статусом), вода/гол, корм/гол — каждая со своим
   `StatusPill` и текстом отклонения, как в `DashboardNormFact`, но без
   `sm:grid-cols-2 lg:grid-cols-4`.
3. **График массы** (`WeightChart`) — `recharts` `LineChart` (норма/факт/
   прогноз), высота ~220px, `ResponsiveContainer`, легенда компактнее
   (иконки без подписи или подпись под графиком). Данные — те же
   `forecastWeight(logs, 42)` + `buildWeightSeries(logs, 42)`.
4. **Падёж vs предыдущие партии** — таблица `calcHistoricalMortality`
   превращается в список `ListRow` (партия — поголовье/падёж/%).
5. **Вкладки** (`Tabs`): Журнал · Расходы · Продажи · Корм · Зарплаты —
   счётчик рядом с названием, как в десктопных `TabButton`.
6. **Журнал** (если активна): форма добавления записи (только когда
   `batch.is_active`) — `NumberStepper` на падёж ест./хал., масса, вода,
   корм; `NormBadge` под каждым полем (аналог `NormIndicator`, использует
   тот же `compareWithNorm`); дата — `input[type=date]` (Telegram
   WebView поддерживает нативный пикер); лекарство — `select` в
   `FormField`; сохранение через `useTelegramMainButton` («Добавить»).
   Критические отклонения (`compareWithNorm(...).status === 'critical'`)
   → `ConfirmSheet` с текстом «Обнаружены критические отклонения от
   нормы ROSS-308. Сохранить всё равно?» перед отправкой (десктоп
   использует `window.confirm` — `ConfirmSheet` даёт консистентный вид
   с остальным UI; `window.confirm` остаётся фолбэком, не блокирует).
   Список записей — карточки (не таблица): дата, возраст, падёж
   (ест/хал), масса, вода (+ мл/гол), корм (+ г/гол), лекарство/доза;
   для активной партии — кнопки «Изменить» (открывает `BottomSheet` с
   той же формой, предзаполненной) и «Удалить» (`ConfirmSheet`).
7. **Расходы/Продажи/Корм/Зарплаты** — простые списки `ListRow` (дата +
   описание/покупатель/тип + сумма/количество), без редактирования (эти
   вкладки и на десктопе только для чтения внутри журнала партии —
   создание расходов/продаж живёт на своих страницах, это B2).

### Запись/правка/удаление — домен-инвариант

- **Добавление** (`handleSubmit` в десктопной терминологии): `insert` в
  `daily_logs` с теми же полями, что десктоп; после успеха —
  `if (!batch.is_summary) await syncSummaryBatchLog(logDate, user.id)`.
- **Редактирование** (аналог `JournalTable.handleUpdate`): `update` по
  `id` записи с пересчитанным `age` и `mortality = natural + halal`;
  **после успеха — `if (!batch.is_summary) await syncSummaryBatchLog(log.log_date, user.id)`**
  (десктоп этого не делает — сознательное расширение по инварианту
  CLAUDE.md, см. таблицу решений).
- **Удаление** (аналог `handleDelete`): `delete` по `id`; **после успеха —
  тот же вызов `syncSummaryBatchLog`** с датой удалённой записи.
- Проверить: `mortality` всегда равен `mortality_natural + mortality_halal`
  на обеих операциях (как в `add-norm-metric`/CLAUDE.md).

## Отчёт партии (`MobileBatchReportPage`)

Прямой перенос `BatchReportPage`: один RPC-вызов (`get_active_summary_report`
для сводной партии, иначе `generate_batch_report({p_batch_id: batchId})`),
рендер как стек `Card`: доходы (сумма продаж), расходы (для сводной —
разбивка корм/лекарства/уголь + расходы + зарплаты; для обычной — расходы
+ зарплаты), итог (для сводной — «Итого затрат» + прибыль; для обычной —
только прибыль). `formatCurrency` — тот же `Intl.NumberFormat('ru-RU',
{style:'currency', currency:'TJS'})`. Состояния загрузка/ошибка/нет данных
как в оригинале. Самый низкий риск экран B1 — read-only, без записи.

## Цеха (`MobileWorkshopsPage` + `MobileWorkshopDetailPage`)

- Список карточек цехов через `useWorkshops()` (Card: название,
  вместимость, описание, активная партия + последняя запись — те же поля,
  что `WorkshopCard`, но без хардкод-инлайн-стилей, на Foundation-примитивах).
  Кнопки «✏️» / «🗑» на карточке (редактирование через `BottomSheet`-форма
  с полями название/вместимость/описание; удаление — `ConfirmSheet` с
  текстом десктопной версии про деактивацию).
- Тап по карточке (не по кнопкам) → переход на отдельный маршрут
  `/workshops/:workshopId` (`MobileWorkshopDetailPage`), а не раскрытие
  состояния на том же маршруте. Так BackButton работает без единой
  правки в `useTelegramBackButton.js`/`TelegramLayout.jsx`: `/workshops`
  и `/workshops/:workshopId` оба не входят в `ROOTS` (`{'/', '/daily-entry', '/tasks'}`),
  поэтому Фундамент уже показывает нативный BackButton на обоих и вызывает
  `navigate(-1)` — переход с деталей цеха назад в список работает через
  обычную историю `react-router`, ровно как уже работает `/batch/:batchId`
  → `/` в Фундаменте. Новый маршрут добавляется в `TelegramApp.jsx` рядом
  с остальными (было 4 строки-стаба, реальными становятся 5: `/workshops`,
  `/workshops/:workshopId`, `/tasks`, `/batch/:batchId`, `/batch/:batchId/report`).
- Детализация цеха: карточки по дням вместо строк таблицы —
  `WorkshopDailyTable`'s `logs` (дата, возраст, падёж, масса факт/норма,
  корм факт/норма, вода), норма считается тем же `getNormForDay`.
- Когда карточка не раскрыта — под списком карточек показываем компактную
  версию `AllWorkshopsSummary` как список `Card` (не таблица): по одной
  карточке на цех с полями Партия / День / Поголовье / Пало сегодня /
  Масса факт-норма / Корм факт-норма, плюс строка «ИТОГО» снизу.

## Задачи (`MobileTasksPage`)

- Лента счётчиков (Открытые/В работе/Выполнены/Просрочены) — горизонтальный
  скролл `StatusPill`-подобных чипов вместо грида.
- Фильтры (статус/приоритет/исполнитель/цех) — кнопка «Фильтры» открывает
  `BottomSheet` с теми же 4 select (или `SegmentedControl`, если у поля ≤3
  осмысленных значений — статус и приоритет подходят), плюс «Сбросить».
  Активные фильтры — счётчик на кнопке «Фильтры (2)».
- Список задач — карточки (`Card`, не div со style-объектами): приоритет
  цветной полосой слева (как `PRIORITY_COLOR`), заголовок, описание,
  исполнитель/цех/срок/создал/выполнено, просрочена — красная рамка +
  бейдж. Кнопки смены статуса (тот же `STATUS_NEXT`/`STATUS_BTN` цикл
  open→in_progress→done→open) и удаления (`ConfirmSheet`).
- Создание/редактирование — `BottomSheet`-форма (`TaskForm`'s поля:
  title, description, assignee_id, workshop_id, priority, due_date,
  created_by), сохранение через `useTelegramMainButton`.
- `useTasks(filters)` переиспускается без изменений; создание/обновление/
  удаление идут через его `createTask`/`updateTask`/`deleteTask` — задачи
  не пишут `daily_logs`, домен-инвариант не касается этого экрана.

## Тестирование

Как в Фундаменте: `npm run lint`/`npm run build` (лint должен остаться на
базовом уровне 20/8/12), `?tg_debug=1` в Browser pane для состояний
загрузки/пустого/ошибки на каждом экране; там, где нужны реальные данные
(запись в журнал, редактирование/удаление, создание цеха/задачи) —
верификация через реальный логин на `LinkingScreen` при наличии кредов,
иначе фолбэк на нединамические состояния + пометка для ручной матрицы
(аналог Task 8/9 Фундамента). Домен-инвариант (`syncSummaryBatchLog` на
add/edit/delete) проверяется явным вычитыванием кода в ревью плюс, при
наличии реальных данных, сверкой сводной партии в десктопной версии до/после.

## Файлы

**Новые:** все файлы из §Архитектура — 4 страницы верхнего уровня +
`workshops/MobileWorkshopDetailPage.jsx` + 4 общих компонента
(`NormBadge`, `WeightChart`, `Tabs`, `ConfirmSheet`).

**Изменяются:** `src/mobile/TelegramApp.jsx` (4 маршрута меняют компонент,
1 маршрут добавляется).

**Не трогаются:** все десктопные страницы и компоненты, все RPC/БД, `normComparison.js`,
`broilerStandards.js`, `useTasks.js`, `useBatchData.js`, `summaryBatchSync.js`,
весь остальной Foundation-код кроме перечисленных строк маршрутов.

## Roadmap

После B1 остаются: **B2** (расходы, продажи, зарплаты, долги, корм, уголь),
**B3** (лекарства, заметки), **C** (3 админских экрана) — каждый своим
циклом спека → план → реализация.
