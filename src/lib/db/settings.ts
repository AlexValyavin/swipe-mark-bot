import { getAdminDb } from "@/lib/db/supabase";

export async function getArchiveTtl(userId: string): Promise<number | null> {
  const { data } = await getAdminDb()
    .from("user_settings")
    .select("archive_ttl_hours")
    .eq("user_id", userId)
    .maybeSingle();
  return typeof data?.archive_ttl_hours === "number" ? data.archive_ttl_hours : null;
}

export async function setArchiveTtl(
  userId: string,
  archiveTtlHours: number | null
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getAdminDb()
    .from("user_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.data) {
    await getAdminDb()
      .from("user_settings")
      .update({ archive_ttl_hours: archiveTtlHours, updated_at: now })
      .eq("user_id", userId);
  } else {
    await getAdminDb()
      .from("user_settings")
      .insert({
        user_id: userId,
        ai_mode: "off",
        archive_ttl_hours: archiveTtlHours,
        updated_at: now,
      });
  }
}