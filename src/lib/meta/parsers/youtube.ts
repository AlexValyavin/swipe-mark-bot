import type { ParsedMeta } from "./shared";
import { fetchHtml, BROWSER_UA } from "./shared";

function oembedUrl(url: string): string {
  const u = new URL("https://www.youtube.com/oembed");
  u.searchParams.set("url", url);
  u.searchParams.set("format", "json");
  return u.toString();
}

function videoIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/")) {
      return u.pathname.split("/")[2] ?? null;
    }
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

/**
 * Извлекает JSON объекта ytInitialPlayerResponse (может встречаться несколько раз;
 * берём блок с videoDetails). Баланс скобок — чтобы не обрезать вложенные объекты.
 */
function extractPlayerResponse(html: string): string | null {
  const marker = "ytInitialPlayerResponse";
  let idx = 0;
  while ((idx = html.indexOf(marker, idx)) !== -1) {
    const eq = html.indexOf("=", idx + marker.length);
    if (eq === -1) break;
    const brace = html.indexOf("{", eq);
    if (brace === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = brace; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      const jsonStr = html.slice(brace, end + 1);
      if (jsonStr.includes("videoDetails")) return jsonStr;
    }
    idx = eq + 1;
  }
  return null;
}

/**
 * YouTube: превью гарантировано через i.ytimg.com (videoId из URL);
 * title/author/длительность — oEmbed или парсинг страницы watch.
 */
export async function parseYoutube(url: string): Promise<ParsedMeta | null> {
  const meta: ParsedMeta = { provider: "youtube" };
  const videoId = videoIdFromUrl(url);
  if (!videoId) return null;

  // 1. Превью — всегда доступно.
  meta.image_url = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // 2. oEmbed (title/author) — если доступен.
  try {
    const res = await fetch(oembedUrl(url), {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
      };
      meta.title = data.title ?? undefined;
      meta.author = data.author_name ?? undefined;
    }
  } catch {
    // fallback на страницу
  }

  // 3. Страница watch: длительность + описание.
  const html = await fetchHtml(url, BROWSER_UA);
  if (html) {
    const length = /"lengthSeconds"\s*:\s*"(\d+)"/i.exec(html);
    if (length) meta.duration_seconds = Number(length[1]);

    const desc = /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
    if (desc && !meta.description) {
      meta.description = desc[1]
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .slice(0, 500);
    }

    // Title из <meta name="title"> (YouTube отдаёт пустой <title> ботоводам).
    if (!meta.title) {
      const metaTitle = /<meta[^>]+name=["']title["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
      if (metaTitle?.[1]) meta.title = metaTitle[1].slice(0, 120);
    }

    // JSON-фолбэк: ytInitialPlayerResponse.videoDetails (title/duration/description)
    // — доступен даже когда og-теги отсутствуют.
    if (!meta.title || !meta.duration_seconds || !meta.description) {
      const jsonStr = extractPlayerResponse(html);
      if (jsonStr) {
        try {
          const data = JSON.parse(jsonStr) as {
            videoDetails?: {
              title?: string;
              lengthSeconds?: string;
              shortDescription?: string;
              author?: string;
            };
          };
          const vd = data.videoDetails;
          if (vd) {
            if (!meta.title && vd.title) meta.title = vd.title.slice(0, 120);
            if (!meta.duration_seconds && vd.lengthSeconds) {
              const d = Number(vd.lengthSeconds);
              if (Number.isFinite(d) && d > 0) meta.duration_seconds = d;
            }
            if (!meta.description && vd.shortDescription) {
              meta.description = vd.shortDescription.slice(0, 500);
            }
            if (!meta.author && vd.author) meta.author = vd.author;
          }
        } catch {
          // невалидный JSON — игнорируем
        }
      }
    }
  }

  return meta;
}

export function isYoutubeUrl(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return (
    host === "www.youtube.com" ||
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be"
  );
}