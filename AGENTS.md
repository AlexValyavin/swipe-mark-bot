<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SwipeMark — Telegram Mini App

Mini App where users swipe through saved bookmarks. UI copy is Russian (`<html lang="ru">`). Backend is Next.js API routes + Supabase (Postgres, service-role only from server). Firebase (Firestore) remains as legacy read-only during migration; one-off migration lives in `scripts/migrate-firestore.ts`.

## Commands
- `npm run dev` — dev server. Open in Telegram or use the fallback landing page (rendered when `window.Telegram.WebApp` is absent).
- `npm run lint` — ESLint only; there is no typecheck or test script. Typecheck manually with `npx tsc --noEmit`. Mapping unit tests: `npx tsx --test scripts/test-mappers.ts`. AI-enrich parsing tests: `npx tsx --test scripts/test-enrich.ts`. Pairing code tests: `npx tsx --test scripts/test-pairing.ts`. URL-normalization tests: `npx tsx --test scripts/test-preview.ts`.

## Data flow
1. User sends a link/photo/video/forward to @SwipeMarkBot → Telegram POSTs to `/api/webhook` → profile is resolved via `getOrCreateProfileByTelegramId`, card saved to Supabase `cards` (single row per message), media into `attachments`, URLs into `card_links`. Albums (`media_group_id`) are merged into one card by lookups on `media_group_id + user_id` (`findCardIdByMediaGroup`) and append to `attachments`; the last photo's caption is applied. Forwards store `source_type='forwarded'`, `source_chat_id`, `source_message_id` and `source_url` (`https://t.me/<username>/<messageId>` for public, `https://t.me/c/<id>/<messageId>` for private chats). Title is derived via `deriveTitle`: first meaningful text line → caption → auto-label (`Фото`/`Видео`/`Документ`/`Ссылка`/`Сохранённое сообщение`), capped at 120 chars. Media is served through `/api/file` (accepts `?fileId=` resolved via getFile, or the legacy `?path=`), so the bot token never reaches the client.
2. Mini App (`src/app/page.tsx`) fetches `GET /api/bookmarks` (user resolved from the session cookie) and renders the swipe deck (`SwipeDeck` → `BookmarkCard`). Card statuses (`new`/`later`/`archived`/`done`, plus `deferUntil`) live on the card row; the frontend filters the deck (new + later whose `deferUntil` has passed) and the archive (`archived`). Swipes/opens post to `POST /api/actions` (`left`→archived, `right`→counted via `swipe_actions`, 5th right-swipe archives the card, `done`, `open`=log, `undo`→restore `previous_status`) with a unique idempotency key per gesture; actions are logged in the `swipe_actions` table. On the frontend a right-swipe moves the card to the bottom of the deck (it returns after you cycle through the rest) unless the server reports it was archived. The header shows live counts for the deck and archive; the archive tab has an "Очистка архива" TTL selector (`GET/POST /api/settings`, `archiveTtlHours` 24/168/720/null, stored in `user_settings`), and `GET /api/bookmarks` auto-deletes archived cards older than the TTL.
3. `/api/auth` validates Telegram `initData` (HMAC-SHA256) and sets an HTTP-only session cookie (signed with `TELEGRAM_BOT_TOKEN`) holding the profile uuid; legacy `tg:<id>` cookies are accepted and translated via `profiles.telegram_id`. The frontend calls it once on startup; all other APIs (`/api/bookmarks`) read the user from that session (or a Supabase Auth Bearer token) and return 401 without it.

