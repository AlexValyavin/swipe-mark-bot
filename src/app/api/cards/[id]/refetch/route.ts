import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser } from "@/lib/db/cards";
import { enrichCardMeta } from "@/lib/meta/enrich";

export const runtime = "nodejs";

/**
 * Повторное извлечение метаданных для карточки (реальный парсинг).
 * Запускается вручную из «Диагностики» (владелец) и автоматически для failed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const card = await getForUser(userId, id);
    if (!card) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const outcome = await enrichCardMeta(userId, id);

    return NextResponse.json({
      ok: true,
      cardId: id,
      metaStatus: outcome.status === "done" ? "done" : "failed",
    });
  } catch (e) {
    console.error("Refetch error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}