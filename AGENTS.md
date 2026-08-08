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
1. User sends a link/photo/video/forward to @SwipeMarkBot → Telegram POSTs to `/api/webhook` → bookmark saved to Firestore `bookmarks` with `userId: "tg:<telegramId>"`. Photos/video thumbnails store `imageUrl` as `/api/file?path=...`, which proxies the file from Telegram so the bot token never reaches the client.
2. Mini App (`src/app/page.tsx`) fetches `GET /api/bookmarks?userId=tg:<id>` and renders the swipe deck (`SwipeDeck` → `BookmarkCard`).
3. `/api/auth` validates Telegram `initData` (HMAC-SHA256) and mints a Firebase custom token, but the frontend does NOT call it — bookmarks are fetched with an unauthenticated `userId` query param.

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
