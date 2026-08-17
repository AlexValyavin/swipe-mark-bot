import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getBulkJob, updateBulkJob, bulkJobStatusToClient } from "@/lib/db/jobs";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { jobId } = await params;
    const job = await getBulkJob(userId, jobId);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (job.status === "running") {
      await updateBulkJob(job.id, { status: "cancelled" });
    }
    return NextResponse.json(bulkJobStatusToClient({ ...job, status: "cancelled" }));
  } catch (e) {
    console.error("Bulk job cancel error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}