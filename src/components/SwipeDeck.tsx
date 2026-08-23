"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { X, Check, Clock } from "lucide-react";
import { BookmarkCard, type SwipeDirection } from "@/components/BookmarkCard";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useTelegram } from "@/components/TelegramProvider";
import { useI18n } from "@/components/I18nProvider";

export function SwipeDeck({
  bookmarks,
  onSwipe,
  onOpen,
  onRetry,
  done,
  showHint,
  swipeCount,
}: {
  bookmarks: Bookmark[];
  onSwipe: (direction: SwipeDirection, bookmark: Bookmark) => void;
  onOpen: (bookmark: Bookmark) => void;
  onRetry?: (bookmark: Bookmark) => void;
  done?: number;
  showHint?: boolean;
  swipeCount?: number;
}) {
  const [exitX, setExitX] = useState(500);
  const [exitY, setExitY] = useState(0);
  const telegram = useTelegram();
  const { t } = useI18n();

  if (bookmarks.length === 0) return null;

  const current = bookmarks[0];
  const total = (done ?? 0) + bookmarks.length;
  const pct = total > 0 ? Math.min(100, Math.round(((done ?? 0) / total) * 100)) : 0;
  const showLabels = (swipeCount ?? 0) < 3;

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

        {showHint && (
          <div className="pointer-events-none absolute inset-0 z-20" style={{ zIndex: 25 }}>
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 220, damping: 22 }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-danger/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
            >
              {t("deck.hint.archive")}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 220, damping: 22 }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
            >
              {t("deck.hint.keep")}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 220, damping: 22 }}
              className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
            >
              {t("deck.hint.later")}
            </motion.div>
          </div>
        )}
      </div>

      {/* Прогресс теперь в Dynamic Island header (page.tsx) — тут убран */}

      {/* Action buttons - Tinder style */}
      <div className="flex items-center justify-center gap-6 py-4" style={{ zIndex: 20 }}>
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => {
              telegram?.haptic.impact("medium");
              handleSwipe("left");
            }}
            aria-label={t("deck.btn.archive")}
            title={t("deck.btn.archive")}
            className="flex size-14 items-center justify-center rounded-full border-2 border-danger/40 bg-surface text-danger transition-transform active:scale-90"
          >
            <X className="size-6" />
          </button>
          {showLabels && (
            <span className="text-[11px] font-medium text-muted">{t("deck.btn.archive")}</span>
          )}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => {
              telegram?.haptic.impact("heavy");
              handleSwipe("right");
            }}
            aria-label={t("deck.btn.keep")}
            title={t("deck.btn.keep")}
            className="flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition-transform active:scale-90"
          >
            <Check className="size-7 stroke-[3]" />
          </button>
          {showLabels && (
            <span className="text-[11px] font-medium text-muted">{t("deck.btn.keep")}</span>
          )}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => {
              telegram?.haptic.impact("light");
              handleSwipe("up");
            }}
            aria-label={t("deck.btn.later")}
            title={t("deck.btn.later")}
            className="flex size-14 items-center justify-center rounded-full border-2 border-amber-400/40 bg-surface text-amber-400 transition-transform active:scale-90"
          >
            <Clock className="size-6" />
          </button>
          {showLabels && (
            <span className="text-[11px] font-medium text-muted">{t("deck.btn.later")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
