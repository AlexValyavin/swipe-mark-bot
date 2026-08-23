# SwipeMark — Telegram Mini App

Сохранение закладок через Telegram-бота + свайп-колода для разбора бэклога. UI на русском, бэкенд — Next.js API routes + Supabase (Postgres), Firebase осталась только как legacy read-only для миграции.

---

## Что сделано (по этапам ТЗ)

### Этап 0 — Миграция на Supabase
- Вся схема (profiles, user_settings, folders, tags, cards, card_folders, card_tags, attachments, card_links, swipe_actions, pairing_codes), RLS.
- Одноразовая миграция из Firestore: `scripts/migrate-firestore.ts` (идемпотентная, `--dry-run`).

### Этап 1 — Папки
- CRUD папок (`GET/POST /api/folders`, `PATCH/DELETE /api/folders/[id]`), присвоение карточкам, счётчики, удаление папки (карточки в архив/без папки).

### Этап 2 — Теги
- Теги с нормализацией (lower+trim+схлоп пробелов, race-safe 23505), автокомплит, топ-50 по частоте, установка/замена/удаление тегов карточки, чистка осиротевших.

### Этап 3 — AI (BYOK)
- Хранение ключа шифрованно: AES-256-GCM (`enc:v1:<iv>:<tag>:<ct>`), вывод ключа из `AI_KEY_SECRET`, маскирование.
- Единый адаптер chat-completions: openrouter/mistral/openai/custom base URL, таймаут 8с, ошибки `AiError {auth|rate|timeout|network|parse}`.
- Настройки AI (`GET/PUT /api/settings/ai`), тест подключения, загрузка списка моделей, удаление ключа, нормализация custom base URL.

### Этап 4 — AI-распределение
- `src/lib/ai/enrich.ts`: промпт только по существующим папкам, парсинг первого `{...}` из ответа, срез эмодзи-префикса у папок, никогда не роняет карточку.
- Фоновый enrich из webhook через `after()`.
- Роуты: `ai-accept` (folder/tags/all), `ai-dismiss`, `bulk-ai` (unsorted или ≤30 по id).
- Фильтр «Несортированное» в библиотеке, чип `AI: папка [✓][✎]` в Library и бейдж в колоде.

### Этап 5 — Привязка Telegram
- Код из безопасного алфавита (без O/0/I/1, 8 символов), TTL 10 мин, инвалидация старых.
- `/start <код>` и `/unlink` в боте с дружелюбными ответами и scope-проверками.
- UI: QR, копирование, таймер, polling. Роуты generate/status/unlink.

### Этап 6 — Полировка
- `GET /api/counts` (inDeck/readLater/archived/unsorted, считается в коде — RPC в проде нет).
- `POST /api/cards/preview` — дедуп ссылок с нормализацией URL (utm/www/hash/слеш).
- `POST /api/cards` — создание из UI, пропуск дублей, AI в фоне.
- `POST /api/cards/bulk` — массовые действия, атомарно по карточке, отчёт частичных ошибок.
- `GET /api/deck?folderId=` — пер-папочная колода.
- UI: бейджи нижнего меню, кнопка «Добавить» с дедуп-превью, empty states, массовый режим (long-press → чекбоксы → [В папку][Тег][В архив][В колоду][Распределить][Удалить]), «Разобрать эту папку», подсказка жестов после 10 свайпов.

### Фаза R — надёжность (Шаги 0–4 готовы)
- **Шаг 0 — диагностика**: миграция `0001_reliability.sql` (применяется вручную в SQL Editor). Поля `cards.meta_status` (pending/processing/done/failed) + `meta_error`, `attachments.storage_url`, таблица `meta_cache` (PK sha256 canonical_url, RLS без политик — только service_role). `src/lib/db/meta.ts`, `GET /api/settings/diagnostics` (owner-only по `OWNER_TELEGRAM_ID`), `POST /api/cards/[id]/refetch`, UI `DiagnosticsSettings.tsx`.
- **Шаг 1 — медиа-кэш**: `src/lib/db/media.ts` — public бакет `swipemark-media`, кэш фото/превью в Storage (download ≤8МБ/10с), `storage_url`; `after()` из webhook. `/api/file` — `?storageUrl=`→302, иначе прокси ТОЛЬКО photo, остальное 404. Маппер: imageUrl приоритетно из storage_url, видео не проксируется, duration из attachments.
- **Шаг 2 — парсеры + кэш меты**: `src/lib/meta/parsers/` (youtube/instagram/tiktok/twitter/telegram/generic, `parseUrl`/`providerForUrl`, `fetchHtml` браузерный UA + 403-тело, декод числовых HTML-entities). `src/lib/meta/cache.ts` (TTL 7д, ленивый prune), `src/lib/meta/enrich.ts` (`enrichCardMeta`: canonical→кэш→сеть→`og_*` в card_links + дубль в card.title/image_url/duration_seconds→done|failed). Фон из webhook (`after()` + авто-ретрай failed 60с) и `POST /api/cards`. Title-заглушка для link = домен.
- **Шаг 3 — устойчивый UI**: `Bookmark.metaStatus/metaError` (маппер). `src/components/SourceBadge.tsx` — `SourceBadge` (иконка источника), `MetaStatusDot` (processing=пульс, failed=красная), `FailedActions` ([Повторить]→refetch + [Открыть]), `CardSkeleton`. BookmarkCard: скелетон, бейдж источника, «⚠️ Метаданные не загружены»+кнопки; Library: rose-точка + бейдж failed. onError-цепочка `storage → /api/file → placeholder`.
- **Шаг 4 — тесты без сети**: `scripts/test-meta-parsers.ts` (18+2) — мок `global.fetch`; youtube (oEmbed/превью/lengthSeconds/невалидный), instagram (OG + UA facebookexternalhit, фолбэк «Instagram • @username», декод entities), tiktok, twitter, telegram, generic, parseUrl-роутинг. Маппер: +3 теста metaStatus/metaError. Итого 67 зелёных.
- **Шаг 5 (человек)**: ручной прогон пересылок t.me/видео/PDF через бота.

