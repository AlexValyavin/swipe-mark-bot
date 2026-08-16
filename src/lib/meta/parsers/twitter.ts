import type { ParsedMeta } from "./shared";

function oembedUrl(url: string): string {
  const u = new URL("https://publish.twitter.com/oembed");
  u.searchParams.set("url", url);
  return u.toString();
}

/**
 * X/Twitter: publish.twitter.com/oembed.
 * author_name — «Screen Name», html — текст твита (для title).
 */
export async function parseTwitter(url: string): Promise<ParsedMeta | null> {
  const meta: ParsedMeta = { provider: "twitter" };
  try {
    const res = await fetch(oembedUrl(url), {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      author_name?: string;
      html?: string;
    };
    meta.author = data.author_name ? `@${data.author_name}` : undefined;
    const text = data.html
      ? data.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "";
    if (text) meta.title = text.slice(0, 120);
  } catch {
    return null;
  }
  if (!meta.title && !meta.author) return null;
  return meta;
}

export function isTwitterUrl(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return host === "x.com" || host === "twitter.com";
}