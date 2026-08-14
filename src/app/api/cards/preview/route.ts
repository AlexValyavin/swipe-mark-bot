import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAdminDb } from "@/lib/db/supabase";
import { normalizeUrl } from "@/lib/db/cards";

export const runtime = "nodejs";
const MAX_LINKS = 20;

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text.match(urlRegex) ?? [];
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input : "";
    const urls = extractUrls(input).slice(0, MAX_LINKS);
    if (urls.length === 0) {
      return NextResponse.json({ links: [] });
    }

    // Все canonical_url и card_links текущего пользователя для дедупликации.
    const db = getAdminDb();
    const [cardsRes, linksRes] = await Promise.all([
      db.from("cards").select("canonical_url").eq("user_id", userId).not("canonical_url", "is", null),
      db.from("card_links").select("url").in(
        "card_id",
        (await db.from("cards").select("id").eq("user_id", userId)).data?.map((c) => c.id) ?? []
      ),
    ]);

    const known = new Set<string>();
    for (const c of (cardsRes.data ?? []) as Array<{ canonical_url: string | null }>) {
      if (c.canonical_url) known.add(normalizeUrl(c.canonical_url));
    }
    for (const l of (linksRes.data ?? []) as Array<{ url: string }>) {
      known.add(normalizeUrl(l.url));
    }

    const seen = new Set<string>();
    const links = [];
    for (const raw of urls) {
      const url = normalizeUrl(raw);
      if (seen.has(url)) continue;
      seen.add(url);
      links.push({
        url,
        type: /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url) ? "image" : "link",
        duplicate: known.has(url),
      });
    }

    return NextResponse.json({ links });
  } catch (e) {
    console.error("Preview error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}