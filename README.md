# SwipeMark — разгреби свои сохранёнки

> Отправляй ссылки в Telegram, а SwipeMark поможет быстро разобрать их с помощью свайпов и AI. Работает как Telegram Mini App, PWA и обычный сайт. UI на русском.

---

## Позиционирование

**Кто первый пользователь.** Человек 20–40 лет, который постоянно сохраняет ссылки, видео и сообщения в Telegram и накопил сотни неразобранных сохранений.

**Его проблема.** «Я сохраняю всё, потому что сейчас нет времени посмотреть. Потом у меня 500 сохранений, и я уже ничего не нахожу.»

**Обещание.** SwipeMark превращает накопившиеся сохранения в понятную библиотеку за несколько минут.

**Механика — это продукт:** *сохранить → понять → решить*.

Каждый день в мессенджеры и чаты падают ссылки, фото и видео: «посмотреть потом», «сохранить на всякий случай», «это надо прочитать». Со временем это превращается в хаос:

- избранное в Telegram не структурировано — там перемешаны рабочие ссылки, развлечение и покупки;
- «сохранёнки» никто не перечитывает: вернуться к ним неудобно, а разгребать — лень;
- при попытке навести порядок человек бросает: сортировка по папкам вручную — это монотонная работа.

**SwipeMark решает эту задачу так:**

1. **Сохраняй одним сообщением.** Отправь боту ссылку/фото/видео/пересылку — бот сам создаст карточку: вытащит заголовок, превью, длительность видео, описание, источник (YouTube, Instagram, TikTok, Twitter, Telegram и т.д.).
2. **Разбирай свайпами.** Закладки лежат колодой карточек: свайп вправо — «потом», свайп влево — «в архив», свайп вверх — «открыть». Над колодой — прогресс разбора. Быстро, в фоне, без открывания каждой ссылки.
3. **Сортируй автоматически.** ИИ сам предлагает папку и теги для каждой карточки — остаётся нажать «принять». Для всего скопленного сразу есть «Разложить с AI» с прогресс-баром и отменой.
4. **Находи нужное.** «Мои сохранёнки» с поиском, папками, тегами, фильтрами и группировкой по датам. Читай «Кратко», не открывая страницу.

Масштаб — личный инструмент / первые пользователи, но архитектура готова к большему: всё скоупировано по `user_id`, RLS включён на уровне базы, ключ ИИ хранится шифрованно.

---

## Возможности

### Сохранение (Telegram-бот)
- Приём ссылок, фото, видео, документов и пересылок через `/api/webhook`.
- Альбомы (`media_group_id`) сливаются в одну карточку; пересылки сохраняют источник и `source_url` (`t.me/<user>/<id>` или `t.me/c/<id>/<id>`).
- Авто-название из первого осмысленного текста / подписи / типа («Фото», «Видео», «Ссылка»), до 120 символов.
- Заголовки ссылок обогащаются мета-информацией (og-теги): реальное название вместо транслитерации URL.

### Свайп-колода («Разобрать»)
- Карточки: превью, заголовок, источник, бейджи времени (`⏱ mm:ss` для видео, `📖 ~N мин` для чтения), «Кратко», AI-чипы (папка 🏷 и теги).
- Свайпы: **влево** — в архив, **вправо** — «потом» (карточка уходит из колоды в таб «Потом»), **вверх** — открыть.
- Прогресс разбора: «РАЗОБРАНО N ИЗ M» + «M−N осталось» (при последней — «Последняя!») и полоска прогресса над колодой.
- Подсказки жестов вокруг первой карточки (`← Архив` `Потом →` `↑ Открыть`) — исчезают после первого свайпа; на первых трёх свайпах под кнопками видны подписи (progressive disclosure).
- Экран завершения: итоги сессии («✨ Оставил / 🕐 Позже / 🗄 В архив» с корректными окончаниями) и кнопка «Посмотреть, что я оставил →».
- Undo-тост 4 сек после свайпа — случайное действие можно отменить; скрывается при завершении колоды.
- Персональная колода для папки («Разобрать эту папку»).
- Immersive-режим: после первого свайпа навигация прячется, появляется триггер `⋯`.
- Полный экран в Telegram (один тумблер в настройках).
- Онбординг при первом входе: «Разгреби свои сохранёнки», 3 карточки и кнопка «Начать разбор» (флаг `user_settings.onboarded`).

