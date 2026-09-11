# Telegram Mini App — B3: справочники (лекарства, заметки)

Дата: 2026-09-11

## Проблема

Маршруты `/medicines` и `/notes` в Telegram Mini App (`src/mobile/TelegramApp.jsx`)
до сих пор рендерят `<MobileStub>` — заглушку "экран появится в следующем
обновлении". Это последний оставшийся подпроект из роадмапа Фундамента перед
админ-панелью (C): B1 (ежедневный цикл) и B2 (финансы) уже реализованы и
влиты.

## Цель

Заменить оба `<MobileStub>` реальными экранами, достигающими функционального
паритета с десктопными `MedicinesPage` (учёт лекарств: покупка/долг/оплата +
каталог) и `NotesPage` (текстовые и голосовые заметки), кроме явно
вынесенного за рамки пункта ниже.

## Вне рамок

(Изначально запись голосовых заметок на мобилке была вынесена сюда как
отдельный подпроект — см. правку ниже: пересмотрено в тот же день, после
того как выяснилось, что `useVoiceRecording` уже сам грациозно деградирует
при отсутствии поддержки, так что риск включить её сразу оказался ниже, чем
казалось изначально. Актуальное решение — в таблице «Принятые решения».)
- Раздел C (админ-панель под `TelegramAdminApp`) — отдельный подпроект.
- Изменения RPC/схемы/бизнес-логики — не делаются; используются те же
  таблицы и то же поведение, что на десктопе.
- Десктопные `MedicinesPage.jsx` / `NotesPage.jsx` / `MedicineCatalog.jsx` не
  трогаются.
- Полный паритет UI не преследуется там, где он не подходит для мобилки (см.
  «Принятые решения») — упрощения делаются по образцу уже реализованных B2
  экранов (`MobileCoalPage`, `MobileFeedPage`).

## Принятые решения

| Вопрос | Решение |
|---|---|
| Голосовые заметки на мобилке | **Пересмотрено после первого прохода B3.** Изначально — только воспроизведение, без записи, из опасения за поведение `MediaRecorder`/`getUserMedia` в Telegram WebView. Но `useVoiceRecording` уже сам проверяет `isSupported` (наличие `navigator.mediaDevices.getUserMedia` + `window.MediaRecorder`) и не даёт приложению упасть, если API недоступен — ровно так же, как на десктопе (`NotesPage.jsx` прячет кнопку записи при `!isSupported`). Раз деградация уже безопасна, кнопка записи включена и на мобилке: `MobileNotesPage` использует тот же хук без изменений, тот же base64-в-БД путь сохранения, тот же UX (таймер записи → предпросмотр → Сохранить/Отменить). Если реальный Telegram WebView не поддерживает API — кнопка просто не появится, ничего не сломается. |
| Структура `MobileMedicinesPage` | Один экран с 4 вкладками (`purchase`/`debt`/`payment`/`catalog`), как на десктопе и как `MobileCoalPage` устроен для угля — а не отдельные роуты под каждую вкладку. |
| Разбивка баланса по лекарствам (`perMedicineSummary` на десктопе) | Не переносится — на мобилке только агрегированная сводка (`StatGrid` из 4 карточек), как у `MobileCoalPage`/`MobileFeedPage`. Разбивка по лекарствам видна из истории операций (у каждой карточки уже есть название лекарства). |
| Фильтр по фирме (`filterCompany`/`datalist` на десктопе) | Не переносится — поле «Фирма» на мобилке простой текстовый инпут без автодополнения, как `company` в `MobileFeedPage`. |
| Каталог лекарств (`MedicineCatalog.jsx`) | Не переиспользуется как есть (Tailwind-палитра десктопа, не `tg-*`) — переписывается как вкладка `catalog` внутри `MobileMedicinesPage` с теми же мобильными примитивами (`Card`, `FormField`), с загрузкой картинки в тот же бакет `medicine_images`. |
| Удаление лекарства из каталога и удаление транзакции используют один `ConfirmSheet` | Да — через единый `confirmTarget` state `{ type: 'txn' \| 'medicine', id, imageUrl? }`, чтобы не дублировать компонент. |
| `useTelegramMainButton` | Не используется в `MobileMedicinesPage` — экран построен на вкладках с постоянно видимой формой (как `MobileCoalPage`), а не на открывающемся `BottomSheet`, поэтому нативная кнопка не нужна (совпадает с тем, как `MobileCoalPage` уже устроен). `MobileNotesPage` тоже не использует — форма всегда на экране. |

## Архитектура

```
src/mobile/
  pages/
    MobileMedicinesPage.jsx    # NEW — /medicines
    MobileNotesPage.jsx        # NEW — /notes
  TelegramApp.jsx              # MODIFIED — 2 route lines: MobileStub → реальные страницы
```

Переиспользуется без изменений: `src/mobile/components/{Card,ConfirmSheet,
FormField,StatGrid,Tabs,EmptyState,Spinner}.jsx`, `src/supabaseClient.js`,
Supabase Storage бакет `medicine_images` (уже используется десктопом). Не
переиспользуется `useVoiceRecording` (см. «Вне рамок»). Титры (`TITLES` в
`TelegramLayout.jsx`) и пункты меню (`MoreSheet.jsx`, группа «Справочники»)
уже существуют — правок не требуют.

