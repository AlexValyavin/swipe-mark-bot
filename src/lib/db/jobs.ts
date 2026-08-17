import { getAdminDb } from "@/lib/db/supabase";
import type { BulkJobRow } from "@/lib/db/types";

export type BulkJobStatus = "running" | "done" | "error" | "cancelled";

export async function createBulkJob(userId: string, total: number, kind = "autosort"): Promise<BulkJobRow> {
  const { data, error } = await getAdminDb()
    .from("bulk_jobs")
    .insert({ user_id: userId, kind, total, done: 0, failed: 0, status: "running" })
    .select()
    .single();
  if (error) throw error;
  return data as BulkJobRow;
}

export async function getBulkJob(userId: string, jobId: string): Promise<BulkJobRow | null> {
  const { data, error } = await getAdminDb()
    .from("bulk_jobs")
    .select()
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as BulkJobRow | null) ?? null;
}

export async function updateBulkJob(
  jobId: string,
  patch: Partial<Pick<BulkJobRow, "done" | "failed" | "status">>
): Promise<void> {
  const { error } = await getAdminDb()
    .from("bulk_jobs")
    .update(patch)
    .eq("id", jobId);
  if (error) throw error;
}

export function bulkJobStatusToClient(job: BulkJobRow) {
  return {
    jobId: job.id,
    status: job.status as BulkJobStatus,
    total: job.total,
    done: job.done,
    failed: job.failed,
  };
}