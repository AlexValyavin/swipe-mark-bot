"use client";

import { motion, PanInfo, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef, useState } from "react";
import { Play, Sparkles } from "lucide-react";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useTelegram } from "@/components/TelegramProvider";

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
}: {
  bookmark: Bookmark;
  interactive: boolean;
  onSwipe: (direction: SwipeDirection) => void;
  onOpen: () => void;
}) {
  const dragged = useRef(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const telegram = useTelegram();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  // Стикеры появляются плавнее: рассинхронизированные диапазоны
  const archiveOpacity = useTransform(x, [-220, -60], [1, 0]);
  const laterOpacity = useTransform(x, [60, 220], [0, 1]);
  // Подсветка края при перетаскивании
  const leftGlow = useTransform(x, [-220, -40], [0.9, 0]);
  const rightGlow = useTransform(x, [40, 220], [0, 0.9]);

  const items = bookmark.mediaItems && bookmark.mediaItems.length > 0
    ? bookmark.mediaItems
    : null;
  const currentItem = items?.[mediaIndex];
  const imageSrc = currentItem?.imageUrl || (mediaIndex === 0 ? bookmark.imageUrl : undefined);
  const isVideo = Boolean(currentItem?.videoUrl || bookmark.videoUrl);

  const favicon = faviconUrl(bookmark.domain);

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
        if (!dragged.current) onOpen();
        dragged.current = false;
      }}
    >
      {/* Media / Content Area */}
      <div className="relative flex-1 w-full bg-bg min-h-[200px]">
        {imageSrc && !imgError ? (
          <img
            src={imageSrc}
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
              aria-label="Предыдущее фото"
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
              aria-label="Следующее фото"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-black/50 text-white active:scale-90 transition-transform"
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Info Area */}
      <div className="flex-shrink-0 p-5">
        <h2 className="text-xl font-bold leading-snug text-text line-clamp-2">
          {bookmark.title || "Без заголовка"}
        </h2>
        {bookmark.description && (
          <p className="mt-2 text-sm text-muted line-clamp-3">
            {bookmark.description}
          </p>
        )}
        {bookmark.aiFolderName && bookmark.aiStatus === "done" && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-accent/15 px-2 py-1 text-xs font-medium text-accent">
            <Sparkles className="size-3" />
            AI: {bookmark.aiFolderName}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1.5 pt-4">
          {favicon ? (
            <img
              src={favicon}
              alt=""
              className="size-4 rounded-[3px]"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : null}
          <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted">
            {bookmark.domain || "ссылка"}
          </span>
        </div>
      </div>

      {interactive && (
        <>
          <motion.div
            style={{ opacity: archiveOpacity }}
            className="absolute top-6 right-6 border-2 border-rose-500 text-rose-500 px-3 py-1 rounded-lg rotate-12 font-black bg-black/40"
          >
            АРХИВ
          </motion.div>
          <motion.div
            style={{ opacity: laterOpacity }}
            className="absolute top-6 left-6 border-2 border-emerald-400 text-emerald-400 px-3 py-1 rounded-lg -rotate-12 font-black bg-black/40"
          >
            ПОТОМ
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
