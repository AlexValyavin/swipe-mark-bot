import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listForLibrary, type LibraryQuery } from "@/lib/db/cards";
import { listFolders } from "@/lib/db/folders";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

type Counts = {
  inDeck: number;
  readLater: number;
  archived: number;
  unsorted: number;
};

async function getCounts(userId: string): Promise<Counts> {
  const db = getAdminDb();
  // RPC из схемы этапа 0; если не создана — считаем в коде.
  try {
    const { data, error } = await db.rpc("counts", { uid: userId });
    if (!error && data) {
      return {
        inDeck: Number(data.in_deck ?? 0),
        readLater: Number(data.read_later ?? 0),
        archived: Number(data.archived ?? 0),
        unsorted: Number(data.unsorted ?? 0),
      };
    }
  } catch {
    // fallback ниже
  }

  const { count: inDeck } = await db
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["new", "later"]);
  const { count: readLater } = await db
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "later");
  const { count: archived } = await db
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "archived");
  return {
    inDeck: inDeck ?? 0,
    readLater: readLater ?? 0,
    archived: archived ?? 0,
    unsorted: 0,
  };
}

const TABS: Record<string, string[]> = {
  deck: ["new", "later"],
  later: ["later"],
  archive: ["archived"],
};

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const tabRaw = sp.get("tab") || "deck";
    const statuses = TABS[tabRaw] ?? TABS.deck;
    const folderId = sp.get("folderId");
    const q = sp.get("q");
    const sort = sp.get("sort") === "oldest" ? "oldest" : "newest";
    const limit = Number(sp.get("limit") || 50);
    const before = sp.get("cursor");

    const query: LibraryQuery = {
      statuses,
      folderId: folderId || null,
      q: q || null,
      sort,
      limit: Number.isFinite(limit) ? limit : 50,
      before: before || null,
    };

    const [bookmarks, folders, counts] = await Promise.all([
      listForLibrary(userId, query),
      listFolders(userId),
      getCounts(userId),
    ]);

    return NextResponse.json({
      bookmarks,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        emoji: f.emoji,
        count: f.count,
        sortOrder: f.sort_order,
      })),
      counts,
      hasMore: bookmarks.length >= (Number.isFinite(limit) ? limit : 50),
    });
  } catch (e) {
    console.error("Library error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}