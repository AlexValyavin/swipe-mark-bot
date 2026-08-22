<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SwipeMarkBot — Telegram Mini App (swipe deck for saved bookmarks)

Russian UI (`<html lang="ru">`). Next.js 16.3 App Router + Supabase Postgres (service-role only from server). Firebase is legacy read-only, used only by `scripts/migrate-firestore.ts`.

## Layout

- `src/app/` — App Router pages + `src/app/api/*` routes. `@/*` → `src/*` (`tsconfig.json` paths).
- `src/components/` — client components (`BookmarkCard`, `Library`, `SwipeDeck`, etc.).
- `src/lib/db/` — **only place with Supabase queries** (`supabase.ts` service-role client, `types.ts` rows, `mappers.ts` `cardToBookmark()`). Other repos: `cards`, `folders`, `tags`, `swipes`, `settings`, `pairing`, `jobs`, `media`, `meta`.
- `src/lib/ai/` — `adapter.ts` (openrouter/mistral/openai/custom, 8s timeout) + `enrich.ts` (`buildPrompt`, `parseAiJson`, `enrichCard`); keys encrypted via `src/lib/crypto.ts` (AES-256-GCM `enc:v1:…`, derived from `AI_KEY_SECRET`).
- `src/lib/meta/` — parsers per provider (`youtube/instagram/tiktok/twitter/telegram/generic`) + `cache.ts` (7-day `meta_cache`) + `enrich.ts` (`enrichCardMeta`).
- `supabase/migrations/*.sql` — `0001_reliability` … `0004_language`; applied **manually in Supabase SQL Editor** (DDL fails via PostgREST).
- `scripts/test-*.ts` — `tsx --test` suites; `landing/` — static GitHub Pages site.

## Commands

```bash
npm run dev          # Next dev; open in Telegram or fallback landing
npm run build        # next build --webpack
npm run lint         # ESLint only (eslint.config.mjs)
npx tsc --noEmit     # typecheck (no npm script)
```

Tests (no single `npm test`; run individually):
```bash
npm run test:mappers       # scripts/test-mappers.ts
npm run test:crypto        # scripts/test-crypto.ts
npx tsx --test scripts/test-enrich.ts
npx tsx --test scripts/test-pairing.ts
npx tsx --test scripts/test-preview.ts   # normalizeUrl
npx tsx --test scripts/test-parsers.ts
npx tsx --test scripts/test-meta-parsers.ts
npx tsx --test scripts/test-format.ts
```

## Env (`.env.local`, never committed — see `.env.example`)

`TELEGRAM_BOT_TOKEN` (webhook HMAC + auth), `BOT_USERNAME` + `NEXT_PUBLIC_BOT_USERNAME` (pairing `t.me/<bot>?start=<code>`), `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`, `AI_KEY_SECRET`, `OPENROUTER_API_KEY` + `AI_MODEL` (default `deepseek/deepseek-v4-flash-0731`), `OWNER_TELEGRAM_ID` (owner-only `GET /api/settings/diagnostics`), `POSTHOG_*` / `NEXT_PUBLIC_POSTHOG_*`, `FIREBASE_SERVICE_ACCOUNT_KEY` (inline JSON, only for migration).

## Data flow (minimal)

1. **Ingest** `POST /api/webhook` (Telegram) → `getOrCreateProfileByTelegramId` → `cards` (+ `attachments`/`card_links`). Albums merged by `media_group_id` (`findCardIdByMediaGroup`); forwards keep `source_type='forwarded'` + `source_url` (`t.me/<user>/<id>` or `t.me/c/<id>/<id>`). Title via `deriveTitle` (≤120 chars). Media served via `GET /api/file?fileId=` (via `getFile`), not raw `file_path`.
2. **Auth** `POST /api/auth` validates `initData` HMAC, sets http-only cookie (signed with `TELEGRAM_BOT_TOKEN`); legacy `tg:<id>` cookie translated via `profiles.telegram_id`. All `GET /api/bookmarks` etc. require session or Supabase Bearer token (401 otherwise).
3. **Deck** `GET /api/bookmarks` + `GET /api/deck?folderId=&limit=` → `SwipeDeck`/`BookmarkCard`. Statuses `new/later/archived/done` (+ `deferUntil`); deck = `new` + `later` past defer; `POST /api/actions` (`left`→archived, `right`→`swipe_actions` count, 5th right→archived, `done/open/undo`) with idempotency key. Archive TTL (`user_settings.archive_ttl_hours` 24/168/720/null) purged on `GET /api/bookmarks`.
4. **Library/Folders/Tags** `GET /api/library?tab=&folderId=&q=&tags=&sort=&cursor=` (incl. `folderId=unsorted` = no `card_folders`; `unsorted` count computed in code, not RPC), `GET/POST /api/folders`, `POST /api/cards/[id]/folders`, `GET /api/tags`, `POST/DELETE /api/cards/[id]/tags`.
5. **AI** `GET/PUT /api/settings/ai` + `POST /api/settings/ai/test` (5/min in-memory limit); `enrichCard` called via `after()` from webhook; `POST /api/cards/[id]/ai-accept|ai-dismiss`, `POST /api/cards/bulk-ai` (→ `bulk_jobs`, chunks of 5, `GET/POST /api/cards/bulk-ai/[jobId]` + `/cancel`), `POST /api/cards/[id]/summary`.

## Conventions & gotchas

- **Every API route must have `export const runtime = "nodejs"`** — `firebase-admin`/`crypto`/Supabase fail on edge.
- **`src/lib/firebase-admin.ts` imports `server-only`** — never from client components; only `scripts/migrate-firestore.ts` uses it now.
- **Supabase client is untyped** (no `Database` generic) — cast to row types in `src/lib/db/types.ts`; all queries must enforce `auth.uid() = user_id` via RLS (service-role bypasses RLS, so code must scope by `user_id`).
- **Bookmark contract** is reconstructed in `src/lib/db/mappers.ts` (`cardToBookmark()`); import `Bookmark` from `@/lib/db/mappers` or `@/app/api/bookmarks/route`, not a separate type file.
- **Tailwind v4** — no `tailwind.config.*`; only `@import "tailwindcss"` in `src/app/globals.css` (+ theme vars, `@theme inline` scales `ui_scale` S/M/L via `html[data-ui-scale]`).
- **Pairing codes** — `generateCode()` avoids `O/0/I/1`, 8 chars, 10-min TTL, invalidates prior; `/start <code>` and `/unlink` handled in webhook.
- **Meta/media cache** — `meta_cache` (PK `sha256(canonical_url)`) and `attachments.storage_url` (bucket `swipemark-media`) are service-role only (RLS no policies). `/api/file?storageUrl=` → 302; otherwise proxies only `photo` (known image exts), else 404.
- **Landing deploy** — `landing/**` push to `main` triggers `.github/workflows/deploy-landing.yml` (GitHub Pages `actions/deploy-pages@v4`). No build step; static files only.
- **Keep `<!-- BEGIN/END:nextjs-agent-rules -->`** committed — `next dev` regenerates it.
