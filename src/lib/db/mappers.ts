import type { AttachmentRow, CardLinkRow, CardRow } from "@/lib/db/types";

export interface BookmarkMediaItem {
  type: string;
  fileId?: string;
  imageUrl?: string;
  videoUrl?: string;
  fileName?: string | null;
}

export interface BookmarkFolderMeta {
  id: string;
  name: string;
  emoji: string | null;
}

export interface Bookmark {
  id: string;
  userId: string;
  url?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  type?: string;
  caption?: string;
  fileId?: string;
  fileName?: string | null;
  videoUrl?: string;
  forwardUrl?: string;
  sourceType?: string;
  sourceUrl?: string | null;
  mediaGroupId?: string;
  mediaItems?: BookmarkMediaItem[];
  status?: string;
  deferUntil?: string | null;
  previousStatus?: string | null;
  createdAt: string;
  domain?: string;
  swipedCount: number;
  readTimeMin: number;
  rightCount?: number;
  folders?: BookmarkFolderMeta[];
  tags?: { id: string; name: string }[];
  aiTitle?: string | null;
  aiSummary?: string | null;
  aiStatus?: string | null;
  aiFolderId?: string | null;
  aiFolderName?: string | null;
  aiConfidence?: number | null;
}

function fileUrl(fileId: string | null | undefined): string | undefined {
  if (!fileId) return undefined;
  return `/api/file?fileId=${encodeURIComponent(fileId)}`;
}

/**
 * Собирает публичный контракт Bookmark (как в старом Firestore) из реляционных строк.
 * mediaItems строятся из attachments; top-level imageUrl/videoUrl достаются
 * из первой медиа (для обратной совместимости с BookmarkCard/getOpenTarget).
 */
export function cardToBookmark(
  card: CardRow,
  attachments: AttachmentRow[],
  links: CardLinkRow[],
  folders: BookmarkFolderMeta[] = [],
  tags: { id: string; name: string }[] = []
): Bookmark {
  const firstLink = links[0] ?? null;

  const mediaItems: BookmarkMediaItem[] = attachments.map((a) => ({
    type: a.type,
    fileId: a.telegram_file_id ?? undefined,
    imageUrl: fileUrl(a.thumbnail_file_id ?? (a.type === "photo" || a.type === "document" ? a.telegram_file_id : null)),
    videoUrl: a.type === "video" || a.type === "animation" ? fileUrl(a.telegram_file_id) : undefined,
    fileName: a.file_name ?? null,
  }));

  const firstPhoto = mediaItems.find((m) => m.type === "photo" && m.imageUrl);
  const firstThumb = mediaItems.find((m) => m.imageUrl);
  const firstVideo = mediaItems.find((m) => m.videoUrl);

  const typeMap: Record<string, string> = {
    link: "link",
    photo: "photo",
    video: "video",
    note: "text",
    album: "photo",
    forwarded: "forward",
  };

  return {
    id: card.id,
    userId: card.user_id,
    url: firstLink?.url ?? card.source_url ?? undefined,
    title: card.title ?? undefined,
    description: firstLink?.og_description ?? card.text ?? undefined,
    imageUrl:
      card.image_url ??
      firstLink?.og_image_url ??
      firstPhoto?.imageUrl ??
      firstThumb?.imageUrl ??
      undefined,
    type: typeMap[card.source_type] ?? card.primary_type,
    caption: card.media_group_id ? card.text ?? undefined : undefined,
    fileId: attachments[0]?.telegram_file_id ?? undefined,
    fileName: attachments[0]?.file_name ?? null,
    videoUrl: firstVideo?.videoUrl ?? undefined,
    sourceType: card.source_type === "forwarded" ? "forward" : "direct",
    sourceUrl: card.source_url ?? null,
    forwardUrl: card.source_type === "forwarded" ? card.source_url ?? undefined : undefined,
    mediaGroupId: card.media_group_id ?? undefined,
    mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
    status: card.status,
    deferUntil: card.defer_until ?? null,
    createdAt: card.created_at,
    domain: card.domain ?? undefined,
    swipedCount: 0,
    readTimeMin: 1,
    ...(folders.length > 0 ? { folders } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(card.ai_status && card.ai_status !== "none"
      ? {
          aiStatus: card.ai_status,
          aiTitle: card.ai_title ?? undefined,
          aiSummary: card.ai_summary ?? undefined,
          aiFolderId: card.ai_folder_id ?? undefined,
          aiFolderName: card.ai_folder_id
            ? folders.find((f) => f.id === card.ai_folder_id)?.name ?? undefined
            : undefined,
          aiConfidence: card.ai_confidence ?? undefined,
        }
      : {}),
  };
}