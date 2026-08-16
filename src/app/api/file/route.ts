import { NextRequest } from "next/server";

export const runtime = "nodejs";

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

// Типы, которые НИКОГДА не проксируем: видео/документы/аудио.
const NON_PROXY_EXT = new Set([
  "mp4", "mov", "webm", "mkv", "m4v",
  "mp3", "ogg", "m4a", "wav",
  "pdf", "txt", "csv", "json",
]);

function extOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() || "";
}

function contentTypeFor(path: string, fallback: string | null): string {
  if (fallback && !/application\/octet-stream/i.test(fallback)) {
    return fallback;
  }
  return EXT_MIME[extOf(path)] || "application/octet-stream";
}

async function resolvePathFromFileId(fileId: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const json = await res.json();
    if (!json.ok || !json.result?.file_path) return null;
    return json.result.file_path as string;
  } catch (e) {
    console.error("getFile error:", e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  // 1. Кэш в Storage: мгновенный redirect.
  const storageUrl = req.nextUrl.searchParams.get("storageUrl");
  if (storageUrl && /^https?:\/\//.test(storageUrl)) {
    return new Response(null, {
      status: 302,
      headers: { Location: storageUrl },
    });
  }

  const path = req.nextUrl.searchParams.get("path");
  let filePath = path || null;

  if (!filePath) {
    const fileId = req.nextUrl.searchParams.get("fileId");
    if (fileId) {
      filePath = await resolvePathFromFileId(fileId);
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!filePath || !SAFE_PATH.test(filePath)) {
    return new Response("Bad request", { status: 400 });
  }

  // 2. Проксируем только photo. Всё остальное (видео/аудио/документы) — 404.
  const ext = extOf(filePath);
  if (NON_PROXY_EXT.has(ext) || !EXT_MIME[ext]) {
    return new Response(JSON.stringify({ reason: "media type not proxied" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!token) {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) {
      return new Response("Not found", { status: 404 });
    }

    const body = await res.arrayBuffer();
    const contentType = contentTypeFor(filePath, res.headers.get("content-type"));
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    console.error("File proxy error:", e);
    return new Response("Server error", { status: 500 });
  }
}