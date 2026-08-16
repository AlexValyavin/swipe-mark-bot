import type { ParsedMeta } from "./shared";
import { parseMetaTags, fetchHtml } from "./shared";

const FACEBOOK_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

function usernameFromUrl(url: string): string | null {
  const m = /instagram\.com\/([^/?#]+)/i.exec(url);
  return m?.[1] ?? null;
}

/**
 * Instagram (p/reel/tv): запрос с UA facebookexternalhit → OG-теги.
 * Фолбэк — заглушка «Instagram • @username» из URL (без сети).
 */
export async function parseInstagram(url: string): Promise<ParsedMeta | null> {
  const meta: ParsedMeta = { provider: "instagram" };

  const html = await fetchHtml(url, FACEBOOK_UA);
  if (html) {
    const tags = parseMetaTags(html);
    if (tags.title) {
      meta.title = tags.title.slice(0, 120);
    }
    if (tags.description) meta.description = tags.description;
    if (tags.image) meta.image_url = tags.image;
  }

  if (!meta.title && !meta.image_url) {
    const username = usernameFromUrl(url);
    if (username) {
      meta.title = `Instagram • @${username}`;
      return meta;
    }
  }

  if (!meta.title && !meta.image_url) return null;
  return meta;
}

export function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}