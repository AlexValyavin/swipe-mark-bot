import type { ParsedMeta } from "./shared";

function oembedUrl(url: string): string {
  const u = new URL("https://www.tiktok.com/oembed");
  u.searchParams.set("url", url);
  return u.toString();
}

/** TikTok: официальный oEmbed. */
export async function parseTiktok(url: string): Promise<ParsedMeta | null> {
  const meta: ParsedMeta = { provider: "tiktok" };
  try {
    const res = await fetch(oembedUrl(url), {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
      author_url?: string;
    };
    meta.title = data.title?.slice(0, 120) ?? undefined;
    meta.author = data.author_name ? `@${data.author_name}` : undefined;
    meta.image_url = data.thumbnail_url ?? undefined;
  } catch {
    return null;
  }
  if (!meta.title && !meta.image_url && !meta.author) return null;
  return meta;
}

export function isTiktokUrl(url: string): boolean {
  return /tiktok\.com\//i.test(url);
}