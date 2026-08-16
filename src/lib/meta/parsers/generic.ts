import type { ParsedMeta } from "./shared";
import { parseMetaTags, fetchHtml, BROWSER_UA } from "./shared";

/**
 * Generic: браузерный UA → OG + twitter cards + <title>.
 */
export async function parseGeneric(url: string): Promise<ParsedMeta | null> {
  const meta: ParsedMeta = { provider: "generic" };
  const html = await fetchHtml(url, BROWSER_UA);
  if (!html) return null;

  const tags = parseMetaTags(html);
  if (tags.title) meta.title = tags.title.slice(0, 120);
  if (tags.description) meta.description = tags.description;
  if (tags.image) meta.image_url = tags.image;

  if (!meta.title && !meta.description && !meta.image_url) return null;
  return meta;
}