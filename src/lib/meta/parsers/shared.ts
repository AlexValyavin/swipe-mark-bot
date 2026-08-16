export type ParsedMeta = {
  title?: string;
  description?: string;
  image_url?: string;
  duration_seconds?: number;
  author?: string;
  provider?: string;
};

export const HTML_FETCH_TIMEOUT_MS = 5_000;
export const MAX_RETRIES = 1;

/** Дёшевый извлекатель meta-тегов (без cheerio). */
export function parseMetaTags(html: string): {
  title: string | null;
  description: string | null;
  image: string | null;
  author: string | null;
} {
  const out = { title: null, description: null, image: null, author: null } as {
    title: string | null;
    description: string | null;
    image: string | null;
    author: string | null;
  };

  const ogTitle = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
  if (ogTitle) out.title = decode(ogTitle[1]);

  const ogDesc = /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
  if (ogDesc) out.description = decode(ogDesc[1]);

  const ogImage = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
  if (ogImage) out.image = decode(ogImage[1]);

  const ogAuthor = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
  void ogAuthor;

  // twitter:title как fallback для title
  if (!out.title) {
    const twTitle = /<meta[^>]+name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
    if (twTitle) out.title = decode(twTitle[1]);
  }
  // twitter:description как fallback
  if (!out.description) {
    const twDesc = /<meta[^>]+name=["']twitter:description["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
    if (twDesc) out.description = decode(twDesc[1]);
  }

  // <title> как последний fallback
  if (!out.title) {
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    if (title) out.title = decode(title[1]).trim();
  }

  return out;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    // Числовые сущности: &#1089; (десятичные) и &#x416; (шестнадцатеричные)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16))
    );
}

/** Загрузка HTML с браузерным UA и таймаутом, 1 ретрай. Возвращает HTML даже при 403 (часто есть og-теги). */
export async function fetchHtml(url: string, ua: string): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": ua },
        signal: AbortSignal.timeout(HTML_FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
      const text = await res.text();
      if (text.length > 0) return text;
    } catch {
      // retry
    }
  }
  return null;
}

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";