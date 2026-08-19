import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  getArchiveTtl,
  setArchiveTtl,
  getUiScale,
  setUiScale,
  getOnboarded,
  setOnboarded,
  getLang,
  setLang,
  isUiScale,
  isAppLang,
} from "@/lib/db/settings";

export const runtime = "nodejs";

const ALLOWED_TTL: number[] = [24, 168, 720];

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [archiveTtlHours, uiScale, onboarded, lang] = await Promise.all([
      getArchiveTtl(userId),
      getUiScale(userId),
      getOnboarded(userId),
      getLang(userId),
    ]);

    return NextResponse.json({ archiveTtlHours, uiScale, onboarded, lang });
  } catch (e) {
    console.error("Settings error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      archiveTtlHours?: number | null;
      uiScale?: string;
      onboarded?: boolean;
      lang?: string;
    };
    const ttl = body.archiveTtlHours ?? null;

    if (ttl !== null && !ALLOWED_TTL.includes(ttl)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    await setArchiveTtl(userId, ttl);

    if (body.uiScale !== undefined) {
      if (!isUiScale(body.uiScale)) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
      }
      await setUiScale(userId, body.uiScale);
    }

    if (body.onboarded !== undefined) {
      await setOnboarded(userId, body.onboarded === true);
    }

    if (body.lang !== undefined) {
      if (!isAppLang(body.lang)) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
      }
      await setLang(userId, body.lang);
    }

    return NextResponse.json({
      ok: true,
      archiveTtlHours: ttl,
      uiScale: body.uiScale ?? (await getUiScale(userId)),
      onboarded: body.onboarded ?? (await getOnboarded(userId)),
      lang: body.lang ?? (await getLang(userId)),
    });
  } catch (e) {
    console.error("Settings error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}