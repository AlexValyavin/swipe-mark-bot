"use client";

import { motion } from "framer-motion";
import { X, ExternalLink, Folder, Tag, Sparkles } from "lucide-react";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useI18n } from "@/components/I18nProvider";
import { SourceBadge } from "@/components/SourceBadge";
import { getOpenTarget } from "@/lib/openTarget";

function thumbFor(c: Bookmark): string | null {
  return c.imageUrl || c.mediaItems?.[0]?.imageUrl || null;
}

function typeEmoji(c: Bookmark): string {
  if (c.type === "photo") return "📷";
  if (c.type === "video") return "🎬";
  if (c.type === "text") return "📝";
  if (c.type === "forward") return "📨";
  return "🔗";
}

function fmtDuration(sec?: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MaterialSheet({
  bookmark,
  onClose,
  onOpen,
}: {
  bookmark: Bookmark;
  onClose: () => void;
  onOpen: (b: Bookmark) => void;
}) {
  const { t, lang } = useI18n();
  const thumb = thumbFor(bookmark);
  const openTarget = getOpenTarget(bookmark);

  // Fallback breadcrumb: first folder or "Сохранёнки"
  const folderLabel =
    bookmark.folders && bookmark.folders.length > 0
      ? `${bookmark.folders[0].emoji || "📁"} ${bookmark.folders[0].name}`
      : t("library.chip.unsorted");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm font-medium text-muted hover:text-text"
          >
            ← {folderLabel}
          </button>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex size-8 items-center justify-center rounded-full bg-bg text-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {/* Preview */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg">
            {thumb ? (
              <img
                src={thumb}
                alt=""
                className="size-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-5xl">
                {typeEmoji(bookmark)}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 p-5">
            {/* Title */}
            <h2 className="text-lg font-bold leading-snug text-text">
              {bookmark.title || t("card.noTitle")}
            </h2>

            {/* Summary */}
            {(bookmark.aiSummary || bookmark.description) && (
              <div className="rounded-2xl bg-bg p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                  {bookmark.aiSummary ? t("card.brief") : t("card.brief")}
                </p>
                <p className="text-sm leading-relaxed text-text">
                  {bookmark.aiSummary || bookmark.description}
                </p>
                {bookmark.aiSummary && !bookmark.description && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-accent">
                    <Sparkles className="size-3" /> AI
                  </p>
                )}
              </div>
            )}

            {/* Source */}
            <div className="flex flex-col gap-2 rounded-2xl bg-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("add.title") === "Добавить ссылки" ? "Источник" : "Source"}
              </p>
              <div className="flex items-center gap-2 text-sm text-text">
                <SourceBadge bookmark={bookmark} />
                <span className="truncate">{bookmark.domain || t("card.domainFallback")}</span>
                {bookmark.durationSeconds ? (
                  <span className="text-muted">· {fmtDuration(bookmark.durationSeconds)}</span>
                ) : null}
              </div>
              {bookmark.url && (
                <p className="truncate text-xs text-muted">{bookmark.url}</p>
              )}
            </div>

            {/* Open button */}
            <button
              onClick={() => {
                onOpen(bookmark);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-semibold text-accent-text active:scale-[0.98]"
            >
              <ExternalLink className="size-4" />
              {t("common.open")}
            </button>

            {/* Folders / Tags */}
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              {bookmark.folders && bookmark.folders.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Folder className="size-3.5" />{" "}
                  </span>
                  {bookmark.folders.map((f) => (
                    <span
                      key={f.id}
                      className="rounded-full bg-bg px-3 py-1.5 text-xs font-medium text-text"
                    >
                      {f.emoji || "📁"} {f.name}
                    </span>
                  ))}
                </div>
              )}
              {bookmark.tags && bookmark.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Tag className="size-3.5" />{" "}
                  </span>
                  {bookmark.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}
              {(!bookmark.folders || bookmark.folders.length === 0) &&
                (!bookmark.tags || bookmark.tags.length === 0) && (
                  <p className="text-xs text-muted">—</p>
                )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
