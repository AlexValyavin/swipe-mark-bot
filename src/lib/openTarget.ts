import type { Bookmark } from "@/app/api/bookmarks/route";

export function getOpenTarget(bookmark: Bookmark): string | null {
  // Видео/документы не проксируем: открываем источник, если он есть.
  if (bookmark.type === "forward") {
    if (bookmark.forwardUrl) return bookmark.forwardUrl;
    if (bookmark.url) return bookmark.url;
    return null;
  }
  if (bookmark.url) return bookmark.url;
  if (bookmark.videoUrl) return bookmark.videoUrl;
  if (bookmark.imageUrl) return bookmark.imageUrl;
  return null;
}
