"use client";

import { useRef, useState } from "react";

export type CardData = {
  id: string;
  title: string;
  url?: string | null;
  type?: string;
  caption?: string;
  createdAt: string;
};

type SwipeDirection = "left" | "right" | "up";

export function SwipeDeck({
  cards,
  onSwipe,
}: {
  cards: CardData[];
  onSwipe: (card: CardData, direction: SwipeDirection) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  if (cards.length === 0) return null;
  if (current >= cards.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-500">
        Всё разобрано! 🎉
      </div>
    );
  }

  const card = cards[current];

  const handleStart = (x: number, y: number) => {
    dragging.current = true;
    startPos.current = { x, y };
  };

  const handleMove = (x: number, y: number) => {
    if (!dragging.current) return;
    setOffset({
      x: x - startPos.current.x,
      y: y - startPos.current.y,
    });
  };

  const handleEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;

    const dx = offset.x;
    const dy = offset.y;
    const threshold = 80;

    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
      // Горизонтальный свайп
      const dir: SwipeDirection = dx > 0 ? "right" : "left";
      onSwipe(card, dir);
      setCurrent((c) => c + 1);
    } else if (dy < -threshold && Math.abs(dy) > Math.abs(dx)) {
      // Вертикальный вверх — открыть ссылку
      onSwipe(card, "up");
      setCurrent((c) => c + 1);
    } else {
      // Возвращаем карточку на место
      setOffset({ x: 0, y: 0 });
    }
    setOffset({ x: 0, y: 0 });
  };

  const rotation = offset.x * 0.05;
  const opacity = Math.max(
    0,
    1 - Math.abs(offset.x) / 400
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      {/* Счётчик */}
      <p className="mb-3 text-xs text-neutral-500">
        {current + 1} / {cards.length}
      </p>

      {/* Карточка */}
      <div
        className="relative w-full max-w-sm cursor-grab select-none touch-none"
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={(e) => {
          const t = e.touches[0];
          handleStart(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          handleMove(t.clientX, t.clientY);
        }}
        onTouchEnd={handleEnd}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
          opacity,
          transition: dragging.current ? "none" : "transform 0.3s, opacity 0.3s",
        }}
      >
        <div className="flex flex-col gap-3 rounded-2xl bg-neutral-900 p-6 shadow-xl">
          {/* Тип контента */}
          {card.type === "photo" && <div className="text-2xl">📷 Фото</div>}
          {card.type === "video" && <div className="text-2xl">🎬 Видео</div>}
          {(card.type === "link" || (!card.type && card.url)) && (
            <div className="text-2xl">🔗 Ссылка</div>
          )}
          {card.type === "text" && <div className="text-2xl">📝 Заметка</div>}
          {card.type === "forward" && <div className="text-2xl">📨 Переслано</div>}

          {/* Заголовок / текст */}
          <h2 className="text-lg font-semibold leading-snug line-clamp-4">
            {card.title}
          </h2>

          {/* URL */}
          {card.url && (
            <p className="truncate text-xs text-blue-400">{card.url}</p>
          )}

          {/* Дата */}
          <p className="text-[10px] text-neutral-600">
            {new Date(card.createdAt).toLocaleString("ru")}
          </p>
        </div>

        {/* Подписи направлений */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-6">
          <span className="text-2xl font-bold text-rose-500 opacity-0">✕</span>
          <span className="text-2xl font-bold text-emerald-500 opacity-0">✓</span>
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="mt-6 flex gap-6">
        <button
          onClick={() => {
            onSwipe(card, "left");
            setCurrent((c) => c + 1);
          }}
          className="flex size-14 items-center justify-center rounded-full bg-neutral-800 text-2xl active:scale-90 transition-transform"
        >
          ✕
        </button>
        <button
          onClick={() => {
            if (card.url) window.open(card.url, "_blank");
            onSwipe(card, "up");
            setCurrent((c) => c + 1);
          }}
          className="flex size-14 items-center justify-center rounded-full bg-neutral-800 text-2xl active:scale-90 transition-transform"
        >
          🔗
        </button>
        <button
          onClick={() => {
            onSwipe(card, "right");
            setCurrent((c) => c + 1);
          }}
          className="flex size-14 items-center justify-center rounded-full bg-neutral-800 text-2xl active:scale-90 transition-transform"
        >
          ✓
        </button>
      </div>
    </div>
  );
}