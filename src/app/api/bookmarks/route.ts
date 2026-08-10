import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { resolveFileUrl, isPlaceholderImage } from "@/lib/telegram-file";

export const runtime = "nodejs";

export interface Bookmark {
  id: string;
  userId: string;
  url?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  type?: string;
  caption?: string;
  fileId?: string;
  fileName?: string | null;
  videoUrl?: string;
  forwardUrl?: string;
  sourceType?: string;
  sourceUrl?: string | null;
  mediaGroupId?: string;
  mediaItems?: Array<{
    type: string;
    fileId?: string;
    imageUrl?: string;
    videoUrl?: string;
    fileName?: string | null;
  }>;
  status?: string;
  deferUntil?: string | null;
  previousStatus?: string | null;
  createdAt: string;
  domain?: string;
  swipedCount: number;
  readTimeMin: number;
  rightCount?: number;
}

export async function GET(req: NextRequest) {
  try {
    const userId = getSessionUser(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const snapshot = await adminDb
      .collection("bookmarks")
      .where("userId", "==", userId)
      .get();

    const settingsSnap = await adminDb.collection("settings").doc(userId).get();
    const settings = settingsSnap.exists
      ? (settingsSnap.data() as { archiveTtlHours?: number })
      : {};
    const ttlHours =
      typeof settings.archiveTtlHours === "number" ? settings.archiveTtlHours : null;

    const cutoff = ttlHours ? Date.now() - ttlHours * 60 * 60 * 1000 : null;

    const bookmarks: Bookmark[] = [];

    const token = process.env.TELEGRAM_BOT_TOKEN;

    const foldItem = async (item: Record<string, unknown>) => {
      const itemFileId = typeof item.fileId === "string" ? item.fileId : undefined;
      if (!itemFileId) return item;
      const itemImageUrl = typeof item.imageUrl === "string" ? item.imageUrl : undefined;
      if (!isPlaceholderImage(itemImageUrl)) return item;
      const resolved = await resolveFileUrl(itemFileId, token);
      if (!resolved) return item;
      const itemType = typeof item.type === "string" ? item.type : "";
      if (itemType === "video" && typeof item.videoUrl !== "string") {
        return { ...item, videoUrl: resolved };
      }
      return { ...item, imageUrl: resolved };
    };

    // Миграция старых карточек: placeholder-превью (https://via.placeholder.com/300)
    // и давно сохранённые fileId без /api/file URL. Самовосстанавливается при чтении:
    // недостающие imageUrl/videoUrl резолвятся из Telegram и фиксируются в Firestore,
    // чтобы карточки не ломались после обновления приложения.
    let repairedCount = 0;
    let failedRepairCount = 0;
    const repairs: Promise<unknown>[] = [];
    for (const doc of snapshot.docs) {
      const raw = doc.data() as Record<string, unknown>;
      const createdAt = new Date(typeof raw.createdAt === "string" ? raw.createdAt : 0).getTime();
      if (cutoff && raw.status === "archived" && createdAt && createdAt < cutoff) {
        await doc.ref.delete();
        continue;
      }

      const data = raw as Omit<Bookmark, "id">;
      const update: Record<string, string | import("firebase-admin/firestore").FieldValue> = {};
      let changed = false;

      const rootImageUrl = typeof data.imageUrl === "string" ? data.imageUrl : undefined;
      const rootFileId = typeof data.fileId === "string" ? data.fileId : undefined;
      if (rootFileId && isPlaceholderImage(rootImageUrl)) {
        const resolved = await resolveFileUrl(rootFileId, token);
        if (resolved) {
          data.imageUrl = resolved;
          update.imageUrl = resolved;
          changed = true;
        } else {
          failedRepairCount++;
          console.warn(
            `[bookmarks] repair failed fileId=${rootFileId} type=${data.type} url=${rootImageUrl ?? "none"}`
          );
        }
      }

      const items = Array.isArray(data.mediaItems)
        ? (data.mediaItems as Array<Record<string, unknown>>)
        : [];
      if (items.length > 0) {
        const resolvedItems = await Promise.all(items.map(foldItem));
        const anyFixed = resolvedItems.some((item, i) => item !== items[i]);
        if (anyFixed) {
          data.mediaItems = resolvedItems as Omit<Bookmark, "id">["mediaItems"];
          update.mediaItems = resolvedItems as unknown as import("firebase-admin/firestore").FieldValue;
          changed = true;
        }
      }

      if (changed) {
        repairedCount++;
        repairs.push(doc.ref.update(update).catch(() => {}));
      }

      bookmarks.push({ id: doc.id, ...data });
    }
    await Promise.all(repairs);
    if (repairedCount > 0 || failedRepairCount > 0) {
      console.log(
        `[bookmarks] migration userId=${userId} repaired=${repairedCount} failed=${failedRepairCount}`
      );
    }

    const result = bookmarks
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      )
      .slice(0, 50);

    return NextResponse.json({ bookmarks: result });
  } catch (e) {
    console.error("Bookmarks error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = getSessionUser(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const snapshot = await adminDb
      .collection("bookmarks")
      .where("userId", "==", userId)
      .get();

    let deleted = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (data.status === "archived") {
        await doc.ref.delete();
        deleted++;
      }
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    console.error("Bookmarks delete error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