## Repositories (`src/lib/db/*`) — the only place with Supabase queries
- `supabase.ts` — service-role client. `types.ts` — row types. `mappers.ts` — `cardToBookmark()` reconstructs the frontend `Bookmark` contract from relational rows (type/sourceType/status maps, `/api/file?fileId=` URLs, `forwardUrl` from `source_url`, optional `folders` meta).
- `cards.ts` — list/get/create/update media-group lookup, archived TTL deletes, `listForLibrary()` (statuses/folder/search/sort/cursor). `settings.ts` — `archive_ttl_hours`. `swipes.ts` — idempotency check, action logging, right-swipe counting. `folders.ts` — folder CRUD + counts + `setCardFolders` (scope-checked). `tags.ts` — `findOrCreateTag` (lower+trim+схлоп пробелов), `listTagsByUser` (join card_tags, топ-50 по частоте), `addCardTags` (upsert + связи), `setCardTags` (полная замена связей + чистка осиротевших тегов), `removeCardTag`, `getTagsForCardIds`. `pairing.ts` — future stage (pairing repo exists).
- `cards.ts` — list/get/create/update media-group lookup, archived TTL deletes, `listForLibrary()` (statuses/folder/tags/search/sort/cursor; поиск и по имени тега). 
- `settings.ts` — `archive_ttl_hours`.
- `swipes.ts` — idempotency check, action logging, right-swipe counting.
- `folders.ts` — folder CRUD + counts + `setCardFolders` (scope-checked).
- `tags.ts` — bucket: `.findOrCreateTag` (`lower+trim+схлоп пробелов`, race-safe 23505), `.listTagsByUser` (join `card_tags`, топ-50 по частоте), `.addCardTags` (upsert+sвязи), `.setCardTags` (замена связей + чистка orphan), `.removeCardTag`, `.getTagsForCardIds`.
- `pairing.ts` — future stage (tag/pairing repos exist).

## AI (BYOK, этап 3)
- `src/lib/crypto.ts` — AES-256-GCM шифрование ключей: формат `enc:v1:<iv>:<tag>:<ct>` (base64url), ключ выводится из `AI_KEY_SECRET` через SHA-256, `maskKey()` только последние 4 символа.
- `src/lib/ai/adapter.ts` — единый chat-completions адаптер: openrouter/mistral/openai/custom base url, timeout 8с, ошибки `AiError {kind: auth|rate|timeout|network|parse}`, дефолт-модели на провайдер.
- API: `GET/PUT /api/settings/ai` (zod-валидация, возвращает `{provider, model, mode, hasKey, keyMask, customBaseUrl}`, ключ никогда не отдаётся открытым), `POST /api/settings/ai/test` (rate limit 5/мин in-memory, `{ok, model, latencyMs, error?}`).
- `src/lib/db/settings.ts` — `getAiSettings`/`upsertAiSettings` (user_settings: ai_provider/ai_key_enc/ai_model/ai_custom_base_url/ai_mode).
- UI: `src/components/AiSettings.tsx` — вкладка «Настройки» в `page.tsx` (селект провайдера, ключ password+👁 + Удалить, модель авто/вручную с загрузкой списка, Проверить, тумблер off/suggest/auto). Custom base URL без протокола нормализуется в `http://` (порт — часть URL, напр. `localhost:11434`).
- Этап 4 (AI-распределение): `src/lib/ai/enrich.ts` — `buildPrompt` (только существующие папки), `parseAiJson` (извлекает первый `{…}`, fallback при мусоре), `normalizeFolderName` (срезает эмодзи-префикс `💼 win`→`win` — модель копирует эмодзи из промпта), `enrichCard` (устанавливает ai_status processing→done/failed, никогда не роняет карточку), `acceptSuggestion`/`dismissSuggestion`. Вызывается из `/api/webhook` через `after()` (фоново, после ответа Telegram). Роуты: `POST /api/cards/[id]/ai-accept` (`kind: folder|tags|all`), `POST /api/cards/[id]/ai-dismiss`, `POST /api/cards/bulk-ai` (`{scope:'unsorted'}` или `{cardIds}` → `{processed, failed, failedIds}`, ≤30 карточек). Фильтр `folderId=unsorted` в `GET /api/library` (карточки без card_folders, статусы new/later); счётчик unsorted считается в коде (RPC `counts` может отсутствовать/врать). AI-поля в `Bookmark`: `aiStatus/aiTitle/aiSummary/aiFolderId/aiFolderName/aiConfidence` (`aiFolderName` резолвится через `loadAiFolderNames`, т.к. подсказка не в card_folders); чип `AI: <папка> [✓][✎]` в Library (активные кнопки) и пассивный бейдж в deck (`BookmarkCard`).
- Тесты: `npm run test:crypto` (roundtrip, маскирование, тампер-детект); `npx tsx --test scripts/test-enrich.ts` (парсинг JSON, клэмп confidence, обрезка тегов/тайтла, no-JSON throw).