### UI-фаза (Шаг 1 — читаемость и библиотека, готов)
- Миграция `0002_ui_phase.sql`: `user_settings.ui_scale` (S/M/L) + `bulk_jobs` (для автосортировки, Шаг 3).
- Дизайн-токены: `--fs-*` (xs/sm/base/title/summary/lg/xl) с множителем `--ui-scale` (S=0.92, M=1, L=1.12) на `<html>`, `body` 16px; адаптив ≥768px → колонка 640px.
- Тумблер «Размер текста» S/M/L в настройках (`UiScaleSettings.tsx`), `GET/POST /api/settings` отдают/принимают `uiScale`.
- Библиотека по макету: чипы папок со счётчиками + «Все»/«✨ Несортированное»/«+», баннер автосортировки (sheet-заглушка «скоро»), сегмент-табы со счётчиками, фильтры-теги в sheet с бейджем, группировка Сегодня/Неделя/Раньше, карточка списка (превью 56px, title 2 строки, SourceBadge + ⏱/📖 + дата, теги ≤2), 2 колонки на десктопе.
- Навигация 68px, иконки 26, текст 12. Тесты 68 зелёных.

### UI-фаза (Шаг 2 — колода, готов)
- Бейджи времени в deck: `⏱ mm:ss` (видео, duration) и `📖 ~N мин` (readTimeMin из `estimated_minutes` или оценка по описанию ~200 слов/мин), только при наличии.
- Типовые токены на карточке: заголовок `text-fs-title` (17px) semibold line-clamp-3, meta `text-fs-sm` (13px).
- Саммари: `ai_summary` 2 строки clamp; ghost-кнопка `[✨ Саммари]` (только если `GET /api/settings/ai` вернул `hasKey && mode != off`), по нажатию → `POST /api/cards/[id]/summary` → `generateCardSummary()` в `src/lib/ai/enrich.ts` (адаптер chatCompletion, 2–3 предложения ≤500 символов, пишет ai_summary, скелетон «Составляю саммари…», защита от повторов через state). Без ключа кнопки нет; Ollama offline → 502 с ошибкой на UI.
- Undo-тост 4с после свайпа (left/right-archived): «В архив [Отменить]» → `POST /api/actions/undo`, карточка возвращается в колоду. Таймер чистится при unmount.
- Immersive: после первого свайпа нижняя навигация уезжает вниз, появляется триггер `⋯` (тап — показать); при переключении таба nav возвращается.
- Хелперы вынесены в `src/lib/format.ts`: `fmtDuration/fmtReadMinutes/fmtDateShort/groupByPeriod` (+ тесты `scripts/test-format.ts`). `readTimeMin` в маппере теперь реальный (был хардкод 1).
- Тесты 77 зелёных (было 68: +6 format +3 mappers).

### UI-фаза (Шаг 3 — автосортировка, готов)
- Backend: `src/lib/db/jobs.ts` — CRUD `bulk_jobs` (create/get/update, `bulkJobStatusToClient`). `POST /api/cards/bulk-ai` теперь асинхронный: создаёт job → `after()` обрабатывает чанками по 5 через `enrichCard` → прогресс в БД; возвращает `{jobId, status, total, done, failed}` сразу. `GET /api/cards/bulk-ai/[jobId]` — статус (owner-scoped), `POST .../cancel` — отмена (проверяется между чанками, статус cancelled).
- Frontend: `AutosortSheet` (Library.tsx) вместо заглушки — кнопка «Распределить (N)» → запуск job → поллинг каждые 2с → прогресс-бар (done+failed)/total + счётчик + кнопка «Отменить»; результат: «Готово! Распределено X, не удалось Y» / «Остановлено. Успели X из N» / ошибка. Хептика, `onDone` → `load()`. Массовый режим `runBulkAi` тоже переведён на job-контракт (поллинг до завершения).

