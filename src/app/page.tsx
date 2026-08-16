"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Inbox,
  Archive,
  RefreshCw,
  Undo2,
  ExternalLink,
  Clock,
  Trash2,
  X,
  LibraryBig,
  Settings,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { SwipeDeck } from "@/components/SwipeDeck";
import type { SwipeDirection } from "@/components/BookmarkCard";
import { getOpenTarget } from "@/lib/openTarget";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { Library } from "@/components/Library";
import { AiSettings } from "@/components/AiSettings";
import { DiagnosticsSettings } from "@/components/DiagnosticsSettings";
import { AddModal, AddButton } from "@/components/AddModal";

type Tab = "inbox" | "archive" | "library" | "settings";

function groupByDay(list: Bookmark[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const groups: { label: string; items: Bookmark[] }[] = [];
  const today: Bookmark[] = [];
  const yesterday: Bookmark[] = [];
  const older: Bookmark[] = [];
  for (const b of list) {
    const t = new Date(b.createdAt || 0).getTime();
    if (t >= startOfToday) today.push(b);
    else if (t >= startOfYesterday) yesterday.push(b);
    else older.push(b);
  }
  if (today.length) groups.push({ label: "Сегодня", items: today });
  if (yesterday.length) groups.push({ label: "Вчера", items: yesterday });
  if (older.length) groups.push({ label: "Ранее", items: older });
  return groups;
}

function typeEmoji(c: Bookmark): string {
  if (c.type === "photo") return "📷";
  if (c.type === "video") return "🎬";
  if (c.type === "text") return "📝";
  if (c.type === "forward") return "📨";
  return "🔗";
}

function thumbFor(c: Bookmark): string | null {
  return c.imageUrl || c.mediaItems?.[0]?.imageUrl || null;
}

export default function Home() {
  const telegram = useTelegram();
  const twa = telegram?.app ?? null;
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [deck, setDeck] = useState<Bookmark[]>([]);
  const [archived, setArchived] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("inbox");
  const [archiveTtlHours, setArchiveTtlHours] = useState<number | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [librarySignal, setLibrarySignal] = useState(0);
  const [counts, setCounts] = useState<{
    inDeck: number;
    readLater: number;
    archived: number;
    unsorted: number;
  } | null>(null);
  const [folderDeck, setFolderDeck] = useState<{
    folderId: string;
    folderName: string;
  } | null>(null);
  const [folderDeckCards, setFolderDeckCards] = useState<Bookmark[]>([]);
  const [folderDeckLoading, setFolderDeckLoading] = useState(false);
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("swipe-hint-seen") === "1";
  });

  const isMiniApp = !!twa;
  const user = twa?.initDataUnsafe?.user;
  const initData = twa?.initData;

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.archiveTtlHours !== undefined) {
        setArchiveTtlHours(
          typeof data.archiveTtlHours === "number" ? data.archiveTtlHours : null
        );
      }
    } catch {
      // настройки не критичны — молча пропускаем
    }
  };

  const loadCounts = async () => {
    try {
      const res = await fetch("/api/counts");
      if (!res.ok) return;
      const data = await res.json();
      setCounts(data);
    } catch {
      // бейджи не критичны
    }
  };

  const loadBookmarks = async () => {
    const res = await fetch("/api/bookmarks");
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error);
    }

    const now = Date.now();
    const all: Bookmark[] = data.bookmarks || [];
    setBookmarks(all);
    setDeck(
      all.filter((b) => {
        const s = b.status || "new";
        if (s === "new") return true;
        if (s === "later" && b.deferUntil && new Date(b.deferUntil).getTime() <= now) {
          return true;
        }
        return false;
      })
    );
    setArchived(all.filter((b) => (b.status || "new") === "archived"));
  };

  const postAction = async (cardId: string, action: string) => {
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          action,
          idempotencyKey: `${cardId}:${action}:${crypto.randomUUID()}`,
        }),
      });
      if (!res.ok) return null;
      return (await res.json()) as { status?: string } | null;
    } catch {
      return null;
    }
  };

  const openBookmark = (bookmark: Bookmark) => {
    const target = getOpenTarget(bookmark);
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
    postAction(bookmark.id, "open");
  };

  const handleSwipe = async (direction: SwipeDirection, bookmark: Bookmark) => {
    countSwipe();
    setLibrarySignal((s) => s + 1);
    if (direction === "left") {
      telegram?.haptic.impact("medium");
      setDeck((prev) => prev.filter((b) => b.id !== bookmark.id));
      setArchived((prev) => [...prev, bookmark]);
      const res = await postAction(bookmark.id, "left");
      if (!res) loadBookmarks();
    } else if (direction === "up") {
      telegram?.haptic.impact("heavy");
      openBookmark(bookmark);
    } else {
      telegram?.haptic.impact("light");
      setDeck((prev) => prev.filter((b) => b.id !== bookmark.id));
      const res = await postAction(bookmark.id, "right");
      if (res?.status === "archived") {
        setArchived((prev) => [...prev, bookmark]);
      } else {
        setDeck((prev) => [...prev, bookmark]);
      }
      if (!res) loadBookmarks();
    }
  };

  const openFolderDeck = async (folderId: string, folderName: string) => {
    setFolderDeck({ folderId, folderName });
    setFolderDeckCards([]);
    setFolderDeckLoading(true);
    setTab("inbox");
    try {
      const res = await fetch(`/api/deck?folderId=${encodeURIComponent(folderId)}`);
      const data = await res.json();
      if (!data.error) {
        setFolderDeckCards(data.bookmarks || []);
      }
    } catch {
      // молча — пустая колода
    } finally {
      setFolderDeckLoading(false);
    }
  };

  const closeFolderDeck = () => {
    setFolderDeck(null);
    setFolderDeckCards([]);
    refresh();
  };

  const returnToDeck = (bookmark: Bookmark) => {
    telegram?.haptic.selection();
    setLibrarySignal((s) => s + 1);
    setArchived((prev) => prev.filter((b) => b.id !== bookmark.id));
    setDeck((prev) => [bookmark, ...prev]);
    setTab("inbox");
    postAction(bookmark.id, "undo");
  };

  const postponeFromArchive = (bookmark: Bookmark) => {
    telegram?.haptic.selection();
    setLibrarySignal((s) => s + 1);
    setArchived((prev) => prev.filter((b) => b.id !== bookmark.id));
    postAction(bookmark.id, "later");
  };

  const setTtl = (hours: number | null, cutoff: number | null) => {
    telegram?.haptic.selection();
    setArchiveTtlHours(hours);
    if (cutoff) {
      setArchived((prev) =>
        prev.filter((c) => new Date(c.createdAt).getTime() >= cutoff)
      );
    }
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archiveTtlHours: hours }),
    }).catch(() => {});
  };

  const clearArchive = async () => {
    setClearConfirmOpen(false);
    telegram?.haptic.notification("success");
    try {
      const res = await fetch("/api/bookmarks", { method: "DELETE" });
      if (!res.ok) return;
      setArchived([]);
      setBookmarks((prev) =>
        prev.filter((b) => (b.status || "new") !== "archived")
      );
    } catch {
      // молча игнорируем сетевые ошибки
    }
  };

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem("swipe-hint-seen", "1");
  };

  const countSwipe = () => {
    try {
      const n = Number(localStorage.getItem("swipe-count") || 0) + 1;
      localStorage.setItem("swipe-count", String(n));
      if (n >= 10) dismissHint();
    } catch {
      // localStorage может быть недоступен — игнорируем
    }
  };

  const refresh = () => {
    setLoading(true);
    loadCounts();
    loadBookmarks()
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!initData || !user) {
      setLoading(false);
      return;
    }

    const uid = `tg:${user.id}`;
    setUserId(uid);

    (async () => {
      try {
        const authRes = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        if (!authRes.ok) {
          throw new Error("Авторизация не прошла");
        }
        await Promise.all([loadSettings(), loadBookmarks(), loadCounts()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    })();
  }, [initData, user?.id]);

  if (!isMiniApp) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-4xl shadow-2xl">
          ⚡
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Swipe<span className="text-accent">Mark</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
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
          <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-muted">Загрузка...</p>
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
          className="rounded-full bg-surface px-6 py-2 text-sm"
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
        <p className="text-sm text-muted">Не удалось получить данные авторизации.</p>
      </div>
    );
  }

  const showHint =
    tab === "inbox" && !folderDeck && deck.length > 0 && !hintDismissed;
  const groups = groupByDay(archived);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-lg text-white shadow-lg">
            ⚡
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AddButton
            onOpen={() => {
              telegram?.haptic.selection();
              setAddOpen(true);
            }}
          />
          <button
            onClick={refresh}
            aria-label="Обновить"
            title="Обновить"
            className="flex size-9 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-text active:scale-90"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="wait">
          {tab === "inbox" ? (
            <motion.div
              key="inbox"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {folderDeck && (
                <div className="flex flex-col px-5 pb-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={closeFolderDeck}
                      aria-label="Закрыть"
                      className="flex size-8 items-center justify-center rounded-full bg-surface text-muted active:scale-90"
                    >
                      <X className="size-4" />
                    </button>
                    <span className="text-sm font-medium text-text">
                      Папка: {folderDeck.folderName} · {folderDeckCards.length}
                    </span>
                  </div>
                </div>
              )}

              {showHint && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-5 mb-2 flex items-center gap-2 rounded-xl bg-surface px-4 py-2.5"
                >
                  <span className="text-lg">👆</span>
                  <p className="flex-1 text-xs text-muted">
                    Влево — в архив · Вправо — позже · Вверх — открыть
                  </p>
                  <button
                    onClick={dismissHint}
                    aria-label="Скрыть подсказку"
                    className="flex size-6 items-center justify-center rounded-full text-muted active:scale-90"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.div>
              )}

              {folderDeck ? (
                folderDeckLoading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  </div>
                ) : folderDeckCards.length > 0 ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-2">
                    <SwipeDeck
                      bookmarks={folderDeckCards}
                      onSwipe={(dir, bm) => {
                        void handleSwipe(dir, bm);
                        setFolderDeckCards((prev) => prev.filter((b) => b.id !== bm.id));
                      }}
                      onOpen={openBookmark}
                    />
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="text-5xl">📂</div>
                    <p className="text-sm text-muted">В папке пока нет карточек</p>
                  </div>
                )
              ) : deck.length > 0 ? (
                <div className="flex flex-1 min-h-0 items-center justify-center px-4 pb-2">
                  <SwipeDeck bookmarks={deck} onSwipe={handleSwipe} onOpen={openBookmark} />
                </div>
              ) : bookmarks.length > 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="text-6xl"
                  >
                    🎉
                  </motion.div>
                  <p className="text-lg font-medium text-text">Всё разобрано!</p>
                  <p className="text-sm text-muted">
                    {archived.length} сохранений в архиве
                  </p>
                  <button
                    onClick={refresh}
                    className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface px-6 py-2 text-sm text-text hover:bg-line transition-colors"
                  >
                    <RefreshCw className="size-3.5" />
                    Обновить
                  </button>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="flex size-20 items-center justify-center rounded-2xl bg-surface text-4xl">
                    📭
                  </div>
                  <h2 className="text-xl font-semibold text-text">Нет сохранений</h2>
                  <p className="max-w-xs text-sm text-muted">
                    Отправь ссылку, фото или видео боту @SwipeMarkBot — они появятся здесь.
                  </p>
                </div>
              )}
            </motion.div>
          ) : tab === "archive" ? (
            <motion.div
              key="archive"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex items-center gap-1.5 px-5 py-2">
                <span className="text-xs text-muted">Очистка архива:</span>
                {[
                  { label: "24ч", hours: 24 },
                  { label: "7д", hours: 168 },
                  { label: "30д", hours: 720 },
                  { label: "Выкл", hours: null },
                ].map((opt) => (
                  <button
                    key={String(opt.hours)}
                    onClick={() =>
                      setTtl(opt.hours, opt.hours ? Date.now() - opt.hours * 60 * 60 * 1000 : null)
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      archiveTtlHours === opt.hours
                        ? "bg-accent text-accent-text"
                        : "bg-surface text-muted hover:text-text"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    telegram?.haptic.impact("medium");
                    setClearConfirmOpen(true);
                  }}
                  disabled={archived.length === 0}
                  className={`ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    archived.length === 0
                      ? "cursor-not-allowed bg-surface text-muted/40"
                      : "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                  }`}
                >
                  <Trash2 className="size-3" />
                  Очистить
                </button>
              </div>

              {archived.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 hide-scrollbar">
                  {groups.map((g) => (
                    <div key={g.label}>
                      <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                        {g.label}
                      </h3>
                      <div className="flex flex-col gap-1">
                        {g.items.map((c) => (
                          <div
                            key={c.id}
                            className="group flex items-center gap-3 rounded-xl bg-surface p-3 transition-colors hover:bg-line"
                          >
                            {thumbFor(c) ? (
                              <div className="relative size-12 flex-shrink-0 overflow-hidden rounded-lg bg-bg">
                                <div className="absolute inset-0 flex items-center justify-center text-xl">
                                  {typeEmoji(c)}
                                </div>
                                <img
                                  src={thumbFor(c) as string}
                                  alt=""
                                  className="absolute inset-0 size-full rounded-lg object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-lg bg-bg text-xl">
                                {typeEmoji(c)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-text">
                                {c.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted">
                                {new Date(c.createdAt).toLocaleString("ru", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1">
                              <button
                                onClick={() => postponeFromArchive(c)}
                                aria-label="Позже"
                                title="Позже"
                                className="flex size-8 items-center justify-center rounded-full bg-surface text-success transition-colors hover:bg-line active:scale-90"
                              >
                                <Clock className="size-4" />
                              </button>
                              <button
                                onClick={() => returnToDeck(c)}
                                aria-label="Вернуть в стопку"
                                title="Вернуть в стопку"
                                className="flex size-8 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:bg-line active:scale-90"
                              >
                                <Undo2 className="size-4" />
                              </button>
                              <button
                                onClick={() => {
                                  telegram?.haptic.impact("medium");
                                  openBookmark(c);
                                }}
                                aria-label="Открыть"
                                title="Открыть"
                                className="flex size-8 items-center justify-center rounded-full bg-accent/15 text-accent transition-colors hover:bg-accent/25 active:scale-90"
                              >
                                <ExternalLink className="size-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="text-5xl"
                  >
                    🗂️
                  </motion.div>
                  <p className="text-text">Архив пуст</p>
                  <p className="text-sm text-muted">Свайпни влево, чтобы отправить в архив</p>
                </div>
              )}
            </motion.div>
          ) : tab === "library" ? (
            <Library
              onOpen={openBookmark}
              onPostpone={postponeFromArchive}
              onReturnToDeck={returnToDeck}
              refreshSignal={librarySignal}
              onOpenFolderDeck={openFolderDeck}
            />
          ) : tab === "settings" ? (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <AiSettings />
              <DiagnosticsSettings />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <nav className="flex items-stretch border-t border-line bg-surface/50 px-2 py-2.5">
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setTab("inbox");
          }}
          className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 transition-colors ${
            tab === "inbox" ? "text-accent" : "text-muted"
          }`}
        >
          <div className="relative">
            <Inbox className="size-6" />
            {(folderDeck ? folderDeckCards.length > 0 : (counts?.inDeck ?? deck.length) > 0) && (
              <span className="absolute -right-3 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-text">
                {folderDeck ? folderDeckCards.length : counts?.inDeck ?? deck.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">Входящие</span>
        </button>
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setTab("library");
          }}
          className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 transition-colors ${
            tab === "library" ? "text-accent" : "text-muted"
          }`}
        >
          <div className="relative">
            <LibraryBig className="size-6" />
            {(counts?.unsorted ?? 0) > 0 && (
              <span className="absolute -right-3 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-text">
                {counts?.unsorted ?? 0}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">Библиотека</span>
        </button>
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setTab("archive");
          }}
          className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 transition-colors ${
            tab === "archive" ? "text-accent" : "text-muted"
          }`}
        >
          <div className="relative">
            <Archive className="size-6" />
            {archived.length > 0 && (
              <span className="absolute -right-3 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-text">
                {archived.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">Архив</span>
        </button>
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setTab("settings");
          }}
          className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 transition-colors ${
            tab === "settings" ? "text-accent" : "text-muted"
          }`}
        >
          <div className="relative">
            <Settings className="size-6" />
          </div>
          <span className="text-[10px] font-medium">Настройки</span>
        </button>
      </nav>

      {/* Add modal */}
      <AnimatePresence>
        {addOpen && (
          <AddModal
            onClose={() => setAddOpen(false)}
            onSaved={() => {
              refresh();
            }}
          />
        )}
      </AnimatePresence>

      {/* Clear archive confirm modal */}
      <AnimatePresence>
        {clearConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
            onClick={() => setClearConfirmOpen(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-full max-w-sm rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-red-600/20 text-red-400">
                  <Trash2 className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text">Очистить архив?</h2>
                  <p className="text-xs text-muted">
                    Будут удалены все карточки архива. Действие необратимо.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex gap-2.5">
                <button
                  onClick={() => setClearConfirmOpen(false)}
                  className="flex-1 rounded-full bg-surface py-2.5 text-sm font-medium text-muted transition-colors hover:bg-line"
                >
                  Отмена
                </button>
                <button
                  onClick={clearArchive}
                  className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
                >
                  Удалить всё
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
