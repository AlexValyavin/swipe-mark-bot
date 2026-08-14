import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAdminDb } from "@/lib/db/supabase";
import { createCard, normalizeUrl } from "@/lib/db/cards";

export const runtime = "nodejs";
const MAX_URLS = 20;

function deriveTitle(url: string): string {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.replace(/\/$/, ""));
    const last = path.split("/").filter(Boolean).pop();
    if (last && !/^\d+$/.test(last) && last.length > 2) {
      return last.replace(/[-_]+/g, " ").slice(0, 120);
    }
    return u.hostname;
  } catch {
    return "Ссылка";
  }
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { urls?: unknown };
    const rawUrls = Array.isArray(body.urls)
      ? body.urls.filter((u): u is string => typeof u === "string" && u.length > 0)
      : [];
    const urls = rawUrls.slice(0, MAX_URLS).map((u) => normalizeUrl(u));
    if (urls.length === 0) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

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

    const created: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      if (known.has(url)) {
        duplicates.push(url);
        continue;
      }
      const cardId = await createCard(userId, {
        source_type: "link",
        primary_type: "link",
        source_url: url,
        canonical_url: url,
        domain: domainOf(url),
        title: deriveTitle(url),
      }, [], [{ url }]);
      known.add(url);
      created.push(cardId);
      // AI-обогащение в фоне, как в webhook.
      after(async () => {
        try {
          const { enrichCard } = await import("@/lib/ai/enrich");
          await enrichCard(userId, cardId);
        } catch (e) {
          console.error(`AI enrich error for card ${cardId}:`, e);
        }
      });
    }

    return NextResponse.json({ created, duplicates });
  } catch (e) {
    console.error("Create cards error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}