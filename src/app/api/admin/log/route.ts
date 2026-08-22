import { NextRequest, NextResponse } from "next/server";
import { isOwner } from "@/lib/auth/owner";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    if (!(await isOwner(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const { data, error } = await getAdminDb()
      .from("admin_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ logs: data ?? [] });
  } catch (e) {
    console.error("Admin log error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
