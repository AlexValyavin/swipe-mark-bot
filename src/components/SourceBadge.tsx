"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useI18n } from "@/components/I18nProvider";

export type SourceKind = "youtube" | "instagram" | "tiktok" | "telegram" | "link";

/** Определяет источник по домену ссылки. */
export function sourceKind(domain?: string): SourceKind {
  const d = (domain ?? "").toLowerCase();
  if (d.includes("youtube") || d.includes("youtu.be")) return "youtube";
  if (d.includes("instagram")) return "instagram";
  if (d.includes("tiktok")) return "tiktok";
  if (d.includes("t.me") || d.includes("telegram")) return "telegram";
  return "link";
}

/** Эмодзи-иконка источника (без битых SVG в фолбэках). */
export function sourceEmoji(kind: SourceKind): string {
  switch (kind) {
    case "youtube":
      return "▶️";
    case "instagram":
      return "📸";
    case "tiktok":
      return "🎵";
    case "telegram":
      return "✈️";
    default:
      return "🔗";
  }
}

/** Бейдж источника для deck-карточки. */
export function SourceBadge({ bookmark }: { bookmark: Bookmark }) {
  const kind = sourceKind(bookmark.domain);
  return (
    <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
      <span className="text-[11px] leading-none">{sourceEmoji(kind)}</span>
      {kind}
    </span>
  );
}

/** Точка-статус meta_status (processing = пульс, failed = красная, done = зелёная). */
export function MetaStatusDot({ bookmark }: { bookmark: Bookmark }) {
  const { t } = useI18n();
  const status = bookmark.metaStatus;
  if (!status || status === "done" || status === "pending") return null;
  if (status === "processing") {
    return (
      <span
        className="absolute top-3 left-3 flex size-2.5 animate-pulse rounded-full bg-amber-400"
        title={t("source.extracting")}
      />
    );
  }
  if (status === "failed") {
    return (
      <span className="absolute top-3 left-3 flex size-2.5 rounded-full bg-rose-500" title={t("source.failed")} />
    );
  }
  return null;
}

/** Кнопки для failed-карточки: [Повторить] и [Открыть источник]. */
export function FailedActions({
  bookmark,
  onRetry,
}: {
  bookmark: Bookmark;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const url = bookmark.forwardUrl ?? bookmark.url;
  return (
    <div className="flex items-center gap-2 pt-3">
      {onRetry && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="flex items-center gap-1.5 rounded-lg bg-line px-3 py-1.5 text-xs font-medium text-text active:scale-95 transition-transform"
        >
          <RefreshCw className="size-3.5" />
          {t("common.retry")}
        </button>
      )}
      {url && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(url, "_blank", "noopener");
          }}
          className="flex items-center gap-1.5 rounded-lg bg-line px-3 py-1.5 text-xs font-medium text-muted active:scale-95 transition-transform"
        >
          <ExternalLink className="size-3.5" />
          {t("common.open")}
        </button>
      )}
    </div>
  );
}

/** Скелетон карточки на время meta_status=processing. */
export function CardSkeleton() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
      <div className="relative w-full flex-1 animate-pulse bg-bg">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-14 animate-pulse items-center justify-center rounded-full bg-line text-xl">
            ⏳
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 space-y-2 p-5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-line" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-line" />
      </div>
    </div>
  );
}