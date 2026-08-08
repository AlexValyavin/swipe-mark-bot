<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SwipeMark — Telegram Mini App

Mini App where users swipe through saved bookmarks. UI copy is Russian (`<html lang="ru">`). Backend is Next.js API routes + Firebase (Firestore, Auth). No test suite exists.

## Commands
- `npm run dev` — dev server. Open in Telegram or use the fallback landing page (rendered when `window.Telegram.WebApp` is absent).
- `npm run lint` — ESLint only; there is no typecheck or test script. Typecheck manually with `npx tsc --noEmit`.

## Data flow
1. User sends a link/photo/video/forward to @SwipeMarkBot → Telegram POSTs to `/api/webhook` → bookmark saved to Firestore `bookmarks` with `userId: "tg:<telegramId>"`. One message = one card; albums (`media_group_id`) are merged into a single card via a deterministic `album_<user>_<groupId>` doc id (transactional append to `mediaItems`), and the caption that Telegram attaches to the album's last photo is applied to the card. Forwards store source fields (`sourceType`, `sourceChatId/MessageId/Username/Title`, `sourceUrl`) and `forwardUrl`. `forward_origin` always points to the original source (which may be a private chat the user can't access), so `forwardUrl` is set **only** for public sources with a `username` (`https://t.me/<username>/<messageId>`); otherwise it's unset and the "open" action falls back to the saved media (the copy the user actually forwarded). Title is derived via `deriveTitle`: first meaningful text line → caption → OG title → file name → auto-label (`Фото`/`Видео`/`Документ`/`Ссылка`/`Сохранённое сообщение`), capped at 120 chars. Media stores `imageUrl` (and `videoUrl` for the actual video file) as `/api/file?path=...`, which proxies files from Telegram so the bot token never reaches the client.
2. Mini App (`src/app/page.tsx`) fetches `GET /api/bookmarks` (user resolved from the session cookie) and renders the swipe deck (`SwipeDeck` → `BookmarkCard`). Card statuses (`new`/`later`/`archived`/`done`, plus `deferUntil`) live on the bookmark doc; the frontend filters the deck (new + later whose `deferUntil` has passed) and the archive (`archived`). Swipes/opens post to `POST /api/actions` (`left`→archived, `right`→increment `rightCount`, 5th right-swipe archives the card, `done`, `open`=log, `undo`→restore `previousStatus`) with a unique idempotency key per gesture; actions are logged in the `swipe_actions` Firestore collection. On the frontend a right-swipe moves the card to the bottom of the deck (it returns after you cycle through the rest) unless the server reports it was archived.
3. `/api/auth` validates Telegram `initData` (HMAC-SHA256) and sets an HTTP-only session cookie (signed with `TELEGRAM_BOT_TOKEN`). The frontend calls it once on startup; all other APIs (`/api/bookmarks`) read the user from that session and return 401 without it.

## Env vars (`.env.local`, none committed)
- `TELEGRAM_BOT_TOKEN` — used by the webhook and auth HMAC
- `FIREBASE_SERVICE_ACCOUNT_KEY` — service-account JSON as an **inline string** (parsed with `JSON.parse`, not a file path)
- `NEXT_PUBLIC_FIREBASE_*` — client SDK config (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`)

## Gotchas
- Every API route must keep `export const runtime = "nodejs"` — `firebase-admin` and `crypto` fail on the edge runtime.
- `src/lib/firebase-admin.ts` imports `server-only`; never import it from client components. `src/lib/firebase.ts` (client SDK) is currently unused.
- The `Bookmark` type lives in and is exported from `@/app/api/bookmarks/route`; components import it from there.
- Tailwind v4: no `tailwind.config` — styles are set up via `@import "tailwindcss"` in `src/app/globals.css`, which also holds Telegram theme vars and custom utilities.
- Keep the `<!-- BEGIN/END:nextjs-agent-rules -->` block intact — `next dev` regenerates it; commit it with your changes.
