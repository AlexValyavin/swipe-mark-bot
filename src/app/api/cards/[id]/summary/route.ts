import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser } from "@/lib/db/cards";
import { generateCardSummary } from "@/lib/ai/enrich";

export const runtime = "nodejs";

/**
 * Генерирует саммари карточки на лету (BYOK). Кнопка «✨ Саммари» на карточке колоды.
 * Без подключённого AI-ключа — 400, чтобы UI прятал кнопку.
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

    const outcome = await generateCardSummary(userId, id);
    switch (outcome.status) {
      case "ok":
        return NextResponse.json({ ok: true, summary: outcome.summary });
      case "no_ai":
        return NextResponse.json({ error: "AI не подключён" }, { status: 400 });
      case "no_content":
        return NextResponse.json({ error: "Нечего саммарировать" }, { status: 422 });
      default:
        return NextResponse.json({ error: outcome.reason }, { status: 502 });
    }
  } catch (e) {
    console.error("Summary error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
