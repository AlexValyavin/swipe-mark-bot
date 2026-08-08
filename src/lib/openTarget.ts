import type { Bookmark } from "@/app/api/bookmarks/route";

export function getOpenTarget(bookmark: Bookmark): string | null {
  if (bookmark.type === "forward" && bookmark.forwardUrl) return bookmark.forwardUrl;
  if (bookmark.videoUrl) return bookmark.videoUrl;
  if (bookmark.url) return bookmark.url;
  if (bookmark.imageUrl) return bookmark.imageUrl;
  return null;
}