### Сохранёнки
- Поиск, папки (CRUD + счётчики), теги (автокомплит, топ-50), фильтры.
- Табы «Разобрать / Потом» со счётчиками, группировка по датам (Сегодня/Неделя/Раньше); архив — через фильтры.
- Массовый режим (long-press → чекбоксы): в папку, тег, архив, в колоду, ИИ-распределение, удаление.
- Архив с TTL-очисткой (24ч/7д/30д/выкл) и возвратом в колоду — настройки в `⋯`.

### AI (BYOK — свой ключ)
- Хранение ключа шифрованно (AES-256-GCM, `AI_KEY_SECRET`), маскирование, тест подключения, список моделей.
- Провайдеры: OpenRouter, Mistral, OpenAI, любой OpenAI-совместимый (в т.ч. локальный Ollama через custom base URL).
- **Распределение**: ИИ предлагает папку/теги (чип `AI: <папка> [✓][✎]`), режим off/suggest/auto.
- **Разложить с AI**: бэкенд-задача (`bulk_jobs`), чанки по 5 карточек, прогресс-бар, отмена, отчёт «распределено X / не удалось Y».
- **Кратко** по запросу (кнопка `✨ Кратко` → 2–3 предложения). BYOK-настройки свёрнуты в карточку «✨ AI-помощник», разворачиваются по тапу.

### Надёжность (Фаза R)
- Медиа-кэш в Supabase Storage: фото/превью скачиваются один раз и отдаются по `storage_url` (не нужен бот-токен на клиенте).
- Парсеры мета-информации: YouTube (oEmbed + JSON-фолбэк), Instagram, TikTok, Twitter, Telegram, generic. Кэш `meta_cache` (7 дней).
- Статусы метаданных: `pending → processing → done/failed`; при сбое — кнопки «Повторить» и «Открыть».
- Падение парсинга никогда не роняет карточку: при ошибке остаётся заглушка.

### UI-полировка
- Масштаб текста S/M/L (дизайн-токены `--fs-*`, переживают перезагрузку).
- Десктоп: широкая колонна, центрированная ограниченная колода, библиотека в 2–3 колонки.
- **PWA**: манифест, иконки (192/512/maskable), офлайн-оболочка (service worker: network-first для навигации с фолбэком на офлайн-страницу, кэш статики, API не кэшируется).

---

## Стек

| Слой | Технологии |
|---|---|
| Фронтенд | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, framer-motion, lucide-react, qrcode.react |
| Бэкенд | Next.js API routes (`runtime = "nodejs"`), zod (валидация) |
| Данные | Supabase (Postgres) — service_role только на сервере, RLS как второй эшелон |
| Бот | Telegram Bot API (webhook), HMAC-валидация initData, HTTP-only cookie-сессия |
| ИИ | OpenAI-совместимые API: OpenRouter / Mistral / OpenAI / custom (BYOK) |
| Legacy | Firebase (Firestore) — только для одноразовой миграции (`scripts/migrate-firestore.ts`) |

### Архитектура

```text
PWA / Telegram Mini App
        │ (cookie session, HMAC initData)
        ▼
Next.js API routes (node runtime) — /api/*
        │ service_role, только сервер
        ▼
Supabase PostgreSQL (RLS включён)
        ▲
Telegram webhook → /api/webhook → cards / attachments / card_links
AI BYOK → /lib/ai adapter → OpenAI-compatible endpoints
```

**Правила:**
1. Клиент не ходит в БД напрямую — только через `/api/*`.
2. Все запросы скоупированы по `user_id` сессии.
3. Секреты — только в env; ключи в логах маскируются.
4. RLS включён везде (защита от прямого anon-доступа).

### Поток данных

1. Пользователь шлёт боту ссылку/фото/видео/пересылку → `/api/webhook` → профиль по `telegram_id` → карточка в Supabase. Медиа → `attachments`, URL → `card_links`. Фоново (`after()`): обогащение мета-информации, кэш медиа, ИИ-предложение папки.
2. Mini App тянет `GET /api/bookmarks` (пользователь из cookie) и рисует колоду. Свайпы пишутся в `POST /api/actions` с идемпотентным ключом.
3. `/api/auth` валидирует Telegram `initData` (HMAC-SHA256) и ставит HTTP-only cookie с uuid профиля.

---

## Запуск

### Требования
- Node.js 20+
- Проект Supabase (схема из миграций)
- Telegram-бот (токен у @BotFather)

### Установка

```bash
npm install
```

### Переменные окружения (`.env.local`, в git не коммитятся)

