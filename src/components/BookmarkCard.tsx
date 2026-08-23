"use client";

import { motion, PanInfo, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Play, Sparkles, Timer, FileText, Loader2, ExternalLink } from "lucide-react";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useTelegram } from "@/components/TelegramProvider";
import {
  SourceBadge,
  MetaStatusDot,
  FailedActions,
  CardSkeleton,
} from "@/components/SourceBadge";
import { fmtDuration, fmtReadMinutes } from "@/lib/format";
import { useI18n } from "@/components/I18nProvider";
import { trackClient } from "@/lib/analyticsClient";

export type SwipeDirection = "left" | "right" | "up";

const SWIPE_DISTANCE = 100;
const SWIPE_VELOCITY = 300;

function directionFrom(info: PanInfo): SwipeDirection | null {
  const { offset, velocity } = info;
  if (offset.y < -SWIPE_DISTANCE && Math.abs(offset.y) > Math.abs(offset.x)) return "up";
  if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) return "right";
  if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) return "left";
  return null;
}

function faviconUrl(domain?: string): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

export function BookmarkCard({
  bookmark,
  interactive,
  onSwipe,
  onOpen,
  onRetry,
}: {
  bookmark: Bookmark;
  interactive: boolean;
  onSwipe: (direction: SwipeDirection) => void;
  onOpen: () => void;
  onRetry?: () => void;
}) {
  const dragged = useRef(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryDone, setSummaryDone] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [summaryQuotaLeft, setSummaryQuotaLeft] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setExpanded(false); }, [bookmark.id]);
  const telegram = useTelegram();
  const { t, lang } = useI18n();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  // Стикеры с градацией: появляются от 0 до ~порога свайпа, усиливаются к 100%
  const archiveOpacity = useTransform(x, [-40, -110], [0, 1]);
  const laterOpacity = useTransform(x, [40, 110], [0, 1]);
  const archiveScale = useTransform(x, [-40, -110], [0.8, 1.15]);
  const laterScale = useTransform(x, [40, 110], [0.8, 1.15]);
  // Подсветка края нарастает с движением
  const leftGlow = useTransform(x, [-30, -110], [0, 0.9]);
  const rightGlow = useTransform(x, [30, 110], [0, 0.9]);

  const items = bookmark.mediaItems && bookmark.mediaItems.length > 0
    ? bookmark.mediaItems
    : null;
  const currentItem = items?.[mediaIndex];
  const imageSrc = currentItem?.imageUrl || (mediaIndex === 0 ? bookmark.imageUrl : undefined);
  const isVideo = currentItem?.type === "video" || currentItem?.type === "animation" || bookmark.type === "video";
  const durationSeconds =
    currentItem?.durationSeconds ?? bookmark.durationSeconds ?? null;

  // Цепочка: storage_url → /api/file?fileId= → placeholder.
  const fallbackSrc =
    currentItem?.fileId && imageSrc?.startsWith("http")
      ? `/api/file?fileId=${encodeURIComponent(currentItem.fileId)}`
      : null;
  const shownSrc = fallbackSrc && imgError ? fallbackSrc : imageSrc;

  const favicon = faviconUrl(bookmark.domain);

  useEffect(() => {
    if (aiAvailable !== null || bookmark.aiSummary) return;
    let cancelled = false;
    fetch("/api/settings/ai")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setAiAvailable(Boolean(data?.hasKey && data?.mode !== "off"));
        }
      })
      .catch(() => !cancelled && setAiAvailable(false));
    // Квота саммари: скрываем кнопку при 0
    fetch("/api/ai/quota")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.summary?.left === "number") {
          setSummaryQuotaLeft(data.summary.left);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [aiAvailable, bookmark.aiSummary]);

  const requestSummary = async () => {
    if (summaryLoading || summaryDone) return;
    trackClient("ai_summary_requested", { content_type: bookmark.type || null });
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/cards/${bookmark.id}/summary`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setSummaryText(data.summary);
          setSummaryDone(true);
          setExpanded(true);
          trackClient("ai_summary_completed", { status: "ok", content_type: bookmark.type || null });
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setSummaryError(data.error || t("common.error.generic"));
        trackClient("ai_summary_completed", { status: "failed", content_type: bookmark.type || null });
      }
    } catch {
      setSummaryError(t("common.error.network"));
      trackClient("ai_summary_completed", { status: "network_error", content_type: bookmark.type || null });
    } finally {
      setSummaryLoading(false);
    }
  };

  if (bookmark.metaStatus === "processing") {
    return <CardSkeleton />;
  }

  const metaFailed = bookmark.metaStatus === "failed";

  return (
    <motion.div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl select-none touch-none"
      style={{ x, y, rotate: interactive ? rotate : 0, zIndex: 20 }}
      drag={interactive}
      dragMomentum={false}
      dragElastic={0.2}
      onDragStart={() => { dragged.current = true; }}
      onDragEnd={async (_, info) => {
        const direction = directionFrom(info);
        if (!direction) {
          await Promise.all([
            animate(x, 0, { type: "spring", stiffness: 400, damping: 40 }),
            animate(y, 0, { type: "spring", stiffness: 400, damping: 40 }),
          ]);
          return;
        }
        if (direction === "up") {
          await Promise.all([
            animate(x, 0, { type: "spring", stiffness: 400, damping: 40 }),
            animate(y, -300, { type: "spring", stiffness: 400, damping: 40 }),
          ]);
          onSwipe(direction);
          x.set(0);
          y.set(0);
          return;
        }
        await Promise.all([
          animate(x, direction === "right" ? 500 : -500, { duration: 0.2 }),
          animate(y, info.offset.y * 1.2, { duration: 0.2 }),
        ]);
        onSwipe(direction);
        x.set(0);
        y.set(0);
      }}
      onClick={() => {
        dragged.current = false;
      }}
    >
      {/* Media / Content Area — в expanded режиме картинка сверху компактная */}
      <div className={`relative w-full bg-bg ${expanded ? "h-[30%] min-h-[140px] flex-shrink-0" : "flex-1 min-h-[200px]"}`}>
        {shownSrc && !(imgError && !fallbackSrc) ? (
          <img
            src={shownSrc}
            alt=""
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 text-white/20">
            <span className="text-6xl">🔗</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />

        {isVideo && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
              <Play className="ml-1 size-6 fill-current" />
            </div>
          </div>
        )}

        {isVideo && durationSeconds != null && durationSeconds > 0 && (
          <div className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
            {fmtDuration(durationSeconds)}
          </div>
        )}

        <div className="absolute bottom-3 left-3">
          <SourceBadge bookmark={bookmark} />
        </div>
        <MetaStatusDot bookmark={bookmark} />

        {items && items.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 pointer-events-none">
            {items.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === mediaIndex ? "w-6 bg-white" : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        )}
        {items && items.length > 1 && (
          <div className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
            {mediaIndex + 1} / {items.length}
          </div>
        )}
        {items && items.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                telegram?.haptic.selection();
                setMediaIndex((i) => (i - 1 + items.length) % items.length);
              }}
              aria-label={t("card.prevPhoto")}
              className="absolute left-3 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-black/50 text-white active:scale-90 transition-transform"
            >
              ‹
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                telegram?.haptic.selection();
                setMediaIndex((i) => (i + 1) % items.length);
              }}
              aria-label={t("card.nextPhoto")}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-black/50 text-white active:scale-90 transition-transform"
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Info Area — compact без скролла (свайп), в expanded весь текст со скроллом */}
      <div
        className={`flex flex-col p-5 ${expanded ? "flex-1 overflow-y-auto hide-scrollbar touch-auto" : "max-h-[52%] overflow-hidden flex-shrink-0 touch-none"}`}
      >
        <h2 className="text-fs-title font-semibold leading-snug text-text line-clamp-3">
          {bookmark.title || t("card.noTitle")}
        </h2>
        {expanded ? (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-accent">
                <Sparkles className="size-3" /> {t("card.brief")}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
                className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:text-text"
              >
                {t("common.close")}
              </button>
            </div>
            <p className="whitespace-pre-line text-fs-summary leading-relaxed text-text">
              {summaryText ?? bookmark.aiSummary ?? bookmark.description ?? t("card.summaryUnavailable")}
            </p>
          </div>
        ) : (
          <>
            {summaryText && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
                className="mt-1.5 block w-full text-left text-fs-summary text-muted line-clamp-2"
              >
                <span className="font-semibold text-text">{t("card.briefPrefix")}</span>
                {summaryText}
              </button>
            )}
            {bookmark.aiSummary && !summaryText && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
                className="mt-1.5 block w-full text-left text-fs-summary text-muted line-clamp-2"
              >
                <span className="font-semibold text-text">{t("card.briefPrefix")}</span>
                {bookmark.aiSummary}
              </button>
            )}
            {bookmark.description && !bookmark.aiSummary && !summaryText && (
              <p className="mt-1.5 text-fs-summary text-muted line-clamp-3">{bookmark.description}</p>
            )}
          </>
        )}
        {bookmark.aiFolderName && bookmark.aiStatus === "done" && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-accent/15 px-2 py-1 text-xs font-medium text-accent">
            <Sparkles className="size-3" />
            AI: {bookmark.aiFolderName}
          </div>
        )}
        {(bookmark.tags && bookmark.tags.length > 0) ||
        (bookmark.folders && bookmark.folders.length > 0) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bookmark.folders?.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1 rounded-lg bg-surface px-2 py-1 text-xs font-medium text-muted"
              >
                <span>{f.emoji || "📁"}</span>
                {f.name}
              </span>
            ))}
            {bookmark.tags?.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-lg bg-surface px-2 py-1 text-xs font-medium text-muted"
              >
                # {t.name}
              </span>
            ))}
          </div>
        ) : null}
        {!bookmark.aiSummary && !summaryDone && aiAvailable && summaryQuotaLeft !== 0 && (
          <div className="mt-2">
            {summaryLoading ? (
              <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                <Loader2 className="size-3.5 animate-spin text-muted" />
                <span className="text-fs-sm text-muted">{t("card.summaryLoading")}</span>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    requestSummary();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line bg-surface/60 px-3 py-1.5 text-fs-sm font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent active:scale-95"
                >
                  <Sparkles className="size-3.5" />
                  {t("card.brief")}
                </button>
                {summaryError && (
                  <p className="mt-1 text-fs-sm text-danger">{summaryError}</p>
                )}
              </>
            )}
          </div>
        )}
        {metaFailed && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-danger/10 px-2 py-1 text-xs font-medium text-danger">
            {t("card.metaFailed")}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 pt-4">
          <span className="flex min-w-0 items-center gap-1.5">
            {favicon ? (
              <img
                src={favicon}
                alt=""
                className="size-4 rounded-[3px]"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : null}
            <span className="truncate text-fs-sm font-semibold uppercase tracking-wider text-muted">
              {bookmark.domain || t("card.domainFallback")}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {isVideo && durationSeconds != null && durationSeconds > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-fs-sm font-medium tabular-nums text-muted">
                <Timer className="size-3.5" />
                {fmtDuration(durationSeconds)}
              </span>
            )}
            {bookmark.readTimeMin > 0 && !isVideo && (
              <span className="flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-fs-sm font-medium tabular-nums text-muted">
                <FileText className="size-3.5" />
                {fmtReadMinutes(bookmark.readTimeMin, lang)}
              </span>
            )}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-fs-sm font-medium text-accent hover:bg-accent/15 active:scale-95"
          >
            <ExternalLink className="size-3.5" />
            {t("common.open")}
          </button>
        </div>
        {metaFailed && (
          <FailedActions bookmark={bookmark} onRetry={onRetry} />
        )}
      </div>

      {interactive && (
        <>
          <motion.div
            style={{ opacity: archiveOpacity, scale: archiveScale }}
            className="absolute top-6 right-6 border-2 border-rose-500 text-rose-500 px-3 py-1 rounded-lg rotate-12 font-black bg-black/40"
          >
            {t("card.sticker.archive")}
          </motion.div>
          <motion.div
            style={{ opacity: laterOpacity, scale: laterScale }}
            className="absolute top-6 left-6 border-2 border-emerald-400 text-emerald-400 px-3 py-1 rounded-lg -rotate-12 font-black bg-black/40"
          >
            {t("card.sticker.keep")}
          </motion.div>
          <motion.div
            style={{ opacity: leftGlow }}
            className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_24px_2px_rgba(244,63,94,0.35)]"
          />
          <motion.div
            style={{ opacity: rightGlow }}
            className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_24px_2px_rgba(52,211,153,0.35)]"
          />
        </>
      )}
    </motion.div>
  );
}
