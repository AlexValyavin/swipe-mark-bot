"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
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

  const handleSwipe = (direction: SwipeDirection) => {
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
    <div className="relative flex h-full w-full max-w-[90vw] mx-auto">
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
            exit={{ opacity: 0, scale: 0.95, x: 500 }}
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
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 pointer-events-none" style={{ zIndex: 5 }}>
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
  );
}