```env
TELEGRAM_BOT_TOKEN=            # токен бота (webhook + HMAC-подпись сессии)
BOT_USERNAME=                  # имя бота без @, для deep-link привязки
NEXT_PUBLIC_BOT_USERNAME=      # то же для клиента (QR/deep link)
SUPABASE_URL=                  # URL Supabase-проекта
SUPABASE_SERVICE_ROLE_KEY=     # серверный ключ (никогда не отдавать клиенту)
SUPABASE_ANON_KEY=             # только для проверки Bearer-токенов на сервере
AI_KEY_SECRET=                 # секрет для шифрования AI-ключей (32 байта hex)
OWNER_TELEGRAM_ID=             # ваш Telegram ID — доступ к блоку «Диагностика»
# только для миграции с Firebase:
FIREBASE_SERVICE_ACCOUNT_KEY=  # JSON строка сервисного аккаунта
```

### База данных

DDL не проходит через PostgREST — миграции применяются **вручную** в Supabase SQL Editor:

```bash
supabase/migrations/0001_reliability.sql   # meta_status, meta_cache, storage_url
supabase/migrations/0002_ui_phase.sql      # ui_scale + bulk_jobs
supabase/migrations/0003_onboarding.sql    # user_settings.onboarded
```

### Dev-сервер

```bash
npm run dev
```

Открой `http://localhost:3000` в браузере (фолбэк-страница без Telegram) или открой бота в Telegram и запусти Mini App.

---

## Тесты

```bash
# все юнит-тесты (77 зелёных)
npx tsx --test scripts/test-*.ts

# отдельные наборы
npm run test:mappers   # маппинг card → Bookmark (14)
npm run test:crypto    # шифрование AI-ключей (5)
npx tsx --test scripts/test-enrich.ts        # парсинг AI-ответа (9)
npx tsx --test scripts/test-pairing.ts       # генерация кодов привязки (4)
npx tsx --test scripts/test-preview.ts       # нормализация URL (6)
npx tsx --test scripts/test-parsers.ts       # parseMetaTags по фикстурам (8)
npx tsx --test scripts/test-meta-parsers.ts  # парсеры с моком fetch, без сети (20)
npx tsx --test scripts/test-format.ts        # формат-хелперы (6)

# typecheck и lint
npx tsc --noEmit
npm run lint
```

---

## Структура проекта

```text
src/
  app/
    page.tsx                 # Mini App: колода, табы, настройки, онбординг
    layout.tsx               # корневой layout: TelegramProvider, metadata, RegisterSW
    manifest.ts              # PWA-манифест (/manifest.webmanifest)
    offline/                 # (удалён — заменён статической оболочкой)
    api/                     # все роуты (nodejs runtime)
      auth/ webhook/ actions/ counts/ library/ bookmarks/ deck/ file/ tags/
      folders/ settings/ pairing/ cards/ (…bulk, bulk-ai/[jobId]/cancel,
      [id]/ai-accept|ai-dismiss|folders|refetch|summary|tags)
  components/                # TelegramProvider, SwipeDeck, BookmarkCard, Library,
                             # AddModal, AiSettings, PairingSettings, UiScaleSettings,
                             # FullscreenSettings, DiagnosticsSettings, SourceBadge, RegisterSW
  lib/
    db/                      # репозитории — ЕДИНСТВЕННОЕ место с Supabase-запросами
      supabase.ts types.ts mappers.ts cards.ts settings.ts swipes.ts
      folders.ts tags.ts pairing.ts meta.ts media.ts jobs.ts profiles.ts
    ai/                      # adapter.ts (chat-completions), enrich.ts (распределение, саммари)
    meta/                    # cache.ts, enrich.ts, parsers/ (youtube, instagram, tiktok,
                             # twitter, telegram, generic, shared, index)
    crypto.ts                # AES-256-GCM шифрование AI-ключей
    session.ts               # HTTP-only cookie-сессия
    telegram-file.ts         # загрузка файлов из Telegram
    format.ts                # fmtDuration / fmtReadMinutes / fmtDateShort / groupByPeriod
    openTarget.ts            # выбор цели «Открыть» для карточки
public/
  sw.js                      # service worker (офлайн-оболочка)
  offline.html               # статическая офлайн-страница
  icons/                     # PWA-иконки (192/512/maskable)
scripts/                     # миграция с Firebase + все тесты
supabase/migrations/         # SQL-миграции (применяются вручную)
```

---

## Основные API

