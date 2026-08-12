import { getAdminDb } from "@/lib/db/supabase";

export type SwipeActionName =
  | "left"
  | "right"
  | "done"
  | "open"
  | "undo"
  | "later";

export async function hasIdempotencyKey(
  idempotencyKey: string
): Promise<boolean> {
  const { data } = await getAdminDb()
    .from("swipe_actions")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return !!data;
}

export async function logAction(input: {
  userId: string;
  cardId: string;
  action: SwipeActionName;
  previousStatus?: string | null;
  idempotencyKey?: string | null;
}): Promise<void> {
  const { error } = await getAdminDb().from("swipe_actions").insert({
    user_id: input.userId,
    card_id: input.cardId,
    action: input.action,
    previous_status: input.previousStatus ?? null,
    idempotency_key: input.idempotencyKey ?? null,
  });
  if (error) throw error;
}

export async function countRightSwipes(cardId: string): Promise<number> {
  const { count, error } = await getAdminDb()
    .from("swipe_actions")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId)
    .eq("action", "right");
  if (error) throw error;
  return count ?? 0;
}

export async function getLatestStatusChange(
  cardId: string
): Promise<{ action: SwipeActionName; previous_status: string | null } | null> {
  const { data, error } = await getAdminDb()
    .from("swipe_actions")
    .select("action, previous_status")
    .eq("card_id", cardId)
    .in("action", ["left", "right", "done", "later", "undo"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    action: data.action as SwipeActionName,
    previous_status: data.previous_status,
  };
}