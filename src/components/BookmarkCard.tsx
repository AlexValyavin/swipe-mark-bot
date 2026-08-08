"use client";

import { motion, PanInfo, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef } from "react";
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
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const archiveOpacity = useTransform(x, [-150, -30], [1, 0]);
  const laterOpacity = useTransform(x, [30, 150], [0, 1]);

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
        {bookmark.imageUrl ? (
          <img src={bookmark.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 text-white/20">
            <span className="text-6xl">🔗</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
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