import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAiQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";

/** Остаток AI-квоты текущего пользователя (для UI: AutosortSheet, кнопка «Кратко»). */
export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const quota = await getAiQuota(userId);
    return NextResponse.json(quota);
  } catch (e) {
    console.error("AI quota error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
