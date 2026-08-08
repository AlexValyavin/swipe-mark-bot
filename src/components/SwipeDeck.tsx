"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { X, ExternalLink, Undo2 } from "lucide-react";
import { BookmarkCard, type SwipeDirection } from "@/components/BookmarkCard";
import type { Bookmark } from "@/app/api/bookmarks/route";

export function SwipeDeck({
  bookmarks,
  onFinished,
}: {
  bookmarks: Bookmark[];
  onFinished: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [exitX, setExitX] = useState(500);

  const handleSwipe = (direction: SwipeDirection) => {
    setExitX(direction === "left" ? -500 : 500);
    if (index + 1 >= bookmarks.length) {
      onFinished();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const handleOpen = () => {
    if (bookmarks[index]?.url) {
      window.open(bookmarks[index].url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex h-full w-full max-w-[90vw] mx-auto flex-col">
      <div className="relative flex-1 min-h-0">
        {/* Background stack for next cards - render first so they're behind */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          {bookmarks.slice(index + 1, index + 3).map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-2xl bg-neutral-900 shadow-xl"
              style={{
                transform: `scale(${1 - (i + 1) * 0.04}) translateY(${(i + 1) * 6}px)`,
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="popLayout">
          {bookmarks.length > 0 && index < bookmarks.length && (
            <motion.div
              key={bookmarks[index].id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, x: exitX }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative h-full w-full"
              style={{ zIndex: 10 }}
            >
              <BookmarkCard
                bookmark={bookmarks[index]}
                interactive={true}
                onSwipe={handleSwipe}
                onOpen={handleOpen}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress indicator - behind the card */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 pointer-events-none" style={{ zIndex: 5 }}>
          {bookmarks.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? "w-6 bg-white"
                  : i < index
                  ? "w-1.5 bg-neutral-700"
                  : "w-1.5 bg-neutral-800"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-5 py-4" style={{ zIndex: 20 }}>
        <button
          onClick={() => handleSwipe("left")}
          aria-label="Отмена"
          title="Отмена"
          className="flex size-12 items-center justify-center rounded-full bg-neutral-800 text-rose-400 transition-transform active:scale-90"
        >
          <X className="size-6" />
        </button>
        <button
          onClick={handleOpen}
          aria-label="Открыть"
          title="Открыть"
          className="flex size-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform active:scale-90"
        >
          <ExternalLink className="size-7" />
        </button>
        <button
          onClick={() => handleSwipe("right")}
          aria-label="Позже"
          title="Позже"
          className="flex size-12 items-center justify-center rounded-full bg-neutral-800 text-emerald-400 transition-transform active:scale-90"
        >
          <Undo2 className="size-6" />
        </button>
      </div>
    </div>
  );
}
