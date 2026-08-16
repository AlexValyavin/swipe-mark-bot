import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMetaTags } from "../src/lib/meta/parsers/shared";
import { providerForUrl, type Provider } from "../src/lib/meta/parsers";
import { normalizeUrl } from "../src/lib/db/cards";

const fixtures = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

test("parseMetaTags: youtube-watch.html → title, description, image", () => {
  const html = fixtures("youtube-watch.html");
  const tags = parseMetaTags(html);
  assert.equal(tags.title, "Как устроен TCP — просто о сложном");
  assert.equal(tags.description, "Разбор TCP за 12 минут с примерами.");
  assert.match(tags.image!, /i\.ytimg\.com/);
});

test("parseMetaTags: youtube-watch.html → lengthSeconds regex извлекает длительность", () => {
  const html = fixtures("youtube-watch.html");
  const m = /"lengthSeconds"\s*:\s*"(\d+)"/i.exec(html);
  assert.equal(m?.[1], "754");
});

test("parseMetaTags: instagram-og.html → title и image из cdninstagram", () => {
  const html = fixtures("instagram-og.html");
  const tags = parseMetaTags(html);
  assert.ok(tags.title!.includes("12,345 likes"));
  assert.match(tags.image!, /cdninstagram/);
});

test("parseMetaTags: generic-og.html → title из og, description, image", () => {
  const html = fixtures("generic-og.html");
  const tags = parseMetaTags(html);
  assert.equal(tags.title, "Как мы переехали с Firestore на Postgres");
  assert.equal(tags.description, "История миграции и выводы.");
  assert.match(tags.image!, /habr\.com/);
});

test("parseMetaTags: generic-og.html без og:title → <title> как fallback", () => {
  const html = fixtures("generic-og.html").replace(
    /<meta[^>]+og:title[^>]+>/,
    ""
  );
  const tags = parseMetaTags(html);
  assert.equal(tags.title, "Статья — Хабр");
});

test("parseMetaTags: twitter:title как fallback", () => {
  const html = `<html><head>
<meta name="twitter:title" content="Твит: падение сервиса">
<meta name="twitter:description" content="Описание твита">
</head><body></body></html>`;
  const tags = parseMetaTags(html);
  assert.equal(tags.title, "Твит: падение сервиса");
  assert.equal(tags.description, "Описание твита");
});

test("providerForUrl: роутинг по доменам", () => {
  const cases: Array<[string, Provider]> = [
    ["https://www.youtube.com/watch?v=1", "youtube"],
    ["https://youtu.be/1", "youtube"],
    ["https://www.youtube.com/shorts/1", "youtube"],
    ["https://www.instagram.com/p/1/", "instagram"],
    ["https://www.instagram.com/reel/1/", "instagram"],
    ["https://www.instagram.com/tv/1/", "instagram"],
    ["https://www.tiktok.com/@u/video/1", "tiktok"],
    ["https://x.com/u/status/1", "twitter"],
    ["https://twitter.com/u/status/1", "twitter"],
    ["https://t.me/s/channel/1", "telegram"],
    ["https://habr.com/ru/articles/1/", "generic"],
    ["https://medium.com/@u/post", "generic"],
  ];
  for (const [url, expected] of cases) {
    assert.equal(providerForUrl(url), expected, `for ${url}`);
  }
});

test("normalizeUrl: utm/hash/www/trailing-slash (регресс этапа 6)", () => {
  assert.equal(
    normalizeUrl("https://www.example.com/path?utm_source=x&id=1#frag"),
    "https://example.com/path?id=1"
  );
  assert.equal(
    normalizeUrl("https://example.com/"),
    "https://example.com/"
  );
  assert.equal(
    normalizeUrl("https://www.instagram.com/reel/abc/?igshid=xyz"),
    "https://instagram.com/reel/abc/"
  );
});