## Frontend
- Tabs: «Входящие» (swipe deck), «Библиотека» (`Library.tsx` — search, folder chips + counts + tag filter «Теги ▾» (мультивыбор OR), tabs В колоде/Позже/Архив, create/delete folder modals, folder picker, tag picker с чипами/инпут/автокомплит, чипы тегов на карточке (≤3)), «Архив».
- Library API: `GET /api/library` (`tab`, `folderId`, `q`, `tags=a,b`, `sort`, `cursor`), `GET /api/tags` (`q`), `POST /api/cards/[id]/tags` (`names`), `DELETE /api/cards/[id]/tags/[tagId]`, `GET/POST /api/folders`, `PATCH/DELETE /api/folders/[id]`, `POST /api/cards/[id]/folders`.

## Pairing (этап 5)
- `src/lib/db/pairing.ts` — `generateCode()` (безопасный алфавит без O/0/I/1, 8 символов), `generatePairingCode` (инвалидирует старые, TTL 10 мин), `consumePairingCode` (null при невалидном/просроченном/использованном), `linkTelegram` (scope-check: TG не должен быть у другого профиля → 23505), `unlinkTelegram`.
- API: `POST /api/pairing/generate` → `{code, expiresAt, deepLink, qr}` (deepLink = `https://t.me/<BOT_USERNAME>?start=<code>`), `GET /api/pairing/status` → `{linked, telegramUsername, linkedAt, code, expiresAt}` (активный код, если есть), `POST /api/pairing/unlink`.
- Бот: `/start <code>` в `/api/webhook` → проверки (нет кода / недействителен / уже привязан у себя / 23505 занят другим) → `profiles.telegram_id` + `markCodeUsed`; `/unlink` → очистка. Ответы через Telegram sendMessage (дружелюбные).
- UI: `src/components/PairingSettings.tsx` вверху вкладки «Настройки» — не привязан (кнопка + код + копировать + открыть TG + QR `qrcode.react` + таймер TTL + polling 3 с) / привязан (@username, дата, Отвязать). Env: `BOT_USERNAME` (сервер) и `NEXT_PUBLIC_BOT_USERNAME` (клиент для QR/deep link).

## Полировка (этап 6)
- API: `GET /api/counts` → `{inDeck, readLater, archived, unsorted}` (считается в коде — RPC `counts` в проде отсутствует, PGRST202; дедуп unsorted = в колоде минус карточки в card_folders). `POST /api/cards/preview` `{input}` → `{links: [{url, type, duplicate}]}` (нормализация через `normalizeUrl()` в cards.ts — lowercase host, www., utm/fbclid/gclid/igsh/igshid, hash, trailing slash; дедуп по canonical_url + card_links). `POST /api/cards/bulk` `{cardIds, action: toFolder|addTag|archive|toDeck|delete, payload?}` → `{processed, failed, failedIds}` (атомарно по карточке; toFolder проверяет владение папкой, delete чистит attachments/card_links/card_folders/card_tags/swipe_actions). `POST /api/cards` `{urls}` → создаёт карточки link-типа с canonical_url, пропускает дубли, кикает AI-enrich через `after()`. `GET /api/deck?folderId=&limit=` — RPC `deck(uid, folder, tag, lim)` (в проде сигнатура `(folder, lim, tag, uid)`, работает по именам параметров).
- UI: бейджи нижнего меню (Входящие = `counts.inDeck`, Библиотека = `counts.unsorted`); кнопка «Добавить» в хедере → `AddModal.tsx` (preview-дедуп: «Найдено ссылок: N», дубли ⚠️, «Сохранить (X новых, Y дублей)»); контекстные empty states (поиск/теги/папка/архив); массовый режим в Library (long-press 350мс → чекбоксы → панель [В папку][Тег][В архив][В колоду][Распределить→bulk-ai][Удалить], «Выбрать все/Готово · N»); кнопка «Разобрать эту папку» (активна при выбранной папке) → `GET /api/deck?folderId=` + шапка «Папка: X · N» в табе Входящие; подсказка жестов скрывается после 10 свайпов (`localStorage "swipe-count"`, не в user_settings — колонки нет).
- Тесты: `scripts/test-preview.ts` (normalizeUrl: utm/hash/www/trailing-slash/instagram-igsh).

