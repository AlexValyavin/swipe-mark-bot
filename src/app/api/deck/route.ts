import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAdminDb } from "@/lib/db/supabase";
import { cardToBookmark } from "@/lib/db/mappers";
import {
  loadFoldersForCards,
  loadAiFolderNames,
} from "@/lib/db/cards";
import { getTagsForCardIds } from "@/lib/db/tags";
import type { AttachmentRow, CardLinkRow, CardRow } from "@/lib/db/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const folderId = sp.get("folderId");
    const limRaw = Number(sp.get("limit") || 30);
    const lim = Number.isFinite(limRaw) ? Math.min(Math.max(limRaw, 1), 50) : 30;

    const db = getAdminDb();
    const { data, error } = await db.rpc("deck", {
      uid: userId,
      folder: folderId || null,
      tag: null,
      lim,
    });
    if (error) throw error;

    const cards = (data ?? []) as CardRow[];
    if (cards.length === 0) {
      return NextResponse.json({ bookmarks: [] });
    }

    const cardIds = cards.map((c) => c.id);
    const [attRes, linkRes, folderMap, tagsMap, aiFolderNames] = await Promise.all([
      db.from("attachments").select("*").in("card_id", cardIds),
      db.from("card_links").select("*").in("card_id", cardIds),
      loadFoldersForCards(cardIds),
      getTagsForCardIds(cardIds),
      loadAiFolderNames(cards),
    ]);

    const atts = new Map<string, AttachmentRow[]>();
    for (const a of (attRes.data ?? []) as AttachmentRow[]) {
      const list = atts.get(a.card_id) ?? [];
      list.push(a);
      atts.set(a.card_id, list);
    }
    const links = new Map<string, CardLinkRow[]>();
    for (const l of (linkRes.data ?? []) as CardLinkRow[]) {
      const list = links.get(l.card_id) ?? [];
      list.push(l);
      links.set(l.card_id, list);
    }

    return NextResponse.json({
      bookmarks: cards.map((c) =>
        cardToBookmark(
          c,
          atts.get(c.id) ?? [],
          links.get(c.id) ?? [],
          folderMap.get(c.id) ?? [],
          tagsMap.get(c.id) ?? [],
          aiFolderNames.get(c.ai_folder_id ?? "") ?? undefined
        )
      ),
    });
  } catch (e) {
    console.error("Deck error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}