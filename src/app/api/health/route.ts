import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await getAdminDb()
      .from("cards")
      .select("id")
      .limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, db: "up", row: data?.[0]?.id ?? null });
  } catch (e) {
    console.error("Health error:", e);
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}