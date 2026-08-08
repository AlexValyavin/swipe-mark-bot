"use client";

import { motion, PanInfo, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef, useState } from "react";
import type { Bookmark } from "@/app/api/bookmarks/route";

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
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const archiveOpacity = useTransform(x, [-150, -30], [1, 0]);
  const laterOpacity = useTransform(x, [30, 150], [0, 1]);

  const items = bookmark.mediaItems && bookmark.mediaItems.length > 0
    ? bookmark.mediaItems
    : null;
  const currentItem = items?.[mediaIndex];
  const imageSrc = currentItem?.imageUrl || (mediaIndex === 0 ? bookmark.imageUrl : undefined);

  return (
    <motion.div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl select-none"
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
      <div className="relative flex-1 w-full bg-neutral-800 min-h-[200px]">
        {imageSrc ? (
          <img src={imageSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 text-white/20">
            <span className="text-6xl">🔗</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />

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
        <h2 className="text-xl font-bold leading-snug text-white line-clamp-2">
          {bookmark.title || "Без заголовка"}
        </h2>
        {bookmark.description && (
          <p className="mt-2 text-sm text-neutral-400 line-clamp-3">
            {bookmark.description}
          </p>
        )}
        <div className="mt-auto pt-4 text-xs text-neutral-500 uppercase tracking-wider font-semibold">
          {bookmark.domain || "ссылка"}
        </div>
      </div>

      {interactive && (
        <>
          <motion.div style={{ opacity: archiveOpacity }} className="absolute top-6 right-6 border-2 border-rose-500 text-rose-500 px-3 py-1 rounded-lg rotate-12 font-black">АРХИВ</motion.div>
          <motion.div style={{ opacity: laterOpacity }} className="absolute top-6 left-6 border-2 border-emerald-400 text-emerald-400 px-3 py-1 rounded-lg -rotate-12 font-black">ПОТОМ</motion.div>
        </>
      )}
    </motion.div>
  );
}