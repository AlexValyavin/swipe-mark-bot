import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYoutube } from "../src/lib/meta/parsers/youtube";
import { parseInstagram } from "../src/lib/meta/parsers/instagram";
import { parseTiktok } from "../src/lib/meta/parsers/tiktok";
import { parseTwitter } from "../src/lib/meta/parsers/twitter";
import { parseTelegram } from "../src/lib/meta/parsers/telegram";
import { parseGeneric } from "../src/lib/meta/parsers/generic";
import { parseUrl, providerForUrl, type Provider } from "../src/lib/meta/parsers";

/** Простой Response-объект (достаточно ok/status/text). */
function res(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

/** Замокать global.fetch так, чтобы вернуть ответ по подстроке URL. */
function mockFetch(routes: Array<[string, Response]>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [needle, response] of routes) {
      if (url.includes(needle)) return response;
    }
    throw new Error(`fetch not mocked: ${url}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("youtube: oEmbed 200 → title/author, превью i.ytimg.com", async () => {
  const restore = mockFetch([
    [
      "youtube.com/oembed",
      res(JSON.stringify({ title: "Как устроен TCP", author_name: "Рик" })),
    ],
  ]);
  try {
    const meta = await parseYoutube("https://www.youtube.com/watch?v=abc123");
    assert.equal(meta?.provider, "youtube");
    assert.equal(meta?.title, "Как устроен TCP");
    assert.equal(meta?.author, "Рик");
    assert.equal(meta?.image_url, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
  } finally {
    restore();
  }
});

test("youtube: oEmbed 404 → превью гарантировано, title из <meta name=title>", async () => {
  const restore = mockFetch([
    ["youtube.com/oembed", res("Not Found", 404)],
    ["youtu.be", res('<html><head><meta name="title" content="Видео про сети"></head></html>')],
  ]);
  try {
    const meta = await parseYoutube("https://youtu.be/abc123");
    assert.equal(meta?.provider, "youtube");
    assert.equal(meta?.image_url, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
    assert.equal(meta?.title, "Видео про сети");
  } finally {
    restore();
  }
});

test("youtube: lengthSeconds со страницы watch → duration_seconds", async () => {
  const restore = mockFetch([
    ["youtube.com/oembed", res("Not Found", 404)],
    [
      "youtube.com/watch",
      res('<html><head><script>"lengthSeconds":"754"</script></head></html>'),
    ],
  ]);
  try {
    const meta = await parseYoutube("https://www.youtube.com/watch?v=abc123");
    assert.equal(meta?.duration_seconds, 754);
  } finally {
    restore();
  }
});

test("youtube: невалидный URL без videoId → null", async () => {
  const restore = mockFetch([]);
  try {
    const meta = await parseYoutube("https://youtube.com/");
    assert.equal(meta, null);
  } finally {
    restore();
  }
});

test("instagram: UA facebookexternalhit + OG → title и cdninstagram image", async () => {
  const restore = mockFetch([
    [
      "instagram.com/p/",
      res('<html><head><meta property="og:title" content="1,234 likes — пост">'
        + '<meta property="og:image" content="https://scontent.cdninstagram.com/v/x.jpg"></head></html>'),
    ],
  ]);
  try {
    const meta = await parseInstagram("https://www.instagram.com/p/abc/");
    assert.equal(meta?.provider, "instagram");
    assert.ok(meta?.title ?? "".includes("1,234 likes"));
    assert.match(meta?.image_url ?? "", /cdninstagram/);
  } finally {
    restore();
  }
});

test("instagram: сеть недоступна → фолбэк «Instagram • @username» из URL", async () => {
  const restore = mockFetch([]);
  try {
    const meta = await parseInstagram("https://www.instagram.com/reel/xyz/");
    assert.equal(meta?.provider, "instagram");
    assert.equal(meta?.title, "Instagram • @reel");
    assert.equal(meta?.image_url, undefined);
  } finally {
    restore();
  }
});

test("tiktok: oEmbed → title, author @username, thumbnail", async () => {
  const restore = mockFetch([
    [
      "tiktok.com/oembed",
      res(JSON.stringify({
        title: "Video title from TikTok",
        author_name: "username",
        thumbnail_url: "https://p16-sign.tiktokcdn.com/tos/thumb.jpg",
      })),
    ],
  ]);
  try {
    const meta = await parseTiktok("https://www.tiktok.com/@u/video/123");
    assert.equal(meta?.provider, "tiktok");
    assert.equal(meta?.title, "Video title from TikTok");
    assert.equal(meta?.author, "@username");
    assert.match(meta?.image_url ?? "", /tiktokcdn/);
  } finally {
    restore();
  }
});

test("tiktok: oEmbed 404 → null (без роняющего fetch)", async () => {
  const restore = mockFetch([["tiktok.com/oembed", res("nf", 404)]]);
  try {
    const meta = await parseTiktok("https://www.tiktok.com/@u/video/123");
    assert.equal(meta, null);
  } finally {
    restore();
  }
});

test("twitter: oEmbed → author @name + текст твита как title (≤120)", async () => {
  const restore = mockFetch([
    [
      "publish.twitter.com/oembed",
      res(JSON.stringify({
        author_name: "elonmusk",
        html: "<blockquote>Первый полёт на Марс уже близко — и это не шутка.</blockquote>",
      })),
    ],
  ]);
  try {
    const meta = await parseTwitter("https://x.com/elonmusk/status/123");
    assert.equal(meta?.provider, "twitter");
    assert.equal(meta?.author, "@elonmusk");
    assert.equal(meta?.title, "Первый полёт на Марс уже близко — и это не шутка.");
  } finally {
    restore();
  }
});

test("twitter: длинный текст обрезается до 120 символов", async () => {
  const long = "т".repeat(300);
  const restore = mockFetch([
    [
      "publish.twitter.com/oembed",
      res(JSON.stringify({ author_name: "a", html: `<blockquote>${long}</blockquote>` })),
    ],
  ]);
  try {
    const meta = await parseTwitter("https://twitter.com/a/status/1");
    assert.ok((meta?.title?.length ?? 0) <= 120);
  } finally {
    restore();
  }
});

test("twitter: oEmbed 404 → null", async () => {
  const restore = mockFetch([["publish.twitter.com/oembed", res("nf", 404)]]);
  try {
    const meta = await parseTwitter("https://x.com/a/status/1");
    assert.equal(meta, null);
  } finally {
    restore();
  }
});

test("telegram: страница t.me/s/ → og:title как текст поста", async () => {
  const restore = mockFetch([
    [
      "t.me/s/",
      res('<html><head><meta property="og:title" content="Сегодня вышло обновление.">'
        + '<meta property="og:image" content="https://cdn.t.me/photo.jpg"></head></html>'),
    ],
  ]);
  try {
    const meta = await parseTelegram("https://t.me/s/channel/42");
    assert.equal(meta?.provider, "telegram");
    assert.equal(meta?.title, "Сегодня вышло обновление.");
    assert.match(meta?.image_url ?? "", /cdn\.t\.me/);
  } finally {
    restore();
  }
});

test("telegram: сеть недоступна → фолбэк «Telegram • @channel»", async () => {
  const restore = mockFetch([]);
  try {
    const meta = await parseTelegram("https://t.me/s/somechannel/1");
    assert.equal(meta?.provider, "telegram");
    assert.equal(meta?.title, "Telegram • @somechannel");
  } finally {
    restore();
  }
});

test("generic: OG + twitter cards + <title>", async () => {
  const restore = mockFetch([
    [
      "habr.com",
      res('<html><head><meta property="og:title" content="Как мы переехали">'
        + '<meta property="og:description" content="История миграции.">'
        + '<meta property="og:image" content="https://habr.com/img/cover.png"></head></html>'),
    ],
  ]);
  try {
    const meta = await parseGeneric("https://habr.com/ru/articles/1/");
    assert.equal(meta?.provider, "generic");
    assert.equal(meta?.title, "Как мы переехали");
    assert.equal(meta?.description, "История миграции.");
    assert.match(meta?.image_url ?? "", /habr\.com/);
  } finally {
    restore();
  }
});

test("generic: пустая страница → null", async () => {
  const restore = mockFetch([["example.com", res("<html><head></head></html>")]]);
  try {
    const meta = await parseGeneric("https://example.com/x");
    assert.equal(meta, null);
  } finally {
    restore();
  }
});

test("generic: только twitter:title → title из fallback", async () => {
  const restore = mockFetch([
    ["medium.com", res('<html><head><meta name="twitter:title" content="Твит-заголовок"></head></html>')],
  ]);
  try {
    const meta = await parseGeneric("https://medium.com/@u/post");
    assert.equal(meta?.title, "Твит-заголовок");
  } finally {
    restore();
  }
});

test("parseUrl: роутинг + парсинг через единую точку входа", async () => {
  const restore = mockFetch([
    [
      "youtube.com/oembed",
      res(JSON.stringify({ title: "T", author_name: "A" })),
    ],
  ]);
  try {
    const { provider, meta } = await parseUrl("https://www.youtube.com/watch?v=zzz");
    assert.equal(provider, "youtube");
    assert.equal(meta?.title, "T");
  } finally {
    restore();
  }
});

test("providerForUrl: дополнительные домены", () => {
  const cases: Array<[string, Provider]> = [
    ["https://m.youtube.com/watch?v=1", "youtube"],
    ["https://www.instagram.com/tv/1/", "instagram"],
    ["https://www.instagram.com/p/1/", "instagram"],
    ["https://www.tiktok.com/@u/video/1", "tiktok"],
    ["https://t.me/s/channel/1", "telegram"],
    ["https://www.notion.so/page", "generic"],
  ];
  for (const [url, expected] of cases) {
    assert.equal(providerForUrl(url), expected, `for ${url}`);
  }
});