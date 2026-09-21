/**
 * Детерминированная оценка времени потребления карточки (минуты).
 * Используется при создании карточки (колонка `estimated_minutes`) и как fallback.
 * Никаких LLM — только эвристики из ТЗ «Есть 10 минут?» (§5):
 * - видео с известной длительностью → ceil(duration/60);
 * - статья/текст → слова / 200 wpm;
 * - фото → 2 мин;
 * - видео без duration и короткие тексты → null (неизвестно).
 */

export type EstimateInput = {
  title?: string | null;
  text?: string | null;
  description?: string | null;
  durationSeconds?: number | null;
  /** source_type / primary_type: photo, video, animation, link, note, forwarded, document */
  kind?: string | null;
};

export const WORDS_PER_MINUTE = 200;
export const MIN_WORDS_FOR_ESTIMATE = 40;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateMinutes(input: EstimateInput): number | null {
  const dur = input.durationSeconds;
  if (dur != null && Number.isFinite(dur) && dur > 0) {
    return Math.max(1, Math.ceil(dur / 60));
  }
  const kind = (input.kind ?? "").toLowerCase();
  if (kind === "photo" || kind === "image") return 2;
  // Видео без duration — неизвестно, не гадаем.
  if (kind === "video" || kind === "animation") return null;
  const content = [input.description, input.text, input.title]
    .filter(Boolean)
    .join(" ");
  if (!content.trim()) return null;
  const words = countWords(content);
  if (words < MIN_WORDS_FOR_ESTIMATE) return null;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
