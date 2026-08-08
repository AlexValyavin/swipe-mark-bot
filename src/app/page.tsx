"use client";

import { useEffect, useState } from "react";
import { useTelegram } from "@/components/TelegramProvider";
import { SwipeDeck, type CardData } from "@/components/SwipeDeck";

export default function Home() {
  const twa = useTelegram();
  const [userId, setUserId] = useState<string | null>(null);
  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [archivedCards, setArchivedCards] = useState<CardData[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"inbox" | "archive">("inbox");

  const isMiniApp = !!twa;
  const user = twa?.initDataUnsafe?.user;
  const initData = twa?.initData;

  useEffect(() => {
    if (!initData || !user) {
      setLoading(false);
      return;
    }

    const uid = `tg:${user.id}`;
    setUserId(uid);

    fetch(`/api/bookmarks?userId=${uid}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setAllCards(data.bookmarks || []);
        }
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [initData, user?.id]);

  const handleSwipe = (card: CardData, direction: "left" | "right" | "up") => {
    if (direction === "right" || direction === "up") {
      setArchivedCards((prev) => [...prev, card]);
    }
    setCardIndex((i) => i + 1);
  };

  const resetCards = () => {
    setCardIndex(0);
  };

  const inboxCards = allCards.filter(
    (c) => !archivedCards.find((a) => a.id === c.id)
  );

  if (!isMiniApp) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-6xl">👋</div>
        <h1 className="text-2xl font-bold">SwipeMark</h1>
        <p className="text-sm text-neutral-400">
          Открой приложение через бота @SwipeMarkBot, чтобы смотреть и
          сортировать сохранённые ссылки.
        </p>
        <a
          href="https://t.me/SwipeMarkBot/app"
          className="mt-4 rounded-full bg-white px-8 py-3 font-semibold text-black"
        >
          Открыть в Telegram
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-400">
        Загрузка…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-4xl">⚠️</div>
        <p className="text-sm text-red-400">Ошибка: {error}</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-4xl">⚠️</div>
        <p className="text-sm text-neutral-400">
          Не удалось получить данные авторизации.
        </p>
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col">
      {/* Шапка с табами */}
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-lg font-bold">SwipeMark</h1>
        <div className="flex gap-1 rounded-lg bg-neutral-900 p-1">
          <button
            onClick={() => setTab("inbox")}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              tab === "inbox"
                ? "bg-white text-black"
                : "text-neutral-400"
            }`}
          >
            Входящие
          </button>
          <button
            onClick={() => setTab("archive")}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              tab === "archive"
                ? "bg-white text-black"
                : "text-neutral-400"
            }`}
          >
            Архив
          </button>
        </div>
      </header>

      {/* Inbox — свайп-дек */}
      {tab === "inbox" &&
        (inboxCards.length > 0 ? (
          cardIndex < inboxCards.length ? (
            <SwipeDeck
              cards={inboxCards}
              onSwipe={handleSwipe}
              index={cardIndex}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <span className="text-4xl">🎉</span>
              <p className="text-neutral-500">Всё разобрано!</p>
              <button
                onClick={resetCards}
                className="mt-2 rounded-full bg-neutral-800 px-6 py-2 text-sm text-neutral-300"
              >
                Показать заново
              </button>
            </div>
          )
        ) : allCards.length > 0 ? (
          <div className="flex flex-1 items-center justify-center text-neutral-500">
            Всё разобрано! 🎉
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="text-6xl">📭</div>
            <h2 className="text-xl font-semibold">Нет сохранений</h2>
            <p className="text-sm text-neutral-400">
              Отправь ссылку, фото или видео боту @SwipeMarkBot — они появятся
              здесь.
            </p>
          </div>
        ))}

      {/* Archive — список */}
      {tab === "archive" &&
        (archivedCards.length > 0 ? (
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            {archivedCards.map((c) => (
              <div key={c.id} className="rounded-xl bg-neutral-900 p-3">
                <p className="text-sm font-medium line-clamp-2">{c.title}</p>
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-xs text-blue-400"
                  >
                    {c.url}
                  </a>
                )}
                <p className="mt-1 text-[10px] text-neutral-600">
                  {new Date(c.createdAt).toLocaleString("ru")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-neutral-500">
            Архив пуст
          </div>
        ))}
    </main>
  );
}