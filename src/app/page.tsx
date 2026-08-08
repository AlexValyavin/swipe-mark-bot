"use client";

import { useEffect, useState } from "react";
import { useTelegram } from "@/components/TelegramProvider";
import { SwipeDeck } from "@/components/SwipeDeck";
import type { Bookmark } from "@/app/api/bookmarks/route";

export default function Home() {
  const twa = useTelegram();
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [archived, setArchived] = useState<Bookmark[]>([]);
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
          setBookmarks(data.bookmarks || []);
        }
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [initData, user?.id]);

  const inbox = bookmarks.filter(
    (b) => !archived.find((a) => a.id === b.id)
  );

  const handleFinished = () => {
    setArchived((prev) => [...prev, ...inbox]);
  };

  const reset = () => {
    setArchived([]);
  };

  if (!isMiniApp) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-4xl shadow-2xl">
          ⚡
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Swipe<span className="text-indigo-400">Mark</span>
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Сохраняй ссылки и разбирай бэклог свайпами
          </p>
        </div>
        <a
          href="https://t.me/SwipeMarkBot/app"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-3 font-semibold text-white shadow-lg active:scale-95 transition-transform"
        >
          <span>Открыть в Telegram</span>
          <span>→</span>
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-neutral-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">⚠️</div>
        <p className="text-sm text-red-400">Ошибка: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-neutral-800 px-6 py-2 text-sm"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🔐</div>
        <p className="text-sm text-neutral-400">Не удалось получить данные авторизации.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <h1 className="text-lg font-bold tracking-tight">
          Swipe<span className="text-indigo-400">Mark</span>
        </h1>
        <div className="flex gap-1 rounded-lg bg-neutral-900 p-1">
          <button
            onClick={() => setTab("inbox")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === "inbox"
                ? "bg-white text-black shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Входящие
          </button>
          <button
            onClick={() => setTab("archive")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === "archive"
                ? "bg-white text-black shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Архив
            {archived.length > 0 && (
              <span className="ml-1.5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] text-white">
                {archived.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {tab === "inbox" &&
        (inbox.length > 0 ? (
          <div className="flex-1 min-h-[400px] flex items-center justify-center px-4">
            <SwipeDeck bookmarks={inbox} onFinished={handleFinished} />
          </div>
        ) : bookmarks.length > 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="text-6xl">🎉</div>
            <p className="text-lg font-medium text-neutral-300">Всё разобрано!</p>
            <p className="text-sm text-neutral-500">
              {archived.length} сохранений в архиве
            </p>
            <button
              onClick={reset}
              className="mt-2 rounded-full bg-neutral-800 px-6 py-2 text-sm text-neutral-300 hover:bg-neutral-700 transition-colors"
            >
              Показать снова
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex size-20 items-center justify-center rounded-2xl bg-neutral-900 text-4xl">
              📭
            </div>
            <h2 className="text-xl font-semibold">Нет сохранений</h2>
            <p className="text-sm text-neutral-400 max-w-xs">
              Отправь ссылку, фото или видео боту @SwipeMarkBot — они появятся здесь.
            </p>
          </div>
        ))}

      {tab === "archive" &&
        (archived.length > 0 ? (
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-4 hide-scrollbar">
            {archived.map((c) => (
              <div
                key={c.id}
                className="group rounded-xl bg-neutral-900 p-4 transition-colors hover:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2">{c.title}</p>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block truncate text-xs text-indigo-400 hover:underline"
                      >
                        {c.url}
                      </a>
                    )}
                  </div>
                  <div className="flex-shrink-0 self-start">
                    <span className="rounded-md bg-neutral-800 px-2 py-1 text-[10px] text-neutral-500">
                      {c.type === "photo" ? "📷" : c.type === "video" ? "🎬" : c.type === "text" ? "📝" : c.type === "forward" ? "📨" : "🔗"}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-neutral-600">
                  {new Date(c.createdAt).toLocaleString("ru", {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="text-5xl">🗂️</div>
            <p className="text-neutral-400">Архив пуст</p>
            <p className="text-sm text-neutral-500">Свайпни вправо, чтобы сохранить ссылку</p>
          </div>
        ))}
    </div>
  );
}