### UI-фаза (Шаг 4 — fullscreen и десктоп, готов)
- Fullscreen в Telegram: `TelegramProvider` расширен (`requestFullscreen/exitFullscreen/isFullscreen/onEvent`, состояние `isFullscreen` в контексте, подписка на `isFullscreenChanged`). Компонент `FullscreenSettings.tsx` в настройках — тумблер «Полный экран» (только когда API поддерживается), авто-восстановление из `localStorage "swipe-fullscreen"`.
- Десктоп: `.app-column` на ≥768px расширен до 960px; колода ограничена `md:max-w-[560px]` и `md:max-h-[min(820px,100dvh-140px)]` по центру (карточка не растягивается на весь экран); библиотека `md:grid-cols-2 xl:grid-cols-3`.

### UI-фаза (Шаг 5 — PWA-минимум, готов)
- Манифест: `src/app/manifest.ts` → `/manifest.webmanifest` (name/short_name/description, `display: standalone`, `orientation: portrait`, theme/background `#10121c`, lang ru, иконки 192/512 + maskable).
- Иконки: `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (сгенерированы скриптом через System.Drawing — карточка-градиент #6366f1→#4f46e5 с белой закладкой).
- `layout.tsx` metadata: `manifest`, `applicationName`, `appleWebApp` (capable/title/statusBarStyle), `icons` (icon + apple-touch).
- Офлайн-оболочка: `public/sw.js` — precache (offline.html, иконки, манифест), network-first для навигации с фолбэком на `/offline.html`, stale-while-revalidate для статики, `/api/*` и не-GET никогда не кэшируются. `public/offline.html` — статическая страница «Нет соединения» без JS-бандла.
- Регистрация: `src/components/RegisterSW.tsx` — только production, пропуск Telegram WebView (`telegram`+`webview` в UA).
- Проверено: build + live-сервер отдают manifest (200, `application/manifest+json`), sw.js, иконки, offline.html; HTML содержит `<link rel="manifest">` и apple-touch-icon.

---

## Как работает приложение

1. Пользователь отправляет боту ссылку/фото/видео/пересылку → `/api/webhook` → карточка в Supabase (альбомы сливаются по `media_group_id`, пересылки сохраняют источник и `source_url`).
2. Mini App показывает свайп-колоду; свайпы пишутся в `swipe_actions` (5-й свайп вправо архивирует), левый свайп — в архив.
3. Архив с TTL-очисткой (24ч/7д/30д/выкл), возврат из архива в колоду.
4. Библиотека: поиск, папки, теги, массовые действия, AI-распределение.

---

## Тесты (77 зелёных)
- `scripts/test-mappers.ts` (14) — маппинг card→Bookmark (вкл. metaStatus/metaError)
- `scripts/test-crypto.ts` (5) — шифрование ключей
- `scripts/test-enrich.ts` (9) — парсинг AI-ответа
- `scripts/test-pairing.ts` (4) — генерация кодов
- `scripts/test-preview.ts` (6) — нормализация URL
- `scripts/test-parsers.ts` (8) — parseMetaTags по фикстурам, роутинг доменов
- `scripts/test-meta-parsers.ts` (20) — парсеры с моком fetch (без сети) + декод entities

Запуск: `npx tsx --test scripts/test-*.ts`; typecheck вручную: `npx tsc --noEmit`; lint: `npm run lint`.

---

## Окружение
- `.env.local` (не коммитится): `TELEGRAM_BOT_TOKEN`, `BOT_USERNAME`, `NEXT_PUBLIC_BOT_USERNAME`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `AI_KEY_SECRET`, `OWNER_TELEGRAM_ID`; `FIREBASE_SERVICE_ACCOUNT_KEY` — только для миграции.
- Все API-роуты: `export const runtime = "nodejs"`.
- Tailwind v4 без конфига; `next-env.d.ts` не коммитить правки.
- SQL-миграции (`supabase/migrations/*.sql`) применяются вручную в Supabase SQL Editor — DDL не проходит через PostgREST.

---

## Техдолг / идеи

### P0 — ближайший спринт (берём отсюда)
1. **Экран «Позже» как «Сохранёнки»** — унифицировать с библиотекой: `page.tsx:798` сейчас вертикальный список `size-12` строк `810` с `Archive/Undo/Open`, без `grid/groupByPeriod/MaterialSheet/delete`. Сделать грид `Library:1011 xl:grid-cols-3`, группировку Сегодня/Неделя/Раньше, `open` через `MaterialSheet`, кнопки `Открыть` (`ExternalLink bg-accent/15`) + `Удалить` (красный `Trash2`), единый скролл `flex-1 overflow-y-auto hide-scrollbar` как `Library:525`, `longPress` + `bulk delete`.
2. **«Кратко» в карточке** — `BookmarkCard:60 expanded` уже `h-[30%]/flex-1`, превью `line-clamp-2:299` → `setExpanded(true)`, `Скрыть setExpanded(false):277` внутри карточки, `requestSummary:111 if(summaryDone) return` предотвращает повторный запрос (кэш `summaryText` остаётся). Убрать дубликат `description:322` вне `expanded` блока.
3. **Тост после свайпа → Dynamic Island (верх)** — сейчас `page.tsx:989 fixed bottom-20 z40` (разный уровень из-за `SwipeDeck:112 absolute top-3 z30` внутри колоды). Сделать меньше, прозрачнее `bg-surface/85 backdrop-blur-md`, `text-xs`, перенести в `header:623` между `⚡` и `＋` (`absolute left-1/2 -translate-x-1/2 top-[calc(env(safe-area)+8px)] z-[55]`), `AnimatePresence mode="popLayout"` `180px↔220px` морфинг.
4. **Прогресс в Dynamic Island** — перенести `SwipeDeck:112-137` (`done/total + pct bar`) в тот же island: `lastSwipe ? toast : progress` (`page.tsx:36 pct`, `done/total`), `w-[220px] bg-black/55`, удалить оба старых позиционирования.

### P1 — следом
- **AI Search (4 этапа, план утверждён 2026-08-23)** — гибридный поиск: PostgreSQL FTS + pgvector, без внешней инфраструктуры.
  - **Архитектура**: при сохранении — дешёвый слой (title/text/og_description уже в card_links) + embedding; поиск = FTS ∥ vector → RRF-слияние top-20; LLM только для «Спросить» (top-5 → ответ). Summary/tags — не фундамент поиска, semantic search работает на embeddings исходного контента.
  - **Этап 1 — FTS**: миграция `0008_ai_search.sql` (`search_vector tsvector generated` + GIN, HNSW на `embedding vector_cosine_ops`, kind='search' в ai_usage check); `/api/library?q=` OR `search_vector @@ websearch_to_tsquery('russian', q)`.
  - **Этап 2 — Embeddings**: `adapter.embed()` OpenAI-совместимый `/embeddings` (env `AI_EMBEDDING_PROVIDER/MODEL/KEY`, dims=768 под существующую колонку `cards.embedding vector(768)`, текст ≤8k); вебхук `after()` эмбеддинг новой карточки (фото без текста — skip); `scripts/backfill-embeddings.ts` батчами, идемпотентно (`WHERE embedding IS NULL`); `POST /api/search/ai` — embed запроса → cosine top-50 + FTS top-50 → RRF → top-20.
  - **Этап 3 — ✨ Спросить**: UI в поиске «Сохранёнок» — Enter/кнопка «Спросить» → sheet с результатами; вопросительный запрос → LLM-ответ по top-5 (`kind='search'`, free 20/мес, 429 через квоту Sprint B); тап по результату → MaterialSheet.
  - **Этап 4 — позже**: LLM-rerank, chunks для длинных статей (>8k), content_hash, AI-budget в Premium.
  - **Решения**: rerank в MVP заменён RRF (бесплатно/детерминированно); dims 768 без смены схемы (`dimensions=768` параметр OpenAI); без новой машины состояний — INDEXED = `embedding IS NOT NULL`, ENRICHED = `ai_summary IS NOT NULL`; content_hash отложен (пере-эмбеддинг только при refetch).
  - **Стоимость**: эмбеддинг 10k сохранений ≈ $0.05–0.10 разово; поиск бесплатный; LLM-ответ только по явному «Спросить» (покрыт квотой).

- Папки 2 уровня (`folders.parent_id` отсутствует — `folders.ts:1`), ~~AI Search слот~~ (см. выше), `embedding vector(768):types:114` не заполняется (заполняется в AI Search этап 2), ~~квота `ai_usage 50/10` без блокировки~~ (реализовано, Спринт B), `premium/paywall`, `PWA` install prompt.
- На проде вернуть реальный AI-ключ и `BOT_USERNAME` в `.env.local` / env Vercel; добавить `TELEGRAM_BOT_TOKEN` (без него media-кэш не качает файлы, а webhook молчит). Для AI Search этапа 2 дополнительно: `AI_EMBEDDING_PROVIDER/MODEL/KEY`.
- **Фаза R, Шаг 5**: ручной прогон пересылок t.me/видео/PDF через бота (человек-шаг ТЗ).
