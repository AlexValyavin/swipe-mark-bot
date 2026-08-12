/**
 * Перенос данных из Firestore в Supabase (Этап 0).
 *
 * Читает коллекции legacy-бэкенда SwipeMark (users?, bookmarks, settings,
 * swipe_actions) через firebase-admin и пишет в Supabase: profiles,
 * user_settings, cards, attachments, card_links, swipe_actions.
 *
 * Идемпотентность: маппинг старых id → новых прогрессивно дописывается в
 * migration_log.json (в репо, не в БД). Повторный прогон пропускает уже
 * перенесённые документы.
 *
 * Режимы:
 *   tsx scripts/migrate-firestore.ts            — боевой прогон
 *   tsx scripts/migrate-firestore.ts --dry-run  — только чтение + счёт, без записи
 *
 * Env (.env.local): FIREBASE_SERVICE_ACCOUNT_KEY, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// ── env ────────────────────────────────────────────────────────────
for (const file of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const DRY_RUN = process.argv.includes("--dry-run");
const LOG_FILE = resolve(process.cwd(), "migration_log.json");

type MigrationLog = {
  profiles: Record<string, string>; // "tg:<id>" | email -> profile.id
  cards: Record<string, string>; // firestore doc id -> card uuid
};

function log(): MigrationLog {
  try {
    return JSON.parse(readFileSync(LOG_FILE, "utf8")) as MigrationLog;
  } catch {
    return { profiles: {}, cards: {} };
  }
}

function saveLog(l: MigrationLog) {
  if (DRY_RUN) return;
  writeFileSync(LOG_FILE, JSON.stringify(l, null, 2), "utf8");
}

// ── types ──────────────────────────────────────────────────────────
const TELEGRAM_ID_RE = /^tg:(\d+)$/;

type OldBookmark = {
  userId?: unknown;
  createdAt?: unknown;
  title?: unknown;
  url?: unknown;
  type?: unknown;
  status?: unknown;
  sourceType?: unknown;
  mediaGroupId?: unknown;
  domain?: unknown;
  fileId?: unknown;
  fileName?: unknown;
  imageUrl?: unknown;
  videoUrl?: unknown;
  forwardUrl?: unknown;
  description?: unknown;
  deferUntil?: unknown;
  previousStatus?: unknown;
  sourceChatId?: unknown;
  sourceMessageId?: unknown;
  sourceChatUsername?: unknown;
  sourceChatTitle?: unknown;
  sourceUrl?: unknown;
  mediaItems?: unknown;
  rightCount?: unknown;
};

type OldMediaItem = {
  type?: unknown;
  fileId?: unknown;
  imageUrl?: unknown;
  videoUrl?: unknown;
  fileName?: unknown;
};

type OldSwipeAction = {
  userId?: unknown;
  cardId?: unknown;
  action?: unknown;
  previousStatus?: unknown;
  idempotencyKey?: unknown;
  createdAt?: unknown;
};

let supabase: SupabaseClient;
let firestore: Firestore;
let processed = 0;
let failed = 0;
const failures: string[] = [];

function init() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not set");
  const serviceAccount = JSON.parse(key);
  if (getApps().length === 0) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  firestore = getFirestore();
}

// ── helpers ────────────────────────────────────────────────────────
function str(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v.slice(0, 2000);
  return null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function telegramIdFrom(userId: unknown): number | null {
  if (typeof userId !== "string") return null;
  const m = TELEGRAM_ID_RE.exec(userId);
  return m ? Number(m[1]) : null;
}

// Firestore Timestamp / Date string / epoch → ISO
function toIso(v: unknown): string | null {
  if (v && typeof v === "object" && "toDate" in v) {
    const d = (v as { toDate(): Date }).toDate();
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function mapType(type: string | null | undefined): {
  source_type: string;
  primary_type: string;
} {
  switch (type) {
    case "photo":
      return { source_type: "photo", primary_type: "photo" };
    case "video":
      return { source_type: "video", primary_type: "video" };
    case "animation":
      return { source_type: "video", primary_type: "animation" };
    case "document":
      return { source_type: "note", primary_type: "document" };
    case "link":
      return { source_type: "link", primary_type: "link" };
    case "forward":
      return { source_type: "forwarded", primary_type: "forwarded" };
    case "album":
      return { source_type: "album", primary_type: "photo" };
    default:
      return { source_type: "note", primary_type: "note" };
  }
}

function isWebUrl(v: unknown): v is string {
  return (
    typeof v === "string" &&
    (v.startsWith("https://") ||
      v.startsWith("http://") ||
      v.startsWith("/api/"))
  );
}

async function upsertProfile(
  key: string,
  telegramId: number | null,
  email: string | null,
  username: string | null
): Promise<string | null> {
  const logFile = log();
  const existingId = logFile.profiles[key];
  if (existingId) return existingId;

  if (telegramId != null) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, telegram_username")
      .eq("telegram_id", telegramId)
      .maybeSingle();
    if (existing) {
      logFile.profiles[key] = existing.id;
      saveLog(logFile);
      return existing.id;
    }
  }
  if (email) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      logFile.profiles[key] = existing.id;
      saveLog(logFile);
      return existing.id;
    }
  }

  if (DRY_RUN) return telegramId ? `dry-profile-${telegramId}` : null;

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      telegram_id: telegramId,
      telegram_username: username,
      display_name: username ?? email ?? `tg${telegramId ?? ""}`,
      email,
    })
    .select("id")
    .single();
  if (error) {
    failures.push(`profile ${key}: ${error.message}`);
    failed++;
    return null;
  }
  logFile.profiles[key] = data.id;
  processed++;
  saveLog(logFile);
  return data.id;
}

// ── bookmarks ──────────────────────────────────────────────────────
async function migrateBookmarks() {
  const snapshot = await firestore.collection("bookmarks").get();
  console.log(`[bookmarks] found ${snapshot.size}`);
  const map = log();

  for (const doc of snapshot.docs) {
    const oldId = doc.id;
    if (map.cards[oldId]) continue; // уже перенесён

    const old = doc.data() as OldBookmark;
    const telegramId = telegramIdFrom(old.userId);
    if (!telegramId) {
      failures.push(`bookmark ${oldId}: unknown userId ${String(old.userId)}`);
      failed++;
      continue;
    }
    const createdAt = toIso(old.createdAt);
    if (!createdAt) {
      failures.push(`bookmark ${oldId}: missing createdAt`);
      failed++;
      continue;
    }

    const adminDbIsDry = DRY_RUN;
    const profileId = await upsertProfile(
      `tg:${telegramId}`,
      telegramId,
      null,
      str(old.sourceChatUsername)
    );
    if (!profileId && !adminDbIsDry) {
      // failure уже залогирован
      continue;
    }
    if (DRY_RUN && profileId == null) continue;

    const { source_type, primary_type } = mapType(str(old.type));
    const mediaGroupId = str(old.mediaGroupId);
    const status = str(old.status) ?? "new";

    // Проверка (не в dry-run, но уже перенесённой по mediaGroupId)
    if (!DRY_RUN && mediaGroupId) {
      const { data: exists } = await supabase
        .from("cards")
        .select("id")
        .eq("user_id", profileId)
        .eq("media_group_id", mediaGroupId)
        .maybeSingle();
      if (exists) {
        map.cards[oldId] = exists.id;
        saveLog(map);
        continue;
      }
    }

    const oldItems = Array.isArray(old.mediaItems)
      ? (old.mediaItems as OldMediaItem[])
      : [];
    const topFileId = str(old.fileId);

    const atts: Array<{
      type: string;
      telegram_file_id: string | null;
      thumbnail_file_id: string | null;
      file_name: string | null;
    }> = oldItems.map((item) => {
      const t = str(item.type) ?? "photo";
      return {
        type: t,
        telegram_file_id: str(item.fileId),
        thumbnail_file_id: null,
        file_name: str(item.fileName),
      };
    });

    if (topFileId && !atts.some((a) => a.telegram_file_id === topFileId)) {
      const t = str(old.type);
      atts.push({
        type:
          t === "video" || t === "animation"
            ? "video"
            : t === "document"
              ? "document"
              : "photo",
        telegram_file_id: topFileId,
        thumbnail_file_id: null,
        file_name: str(old.fileName),
      });
    }

    const imageUrl = isWebUrl(old.imageUrl) ? old.imageUrl : null;
    const baseUrl = str(old.url) ?? str(old.sourceUrl);

    const links: Array<{
      url: string;
      og_title: string | null;
      og_description: string | null;
      og_image_url: string | null;
    }> = [];
    if (baseUrl) {
      links.push({
        url: baseUrl,
        og_title: str(old.title),
        og_description: str(old.description),
        og_image_url: imageUrl,
      });
    }

    const cardInput: Record<string, unknown> = {
      user_id: profileId,
      source_type,
      primary_type,
      source_url: baseUrl,
      canonical_url: null,
      domain: str(old.domain) ?? null,
      source_chat_id: numberOrNull(old.sourceChatId),
      source_message_id: numberOrNull(old.sourceMessageId),
      telegram_message_id: null,
      media_group_id: mediaGroupId,
      title: str(old.title),
      text: str(old.description) ?? null,
      image_url: imageUrl,
      duration_seconds: null,
      estimated_minutes: null,
      status,
      defer_until: toIso(old.deferUntil) ?? null,
      archived_at: status === "archived" ? createdAt : null,
    };

    if (DRY_RUN) {
      processed++;
      map.cards[oldId] = "dry-run";
      console.log(`  [dry] ${oldId} → ${source_type}/${status} att=${atts.length}`);
      continue;
    }

    const { data: cardData, error: cardError } = await supabase
      .from("cards")
      .insert(cardInput)
      .select("id")
      .single();
    if (cardError) {
      failures.push(`bookmark ${oldId}: ${cardError.message}`);
      failed++;
      continue;
    }
    const cardId = cardData.id;

    const attRows =
      atts.length > 0
        ? atts.map((a) => ({ ...a, card_id: cardId }))
        : [];
    if (attRows.length > 0) {
      const { error: aErr } = await supabase.from("attachments").insert(attRows);
      if (aErr) {
        failures.push(`attachments ${oldId}: ${aErr.message}`);
        failed++;
      }
    }
    if (links.length > 0) {
      const { error: lErr } = await supabase
        .from("card_links")
        .insert(links.map((l) => ({ ...l, card_id: cardId })));
      if (lErr) {
        failures.push(`card_links ${oldId}: ${lErr.message}`);
        failed++;
      }
    }

    map.cards[oldId] = cardId;
    processed++;
    saveLog(map);
  }
  console.log(`[bookmarks] processed=${processed} failed=${failed}`);
}

// ── users → profiles (email/telegram) ──────────────────────────────
async function migrateUsers() {
  const snapshot = await firestore.collection("users").get();
  console.log(`[users] found ${snapshot.size}`);
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const email = str(data?.email);
    const tg = telegramIdFrom(data?.telegramUserId ?? data?.userId);
    const username = str(data?.telegramUsername);
    const key = email ?? (tg ? `tg:${tg}` : doc.id);
    await upsertProfile(key, tg, email, username);
  }
}

// ── settings ───────────────────────────────────────────────────────
async function migrateSettings() {
  const snapshot = await firestore.collection("settings").get();
  let created = 0;
  for (const doc of snapshot.docs) {
    const old = doc.data() as { archiveTtlHours?: unknown; userId?: unknown };
    const telegramId = telegramIdFrom(old.userId ?? doc.id);
    if (!telegramId) continue;
    const profileId = await upsertProfile(`tg:${telegramId}`, telegramId, null, null);
    if (!profileId) continue;
    const ttl = numberOrNull(old.archiveTtlHours);
    if (DRY_RUN) {
      created++;
      continue;
    }
    const { data: exists } = await supabase
      .from("user_settings")
      .select("user_id")
      .eq("user_id", profileId)
      .maybeSingle();
    if (exists) {
      await supabase
        .from("user_settings")
        .update({ archive_ttl_hours: ttl })
        .eq("user_id", profileId);
    } else {
      await supabase.from("user_settings").insert({
        user_id: profileId,
        archive_ttl_hours: ttl,
      });
    }
    created++;
  }
  console.log(`[settings] processed=${created}`);
}

// ── swipe_actions ──────────────────────────────────────────────────
async function migrateSwipeActions() {
  const snapshot = await firestore.collection("swipe_actions").get();
  let created = 0;
  for (const doc of snapshot.docs) {
    const old = doc.data() as OldSwipeAction;
    const telegramId = telegramIdFrom(old.userId);
    if (!telegramId) continue;
    const profileId = await upsertProfile(`tg:${telegramId}`, telegramId, null, null);
    const cardId = str(old.cardId);
    if (!profileId || !cardId) continue;
    // карточка уже перенесена?
    const targetCard = log().cards[cardId];
    const action = str(old.action);
    if (!action || (!targetCard && !DRY_RUN)) continue;
    if (DRY_RUN) {
      created++;
      continue;
    }
    const { error } = await supabase.from("swipe_actions").insert({
      user_id: profileId,
      card_id: targetCard,
      action,
      previous_status: str(old.previousStatus) ?? null,
      idempotency_key: str(old.idempotencyKey) ?? null,
      created_at: toIso(old.createdAt) ?? new Date().toISOString(),
    });
    if (error) {
      failures.push(`swipe_action ${doc.id}: ${error.message}`);
      failed++;
      continue;
    }
    created++;
  }
  console.log(`[swipe_actions] processed=${created} failed(total)=${failed}`);
}

async function main() {
  init();
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== MIGRATE ===");
  try {
    await migrateUsers();
  } catch (e) {
    console.warn(`[users] collection skipped: ${(e as Error).message}`);
  }
  await migrateBookmarks();
  await migrateSettings();
  await migrateSwipeActions();

  console.log(
    `\nResult: processed=${processed} failed=${failed}\n` +
      (DRY_RUN ? "" : `log: ${LOG_FILE}`)
  );
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures.slice(0, 50)) console.log("  - " + f);
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});