## Фаза R — надёжность (Шаг 0 готов)
- SQL-миграции: `supabase/migrations/0001_reliability.sql` (применяется вручную в SQL Editor — DDL не проходит через PostgREST). Поля: `cards.meta_status` (`pending|processing|done|failed`, default pending) + `cards.meta_error`; `attachments.storage_url`; таблица `meta_cache` (PK = sha256(canonical_url), jsonb `data`, RLS без политик — только service_role).
- `src/lib/db/meta.ts` — `setCardMetaStatus` (ошибки нормализуются к `timeout|403|parse|network`), `listFailedCards(20)`.
- `GET /api/settings/diagnostics` — только владелец (`OWNER_TELEGRAM_ID` env, сравнение по `profiles.telegram_id`), последние 20 failed: `{id, url, error, createdAt}`.
- `POST /api/cards/[id]/refetch` — Шаг 0: заглушка (сброс на pending); реальный парсинг в Шаге 2.
- UI: `src/components/DiagnosticsSettings.tsx` в табе «Настройки» (скрыт для не-владельца): «Сбоев нет» / список failed с ошибкой+временем / [Повторить].
- Человек-шаг: в `OWNER_TELEGRAM_ID` и Vercel вернуть прод-значения `AI_KEY_SECRET` и `BOT_USERNAME`.

## Env vars (`.env.local`, none committed)
- `TELEGRAM_BOT_TOKEN` — used by the webhook and auth HMAC
- `BOT_USERNAME` / `NEXT_PUBLIC_BOT_USERNAME` — bot username without @, used for pairing deep links (`https://t.me/<username>?start=<code>`) and QR
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server DB access (service role; never exposed to client)
- `SUPABASE_ANON_KEY` — used only server-side to verify Bearer auth tokens
- `FIREBASE_SERVICE_ACCOUNT_KEY` — legacy, only for `scripts/migrate-firestore.ts` (inline JSON string, parsed with `JSON.parse`)
- `OWNER_TELEGRAM_ID` — Telegram ID владельца; только ему показывается блок «Диагностика» (`/api/settings/diagnostics`)
- (Legacy client config `NEXT_PUBLIC_FIREBASE_*` no longer used)

## Gotchas
- Every API route must keep `export const runtime = "nodejs"` — `firebase-admin`, `crypto` and Supabase fail on the edge runtime.
- `src/lib/firebase-admin.ts` imports `server-only`; never import it from client components. Its use beyond the migration script is deprecated.
- The `Bookmark` type is defined in and re-exported from `@/lib/db/mappers` via `@/app/api/bookmarks/route`; components import it from there.
- The repo repos return snake_case fields typed in `src/lib/db/types.ts`; the Supabase client is untyped (no Database generic) — cast query results to the row types.
- Migration script: idempotent via `migration_log.json` (mapping old→new ids), `--dry-run` flag, logs `processed/failed`, exits non-zero on failures.
- Tailwind v4: no `tailwind.config` — styles are set up via `@import "tailwindcss"` in `src/app/globals.css`, which also holds Telegram theme vars and custom utilities.
- Keep the `<!-- BEGIN/END:nextjs-agent-rules -->` block intact — `next dev` regenerates it; commit it with your changes.

## Tech debt / backlog
- **Автосортировщик библиотеки** (идея, не в ТЗ): кнопка в Library «✨ Автосортировка» → массовое распределение «Несортированного» по существующим папкам. База уже готова: `POST /api/cards/bulk-ai {scope:'unsorted'}` (≤30 карточек, синхронно). Нужно: (a) UI-кнопка + индикатор прогресса; (b) обход таймаута fetch/Vercel для больших библиотек (фоновый запуск через `after()` + поллинг статуса, либо порции с «продолжить»); (c) предупреждение о стоимости (N карточек = N запросов BYOK). Вариант Б: в настройках поле «кол-во папок» → ИИ предлагает N имён → создание с подтверждением пользователя (авто-создание папок сейчас запрещено намеренно) → раскладка. Хранилище: `user_settings.auto_sort_folder_count`.