| Роут | Метод | Назначение |
|---|---|---|
| `/api/auth` | POST | Валидация Telegram initData, установка cookie-сессии |
| `/api/webhook` | POST | Приём сообщений от Telegram-бота (карточки, привязка `/start`, `/unlink`) |
| `/api/bookmarks` | GET | Карточки для колоды/архива (с TTL-очисткой архива) |
| `/api/actions` | POST | Свайпы: left/right/up/undo (идемпотентно) |
| `/api/deck` | GET | Колода (в т.ч. по `folderId`) |
| `/api/library` | GET | Сохранёнки: табы, поиск, папка, теги, сортировка, курсор |
| `/api/cards` | GET/POST | Создание карточек из UI (с дедупом URL) |
| `/api/cards/preview` | POST | Дедуп-превью ссылок перед сохранением |
| `/api/cards/bulk` | POST | Массовые действия: папка/тег/архив/колода/удаление |
| `/api/cards/bulk-ai` | POST | Запуск ИИ-распределения (jobId) |
| `/api/cards/bulk-ai/[jobId]` | GET | Прогресс автосортировки |
| `/api/cards/bulk-ai/[jobId]/cancel` | POST | Отмена автосортировки |
| `/api/cards/[id]/ai-accept` / `ai-dismiss` | POST | Принять/отклонить ИИ-предложение |
| `/api/cards/[id]/summary` | POST | Сгенерировать «Кратко» |
| `/api/cards/[id]/refetch` | POST | Повторный парсинг мета-информации |
| `/api/file` | GET | Медиа: redirect на Storage или прокси фото из Telegram |
| `/api/folders` | GET/POST | Папки |
| `/api/folders/[id]` | PATCH/DELETE | Папка |
| `/api/tags` | GET | Теги (поиск/топ-50) |
| `/api/cards/[id]/tags` | POST | Установка тегов |
| `/api/settings` | GET/POST | Настройки (архив TTL, масштаб текста, онбординг) |
| `/api/settings/ai` | GET/PUT | AI-настройки (провайдер/модель/режим, ключ маскируется) |
| `/api/settings/ai/test` | POST | Тест подключения к AI (5/мин) |
| `/api/settings/ai/models` | GET | Список моделей провайдера |
| `/api/settings/diagnostics` | GET | Сбои парсинга (только владелец) |
| `/api/pairing/generate` | POST | Код привязки Telegram + QR + deep link |
| `/api/pairing/status` | GET | Статус привязки / активный код |
| `/api/pairing/unlink` | POST | Отвязка Telegram |
| `/api/counts` | GET | Счётчики (колода/later/архив/неразобранное) |
| `/api/health` | GET | Health-check |

---

## Деплой

1. Собери проект: `npm run build`.
2. Задеплой на Vercel (или любой Node-хостинг), указав env из `.env.local`.
3. В Supabase: применить миграции в SQL Editor, настроить Auth (site URL, redirect URLs).
4. Установить webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<домен>/api/webhook`.
5. PWA-манифест и иконки уже в проекте — браузер подхватит автоматически.

---

## Статус

- **Этапы 0–6** (миграция, папки, теги, AI BYOK, привязка Telegram, полировка) — готово.
- **Фаза R** (надёжность: медиа-кэш, парсеры, устойчивый UI) — Шаги 0–4 готово, Шаг 5 (ручной прогон пересылок t.me/видео/PDF) — человек-шаг.
- **UI-фаза** (типографика, библиотека, колода, автосортировка, fullscreen/десктоп, PWA) — Шаги 1–5 готово.
- **Продуктовая фаза P0** (по аудиту UX): свайп-семантика (право = позже), навигация «Разобрать · Сохранёнки · Позже», настройки в `⋯`, прогресс и completion screen, онбординг, «Кратко», BYOK в свёрнутую карточку — готово.
- **Фаза P0.5** (по второму аудиту): онбординг через боль, empty-state CTA «Открыть @SwipeMarkBot», убран refresh из шапки, прогресс «РАЗОБРАНО N ИЗ M», подписи кнопок + подсказки жестов, completion (плюрализация, «✨ Оставил», «Посмотреть, что я оставил →»), упрощение Library («Разобрать / Потом», архив в фильтры), AI-чипы на карточке — готово.

Дальше по плану — давать продукт людям (первые пользователи), а не новые фичи.

Техдолг: на проде вернуть реальный `AI_KEY_SECRET`/`BOT_USERNAME`/`TELEGRAM_BOT_TOKEN`; автосортировщик для библиотек >30 карточек (обход лимита и предупреждение о стоимости).