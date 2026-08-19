"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { X, ExternalLink, Clock } from "lucide-react";
import { BookmarkCard, type SwipeDirection } from "@/components/BookmarkCard";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useTelegram } from "@/components/TelegramProvider";

export function SwipeDeck({
  bookmarks,
  onSwipe,
  onOpen,
  onRetry,
  done,
}: {
  bookmarks: Bookmark[];
  onSwipe: (direction: SwipeDirection, bookmark: Bookmark) => void;
  onOpen: (bookmark: Bookmark) => void;
  onRetry?: (bookmark: Bookmark) => void;
  done?: number;
}) {
  const [exitX, setExitX] = useState(500);
  const [exitY, setExitY] = useState(0);
  const telegram = useTelegram();

  if (bookmarks.length === 0) return null;

  const current = bookmarks[0];
  const total = (done ?? 0) + bookmarks.length;
  const pct = total > 0 ? Math.min(100, Math.round(((done ?? 0) / total) * 100)) : 0;

  const handleSwipe = (direction: SwipeDirection) => {
    setExitX(direction === "left" ? -500 : direction === "up" ? 0 : 500);
    setExitY(direction === "up" ? -300 : 0);
    onSwipe(direction, current);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[90vw] flex-col md:max-w-[560px]">
      <div className="relative flex-1 min-h-0">
        {/* Background stack for next cards - render first so they're behind */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          {bookmarks.slice(1, 3).map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-2xl bg-surface shadow-xl"
              style={{
                transform: `scale(${1 - (i + 1) * 0.04}) translateY(${(i + 1) * 6}px)`,
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="popLayout">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, x: exitX, y: exitY }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative h-full w-full"
            style={{ zIndex: 10 }}
          >
            <BookmarkCard
              bookmark={current}
              interactive={true}
              onSwipe={handleSwipe}
              onOpen={() => onOpen(current)}
              onRetry={onRetry ? () => onRetry(current) : undefined}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Прогресс разбора */}
      <div className="pointer-events-none absolute top-3 left-0 right-0 flex justify-center px-4" style={{ zIndex: 30 }}>
        <div className="w-full max-w-[300px] rounded-xl bg-black/50 px-3 py-2 backdrop-blur-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-white/70">
              {done !== undefined ? `${done} / ${total} разобрано` : "осталось"}
            </span>
            <span className="text-sm font-bold text-white tabular-nums">
              {bookmarks.length}
            </span>
          </div>
          {done !== undefined && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/20">
              <motion.div
                className="h-full rounded-full bg-emerald-400"
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 30 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Action buttons - Tinder style */}
      <div className="flex items-center justify-center gap-6 py-4" style={{ zIndex: 20 }}>
        <button
          onClick={() => {
            telegram?.haptic.impact("medium");
            handleSwipe("left");
          }}
          aria-label="В архив"
          title="В архив"
          className="flex size-14 items-center justify-center rounded-full border-2 border-danger/40 bg-surface text-danger transition-transform active:scale-90"
        >
          <X className="size-6" />
        </button>
        <button
          onClick={() => {
            telegram?.haptic.impact("heavy");
            onOpen(current);
          }}
          aria-label="Открыть"
          title="Открыть"
          className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-text shadow-lg shadow-accent/30 transition-transform active:scale-90"
        >
          <ExternalLink className="size-7" />
        </button>
        <button
          onClick={() => {
            telegram?.haptic.impact("light");
            handleSwipe("right");
          }}
          aria-label="Позже"
          title="Позже"
          className="flex size-14 items-center justify-center rounded-full border-2 border-success/40 bg-surface text-success transition-transform active:scale-90"
        >
          <Clock className="size-6" />
        </button>
      </div>
    </div>
  );
}
