import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser } from "@/lib/db/cards";
import { setCardMetaStatus } from "@/lib/db/meta";

export const runtime = "nodejs";

/**
 * Повторное извлечение метаданных для карточки.
 * Шаг 0: заглушка — сбрасывает статус на pending (реальный парсинг появится в Шаге 2).
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

    await setCardMetaStatus(id, "pending", null);

    return NextResponse.json({ ok: true, cardId: id, metaStatus: "pending" });
  } catch (e) {
    console.error("Refetch error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
