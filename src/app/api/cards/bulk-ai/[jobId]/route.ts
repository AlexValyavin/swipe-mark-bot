import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getBulkJob, bulkJobStatusToClient } from "@/lib/db/jobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
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
    return NextResponse.json(bulkJobStatusToClient(job));
  } catch (e) {
    console.error("Bulk job status error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}