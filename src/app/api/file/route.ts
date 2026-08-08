import { NextRequest } from "next/server";

export const runtime = "nodejs";

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;

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
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e) {
    console.error("File proxy error:", e);
    return new Response("Server error", { status: 500 });
  }
}
