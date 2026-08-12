<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SwipeMark — Telegram Mini App

Mini App where users swipe through saved bookmarks. UI copy is Russian (`<html lang="ru">`). Backend is Next.js API routes + Supabase (Postgres, service-role only from server). Firebase (Firestore) remains as legacy read-only during migration; one-off migration lives in `scripts/migrate-firestore.ts`.

## Commands
- `npm run dev` — dev server. Open in Telegram or use the fallback landing page (rendered when `window.Telegram.WebApp` is absent).
- `npm run lint` — ESLint only; there is no typecheck or test script. Typecheck manually with `npx tsc --noEmit`. Mapping unit tests: `npx tsx --test scripts/test-mappers.ts`.

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

## Frontend
- Tabs: «Входящие» (swipe deck), «Библиотека» (`Library.tsx` — search, folder chips + counts + tag filter «Теги ▾» (мультивыбор OR), tabs В колоде/Позже/Архив, create/delete folder modals, folder picker, tag picker с чипами/инпут/автокомплит, чипы тегов на карточке (≤3)), «Архив».
- Library API: `GET /api/library` (`tab`, `folderId`, `q`, `tags=a,b`, `sort`, `cursor`), `GET /api/tags` (`q`), `POST /api/cards/[id]/tags` (`names`), `DELETE /api/cards/[id]/tags/[tagId]`, `GET/POST /api/folders`, `PATCH/DELETE /api/folders/[id]`, `POST /api/cards/[id]/folders`.

## Env vars (`.env.local`, none committed)
- `TELEGRAM_BOT_TOKEN` — used by the webhook and auth HMAC
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server DB access (service role; never exposed to client)
- `SUPABASE_ANON_KEY` — used only server-side to verify Bearer auth tokens
- `FIREBASE_SERVICE_ACCOUNT_KEY` — legacy, only for `scripts/migrate-firestore.ts` (inline JSON string, parsed with `JSON.parse`)
- (Legacy client config `NEXT_PUBLIC_FIREBASE_*` no longer used)

## Gotchas
- Every API route must keep `export const runtime = "nodejs"` — `firebase-admin`, `crypto` and Supabase fail on the edge runtime.
- `src/lib/firebase-admin.ts` imports `server-only`; never import it from client components. Its use beyond the migration script is deprecated.
- The `Bookmark` type is defined in and re-exported from `@/lib/db/mappers` via `@/app/api/bookmarks/route`; components import it from there.
- The repo repos return snake_case fields typed in `src/lib/db/types.ts`; the Supabase client is untyped (no Database generic) — cast query results to the row types.
- Migration script: idempotent via `migration_log.json` (mapping old→new ids), `--dry-run` flag, logs `processed/failed`, exits non-zero on failures.
- Tailwind v4: no `tailwind.config` — styles are set up via `@import "tailwindcss"` in `src/app/globals.css`, which also holds Telegram theme vars and custom utilities.
- Keep the `<!-- BEGIN/END:nextjs-agent-rules -->` block intact — `next dev` regenerates it; commit it with your changes.
