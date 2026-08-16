import { test } from "node:test";
import assert from "node:assert/strict";
import { cardToBookmark } from "../src/lib/db/mappers";
import type { AttachmentRow, CardLinkRow, CardRow } from "../src/lib/db/types";

function stubCard(overrides: Partial<CardRow> = {}): CardRow {
  return {
    id: "card-1",
    user_id: "user-1",
    source_type: "note",
    primary_type: "text",
    source_url: null,
    canonical_url: null,
    domain: null,
    source_chat_id: null,
    source_message_id: null,
    telegram_message_id: null,
    media_group_id: null,
    title: null,
    text: null,
    image_url: null,
    duration_seconds: null,
    estimated_minutes: null,
    status: "new",
    defer_until: null,
    archived_at: null,
    ai_title: null,
    ai_summary: null,
    ai_status: "none",
    ai_folder_id: null,
    ai_confidence: null,
    ai_tags: null,
    meta_status: "pending",
    meta_error: null,
    embedding: null,
    created_at: "2026-08-13T10:00:00.000Z",
    updated_at: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

function stubAtt(overrides: Partial<AttachmentRow> = {}): AttachmentRow {
  return {
    id: "att-1",
    card_id: "card-1",
    type: "photo",
    telegram_file_id: "file_id_photo",
    thumbnail_file_id: null,
    storage_url: null,
    file_name: null,
    mime_type: null,
    file_size: null,
    duration: null,
    width: null,
    height: null,
    created_at: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

test("mapa: photo card → mediaItems, imageUrl из fileId", () => {
  const card = stubCard({ source_type: "photo", primary_type: "photo" });
  const att = stubAtt();
  const b = cardToBookmark(card, [att], []);
  assert.equal(b.type, "photo");
  assert.equal(b.imageUrl, "/api/file?fileId=file_id_photo");
  assert.equal(b.mediaItems?.[0]?.fileId, "file_id_photo");
  assert.equal(b.fileId, "file_id_photo");
  assert.equal(b.status, "new");
});

test("mapa: video card → videoUrl из telegram_file_id, imageUrl из thumbnail", () => {
  const card = stubCard({ source_type: "video", primary_type: "video" });
  const att = stubAtt({
    type: "video",
    telegram_file_id: "file_id_video",
    thumbnail_file_id: "file_id_thumb",
  });
  const b = cardToBookmark(card, [att], []);
  assert.equal(b.type, "video");
  assert.equal(b.videoUrl, "/api/file?fileId=file_id_video");
  assert.equal(b.imageUrl, "/api/file?fileId=file_id_thumb");
});

test("mapa: forwarded → type forward, sourceType forward", () => {
  const card = stubCard({ source_type: "forwarded", primary_type: "forwarded" });
  const b = cardToBookmark(card, [], []);
  assert.equal(b.type, "forward");
  assert.equal(b.sourceType, "forward");
});

test("mapa: link card → url из card_links, og_description в description", () => {
  const card = stubCard({ source_type: "link", primary_type: "link" });
  const link: CardLinkRow = {
    id: "l1",
    card_id: "card-1",
    url: "https://example.com",
    og_title: "Example",
    og_description: "Desc",
    og_image_url: "https://example.com/og.png",
    created_at: "2026-08-13T10:00:00.000Z",
  };
  const b = cardToBookmark(card, [], [link]);
  assert.equal(b.type, "link");
  assert.equal(b.url, "https://example.com");
  assert.equal(b.description, "Desc");
  assert.equal(b.imageUrl, "https://example.com/og.png");
});

test("status: archived stays archived", () => {
  const card = stubCard({ source_type: "link", status: "archived" });
  const b = cardToBookmark(card, [], []);
  assert.equal(b.status, "archived");
});

test("deferUntil passed through", () => {
  const card = stubCard({ source_type: "link", status: "later", defer_until: "2026-08-13T12:00:00.000Z" });
  const b = cardToBookmark(card, [], []);
  assert.equal(b.deferUntil, "2026-08-13T12:00:00.000Z");
  assert.equal(b.createdAt, "2026-08-13T10:00:00.000Z");
});

test("type fallback: unknown source_type → primary_type", () => {
  const card = stubCard({ source_type: "album", primary_type: "photo" });
  const b = cardToBookmark(card, [], []);
  // album маппится в photo
  assert.equal(b.type, "photo");
});

test("folders propagate to Bookmark when passed", () => {
  const card = stubCard({ source_type: "link" });
  const folders = [{ id: "f1", name: "Работа", emoji: "💼" }];
  const b = cardToBookmark(card, [], [], folders);
  assert.equal(b.folders?.[0]?.name, "Работа");
  assert.equal(b.folders?.[0]?.emoji, "💼");
});

test("fields stay undefined when no folders passed", () => {
  const card = stubCard({ source_type: "link" });
  const b = cardToBookmark(card, [], []);
  assert.equal(b.folders, undefined);
});

test("tags propagate to Bookmark when passed", () => {
  const card = stubCard({ source_type: "link" });
  const tags = [{ id: "t1", name: "дизайн" }];
  const b = cardToBookmark(card, [], [], [], tags);
  assert.deepEqual(b.tags, tags);
});

test("tags stay undefined when not passed", () => {
  const card = stubCard({ source_type: "link" });
  const b = cardToBookmark(card, [], []);
  assert.equal(b.tags, undefined);
});