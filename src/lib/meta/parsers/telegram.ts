import type { ParsedMeta } from "./shared";
import { parseMetaTags, fetchHtml, BROWSER_UA } from "./shared";

/**
 * Telegram (t.me/s/{channel}/{id}): страница канала — og:title (текст поста),
 * og:image, description.
 */
export async function parseTelegram(url: string): Promise<ParsedMeta | null> {
  const meta: ParsedMeta = { provider: "telegram" };
  const html = await fetchHtml(url, BROWSER_UA);
  if (html) {
    const tags = parseMetaTags(html);
    if (tags.title) meta.title = tags.title.slice(0, 120);
    if (tags.description) meta.description = tags.description;
    if (tags.image) meta.image_url = tags.image;
  }

  // Фолбэк: из URL берём канал (работает и при недоступной сети).
  if (!meta.title) {
    const m = /t\.me\/s\/([^/?#]+)/i.exec(url);
    if (m) meta.title = `Telegram • @${m[1]}`;
  }

  if (!meta.title && !meta.image_url) return null;
  return meta;
}

export function isTelegramUrl(url: string): boolean {
  return /t\.me\/s\//i.test(url);
}