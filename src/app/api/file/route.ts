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
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
};

function contentTypeFor(path: string, fallback: string | null): string {
  if (fallback && !/application\/octet-stream/i.test(fallback)) {
    return fallback;
  }
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return EXT_MIME[ext] || "application/octet-stream";
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!path || !token || !SAFE_PATH.test(path)) {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${path}`
    );
    if (!res.ok) {
      return new Response("Not found", { status: 404 });
    }

    const body = await res.arrayBuffer();
    const contentType = contentTypeFor(path, res.headers.get("content-type"));
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e) {
    console.error("File proxy error:", e);
    return new Response("Server error", { status: 500 });
  }
}