## MobileMedicinesPage

### Данные

```js
supabase.from('medicine_transactions')
  .select('*, medicine:medicines(name)')
  .order('transaction_date', { ascending: false })
  .order('created_at', { ascending: false })
// { id, transaction_date, transaction_type: 'purchase'|'debt'|'payment',
//   medicine_id, quantity, unit, price_per_unit, amount, description,
//   company, batch_id, is_hidden, created_at, medicine: { name } }

supabase.from('medicines').select('*').order('name')
// { id, name, description, image_url, user_id }

supabase.from('broiler_batches').select('id, batch_name')
  .eq('is_active', true).or('is_summary.eq.false,is_summary.is.null')
```

### Поведение

- `StatGrid` (4 карточки): Куплено / В долг / Оплачено / Остаток долга
  (`total_debt - total_paid`), из **видимых** (не скрытых) записей.
- `Tabs`: 📦 Покупка / 📋 В долг / 💰 Оплата / 📚 Каталог.
- Вкладки `purchase`/`debt`: общая форма (как `renderPurchaseDebtFields` на
  десктопе) — дата, лекарство (`<select>` по `medicines`), количество,
  единица измерения (`<select>` из `UNIT_OPTIONS`), цена за ед., описание,
  фирма (текст), партия (опционально). Живой предпросчёт "Итого = кол-во ×
  цена". Кнопка синего (`purchase`) или оранжевого (`debt`) цвета.
- Вкладка `payment`: дата, лекарство (или «Общая оплата» — `medicine_id:
  null`), сумма, описание (по умолчанию «Оплата за лекарства» при пустом
  поле). Зелёная кнопка.
- Чекбокс «Показать скрытые позиции» — фильтрует историю (не показывается
  на вкладке `catalog`, там его нет по смыслу).
- История операций (вкладки purchase/debt/payment): список `Card`, у
  каждой — цветной бейдж типа, дата, название лекарства, количество/цена,
  описание, сумма со знаком (`+`/`−`), кнопки 👁️/🙈 (скрыть) и 🗑 (удалить
  с подтверждением через `ConfirmSheet`, сообщение "Это повлияет на общий
  баланс.").
- Вкладка `catalog`: форма добавления (название *, описание, картинка —
  `<input type="file" accept="image/*">`, загружается в Storage bucket
  `medicine_images`, `getPublicUrl` сохраняется в `image_url`), затем
  список карточек лекарств (превью-картинка 64×64 или эмодзи-заглушка 💊,
  название, описание, кнопка 🗑 удалить — подтверждение через тот же
  `ConfirmSheet`, при подтверждении также удаляет файл из Storage, если он
  был).
- Каждый write-путь — стандартный паттерн Global Constraints (`getUser()` →
  null-check → мутация → `fetchData()`).

## MobileNotesPage

### Данные

```js
supabase.from('notes').select('*').order('created_at', { ascending: false })
// { id, content, user_id, type: 'text'|'voice', audio_url, created_at }
```

### Поведение

- Форма: `<textarea>` + кнопка «💾 Сохранить» (disabled, если пусто или уже
  сохраняется). Insert `{ content, user_id, type: 'text' }`. Под формой —
  подсказка, что голосовые заметки пока пишутся только в веб-версии.
- Список заметок (`Card` на каждую, новые сверху): текст (с префиксом 🎤
  для `type==='voice'`), `<audio controls>` если есть `audio_url`
  (работает и для base64 data URI, и для Storage URL — `<audio>` не
  различает), дата создания (`toLocaleString('ru-RU')`), кнопка 🗑 удалить.
- Удаление — `ConfirmSheet`; если `audio_url` начинается с `http` (вариант
  Storage, не base64), сначала удаляется файл из бакета `voice-notes`,
  затем строка из `notes` — тот же порядок, что в `handleDeleteNote` на
  десктопе.
- Пустое состояние — `EmptyState` иконка 📝.

## Тестирование

- `npx eslint src` — без новых ошибок (существующий baseline errors/warnings
  не расширяется).
- `npm run build` — успешная сборка.
- Ручная проверка через Browser pane с `?tg_debug=1&tg_linked=1`: обе
  вкладки открываются, формы рендерятся, `EmptyState` показывается на
  пустых данных (в подключённом Supabase-проекте лекарств/заметок может не
  быть — тот же нюанс, что был отмечен в B1/B2).

## Файлы

- **Новые:** `src/mobile/pages/MobileMedicinesPage.jsx`,
  `src/mobile/pages/MobileNotesPage.jsx`.
- **Изменяются:** `src/mobile/TelegramApp.jsx` (2 роута:
  `MobileStub` → реальные страницы + 2 импорта).
- **Не трогаются:** `TelegramLayout.jsx`, `MoreSheet.jsx` (титры и пункты
  меню уже существуют), `src/pages/**`, `src/components/MedicineCatalog.jsx`,
  `src/hooks/useVoiceRecording.js`, `src/utils/**`, `src/constants/**`,
  RPC/схема БД.

## Roadmap

После B3 — только раздел **C** (админ-панель под `TelegramAdminApp`)
остаётся из роадмапа Фундамента.
