"use client";

import { useEffect, useState } from "react";
import { useTelegram } from "@/components/TelegramProvider";

type Bookmark = {
  id: string;
  url: string;
  title: string;
  createdAt: string;
};

export default function Home() {
  const twa = useTelegram();
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMiniApp = !!twa;
  const user = twa?.initDataUnsafe?.user;
  const initData = twa?.initData;

  // Авторизация и загрузка закладок
  useEffect(() => {
    if (!initData || !user) {
      setLoading(false);
      return;
    }

    const uid = `tg:${user.id}`;
    setUserId(uid);

    // Загружаем закладки
    fetch(`/api/bookmarks?userId=${uid}`)
      .then((r) => r.json())
      .then((data) => {
        setBookmarks(data.bookmarks || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [initData, user?.id]);

  // Не в Telegram — показываем заглушку
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

  // Загрузка
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-400">
        Загрузка…
      </div>
    );
  }

  // Нет пользователя — ошибка авторизации
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

  // Есть закладки — показываем
  if (bookmarks.length > 0) {
    return (
      <main className="flex min-h-dvh flex-col p-4">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">SwipeMark</h1>
          <span className="text-xs text-neutral-500">
            {bookmarks.length} ссылок
          </span>
        </header>

        <div className="flex flex-1 flex-col gap-3">
          {bookmarks.map((b) => (
            <a
              key={b.id}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl bg-neutral-900 p-4 active:scale-[0.98] transition-transform"
            >
              <p className="text-sm font-medium line-clamp-2">{b.title}</p>
              <p className="mt-1 truncate text-xs text-neutral-500">{b.url}</p>
            </a>
          ))}
        </div>
      </main>
    );
  }

  // Нет закладок
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-6xl">📭</div>
      <h2 className="text-xl font-semibold">Нет сохранённых ссылок</h2>
      <p className="text-sm text-neutral-400">
        Отправь ссылку боту @SwipeMarkBot — она появится здесь.
      </p>
    </div>
  );
}