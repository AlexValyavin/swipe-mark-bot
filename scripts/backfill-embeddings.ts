/**
 * Backfill эмбеддингов для карточек, где embedding ещё NULL.
 *
 * Использование:
 *   AI_EMBEDDING_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/backfill-embeddings.ts [--limit 200] [--force]
 *
 * Батчами по 50, идемпотентно: обрабатывает только embedding IS NULL
 * (--force пересчитывает все).
 */
import { createClient } from "@supabase/supabase-js";
import { embedCard } from "../src/lib/ai/embed";

const BATCH = 50;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");

  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit"));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const force = args.includes("--force");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Общий count
  let query = supabase.from("cards").select("id", { count: "exact", head: true });
  if (!force) query = query.is("embedding", null);
  const { count } = await query;
  console.log(`Карточек к обработке: ${count ?? 0}${force ? " (force)" : ""}`);

  let processed = 0;
  let embedded = 0;
  let skipped = 0;
  let lastId: string | null = null;

  while (processed < limit) {
    let batchQuery = supabase
      .from("cards")
      .select("id, user_id")
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (!force) batchQuery = batchQuery.is("embedding", null);
    if (lastId) batchQuery = batchQuery.gt("id", lastId);

    const { data: rows, error } = await batchQuery;
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const row of rows as { id: string; user_id: string }[]) {
      if (processed >= limit) break;
      const ok = await embedCard(row.user_id, row.id, force);
      if (ok) embedded++;
      else skipped++;
      processed++;
      lastId = row.id;
      if (processed % 25 === 0) {
        console.log(`Прогресс: ${processed} (эмбеддировано ${embedded}, пропущено ${skipped})`);
      }
    }
    if (rows.length < BATCH) break;
  }

  console.log(`Готово. Обработано ${processed}: эмбеддировано ${embedded}, пропущено (нет текста/ошибка/уже есть) ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
