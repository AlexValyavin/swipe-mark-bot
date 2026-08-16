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
}: {
  bookmarks: Bookmark[];
  onSwipe: (direction: SwipeDirection, bookmark: Bookmark) => void;
  onOpen: (bookmark: Bookmark) => void;
  onRetry?: (bookmark: Bookmark) => void;
}) {
  const [exitX, setExitX] = useState(500);
  const [exitY, setExitY] = useState(0);
  const telegram = useTelegram();

  if (bookmarks.length === 0) return null;

  const current = bookmarks[0];

  const handleSwipe = (direction: SwipeDirection) => {
    setExitX(direction === "left" ? -500 : direction === "up" ? 0 : 500);
    setExitY(direction === "up" ? -300 : 0);
    onSwipe(direction, current);
  };

  return (
    <div className="flex h-full w-full max-w-[90vw] mx-auto flex-col">
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

      {/* Счётчик оставшихся в стопке */}
      <div className="pointer-events-none absolute top-3 left-0 right-0 flex justify-center" style={{ zIndex: 30 }}>
        <div className="flex items-baseline gap-1 rounded-full bg-black/50 px-3 py-1 backdrop-blur-sm">
          <span className="text-sm font-bold text-white tabular-nums">
            {bookmarks.length}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-white/70">
            в стопке
          </span>
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
