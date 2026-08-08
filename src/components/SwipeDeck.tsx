"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef, useState } from "react";

export type CardData = {
  id: string;
  title: string;
  url?: string | null;
  type?: string;
  caption?: string;
  createdAt: string;
};

export type SwipeDirection = "left" | "right" | "up";

const SWIPE_DISTANCE = 100;
const SWIPE_VELOCITY = 500;

function directionFrom(offset: { x: number; y: number }, velocity: { x: number; y: number }): SwipeDirection | null {
  if (offset.y < -SWIPE_DISTANCE && Math.abs(offset.y) > Math.abs(offset.x)) return "up";
  if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) return "right";
  if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) return "left";
  return null;
}

export function SwipeDeck({
  cards,
  onSwipe,
  index,
}: {
  cards: CardData[];
  onSwipe: (card: CardData, direction: SwipeDirection) => void;
  index: number;
}) {
  const card = cards[index];
  if (!card) return null;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-14, 14]);
  const archiveOpacity = useTransform(x, [-160, -40], [1, 0]);
  const laterOpacity = useTransform(x, [40, 160], [0, 1]);

  const typeIcon =
    card.type === "photo" ? "📷" :
    card.type === "video" ? "🎬" :
    card.type === "text" ? "📝" :
    card.type === "forward" ? "📨" :
    "🔗";

  const typeLabel =
    card.type === "photo" ? "Фото" :
    card.type === "video" ? "Видео" :
    card.type === "text" ? "Заметка" :
    card.type === "forward" ? "Переслано" :
    "Ссылка";

  const nextCards = cards.slice(index + 1, index + 4);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <p className="mb-3 text-xs text-neutral-500">
        {index + 1} / {cards.length}
      </p>

      <div className="relative w-full max-w-sm" style={{ height: 420 }}>
        {/* Стопка следующих карточек */}
        {nextCards.map((_, i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-2xl bg-neutral-900 shadow-xl"
            style={{
              zIndex: 5 - i,
              scale: 1 - (i + 1) * 0.04,
              y: (i + 1) * 8,
            }}
          />
        ))}

        {/* Текущая карточка */}
        <motion.div
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{ zIndex: 10, x, y, rotate: rotate }}
          drag
          dragMomentum={false}
          onDragEnd={async (_, info) => {
            const dir = directionFrom(info.offset, info.velocity);
            if (!dir) {
              await Promise.all([
                animate(x, 0, { type: "spring", stiffness: 400, damping: 40 }),
                animate(y, 0, { type: "spring", stiffness: 400, damping: 40 }),
              ]);
              return;
            }
            if (dir === "up") {
              await Promise.all([
                animate(x, 0, { type: "spring", stiffness: 400, damping: 40 }),
                animate(y, -400, { type: "spring", stiffness: 400, damping: 40 }),
              ]);
              onSwipe(card, dir);
              x.set(0);
              y.set(0);
              return;
            }
            await Promise.all([
              animate(x, dir === "right" ? 600 : -600, { duration: 0.2 }),
              animate(y, info.offset.y * 1.2, { duration: 0.2 }),
            ]);
            onSwipe(card, dir);
            x.set(0);
            y.set(0);
          }}
        >
          <motion.div
            className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-purple-700 to-neutral-900 p-6 text-white shadow-2xl"
            layout
          >
            {/* Фоновый градиент (имитация изображения) */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />

            {/* Верх: тип контента */}
            <div className="relative z-10 flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                {typeIcon} {typeLabel}
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                {new Date(card.createdAt).toLocaleDateString("ru")}
              </span>
            </div>

            {/* Низ: заголовок + URL */}
            <div className="relative z-10">
              <h2 className="text-xl font-semibold leading-tight line-clamp-4">
                {card.title}
              </h2>
              {card.url && (
                <p className="mt-2 truncate text-sm text-white/70">{card.url}</p>
              )}
            </div>

            {/* Подписи свайпа */}
            <motion.span
              style={{ opacity: archiveOpacity }}
              className="absolute top-8 right-6 z-20 rotate-12 rounded-lg border-4 border-rose-500 px-2 py-0.5 text-base font-black text-rose-500"
            >
              В АРХИВ
            </motion.span>
            <motion.span
              style={{ opacity: laterOpacity }}
              className="absolute top-8 left-6 z-20 -rotate-12 rounded-lg border-4 border-emerald-400 px-2 py-0.5 text-base font-black text-emerald-400"
            >
              ПОТОМ
            </motion.span>
          </motion.div>
        </motion.div>
      </div>

      {/* Кнопки */}
      <div className="mt-8 flex gap-8">
        <button
          onClick={() => onSwipe(card, "left")}
          className="flex size-14 items-center justify-center rounded-full bg-neutral-800 text-2xl shadow-lg active:scale-90 transition-transform hover:bg-rose-500/20"
        >
          ✕
        </button>
        <button
          onClick={() => {
            if (card.url) window.open(card.url, "_blank");
            onSwipe(card, "up");
          }}
          className="flex size-14 items-center justify-center rounded-full bg-neutral-800 text-2xl shadow-lg active:scale-90 transition-transform hover:bg-blue-500/20"
        >
          🔗
        </button>
        <button
          onClick={() => onSwipe(card, "right")}
          className="flex size-14 items-center justify-center rounded-full bg-neutral-800 text-2xl shadow-lg active:scale-90 transition-transform hover:bg-emerald-500/20"
        >
          ✓
        </button>
      </div>
    </div>
  );
}