"use client";

import { useEffect, useState, useRef } from "react";
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
  MoreHorizontal,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { useI18n, syncLang } from "@/components/I18nProvider";
import { initClientAnalytics, trackClient } from "@/lib/analyticsClient";
import { SwipeDeck } from "@/components/SwipeDeck";
import type { SwipeDirection } from "@/components/BookmarkCard";
import { getOpenTarget } from "@/lib/openTarget";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { Library } from "@/components/Library";
import { AiSettings } from "@/components/AiSettings";
import { DiagnosticsSettings } from "@/components/DiagnosticsSettings";
import { AddModal, AddButton } from "@/components/AddModal";
import { UiScaleSettings } from "@/components/UiScaleSettings";
import { FullscreenSettings } from "@/components/FullscreenSettings";

type Tab = "inbox" | "library" | "later";

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
  const { t, tp, lang, setLang } = useI18n();
  const twa = telegram?.app ?? null;
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [deck, setDeck] = useState<Bookmark[]>([]);
  const [archived, setArchived] = useState<Bookmark[]>([]);
  const [later, setLater] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("inbox");
  const [archiveTtlHours, setArchiveTtlHours] = useState<number | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
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
  const [lastSwipe, setLastSwipe] = useState<Bookmark | null>(null);
  const [undoLabel, setUndoLabel] = useState(t("undo.action.archive"));
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navHidden, setNavHidden] = useState(false);
  const swipedOnce = useRef(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [sessionArchived, setSessionArchived] = useState(0);
  const [sessionLater, setSessionLater] = useState(0);
  const [sessionOpened, setSessionOpened] = useState(0);
  const [swipeCount, setSwipeCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("swipe-count") || 0);
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
      if (data.uiScale === "s" || data.uiScale === "l") {
        document.documentElement.setAttribute("data-ui-scale", data.uiScale);
      }
      if (data.lang === "ru" || data.lang === "en") {
        setLang(data.lang);
      }
      if (data.onboarded !== undefined) {
        setOnboarded(data.onboarded === true);
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
    setLater(
      all.filter((b) => {
        const s = b.status || "new";
        if (s !== "later") return false;
        return !b.deferUntil || new Date(b.deferUntil).getTime() > now;
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
    setSessionOpened((n) => n + 1);
    postAction(bookmark.id, "open");
  };

  const handleSwipe = async (direction: SwipeDirection, bookmark: Bookmark) => {
    countSwipe();
    setLibrarySignal((s) => s + 1);
    if (!swipedOnce.current) {
      swipedOnce.current = true;
      setNavHidden(true);
    }
    if (direction === "left") {
      telegram?.haptic.impact("medium");
      setDeck((prev) => prev.filter((b) => b.id !== bookmark.id));
      setArchived((prev) => [...prev, bookmark]);
      setSessionDone((n) => n + 1);
      setSessionArchived((n) => n + 1);
      showUndoToast(bookmark);
      const res = await postAction(bookmark.id, "left");
      if (!res) loadBookmarks();
    } else if (direction === "up") {
      telegram?.haptic.impact("heavy");
      openBookmark(bookmark);
    } else {
      telegram?.haptic.impact("light");
      setDeck((prev) => prev.filter((b) => b.id !== bookmark.id));
      setLater((prev) => [bookmark, ...prev.filter((b) => b.id !== bookmark.id)]);
      setSessionDone((n) => n + 1);
      setSessionLater((n) => n + 1);
      showUndoToast(bookmark, t("undo.action.later"));
      const res = await postAction(bookmark.id, "right");
      if (!res) loadBookmarks();
    }
  };

  const showUndoToast = (bookmark: Bookmark, label = t("undo.action.archive")) => {
    setLastSwipe(bookmark);
    setUndoLabel(label);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setLastSwipe(null), 4000);
  };

  const undoLastSwipe = () => {
    telegram?.haptic.selection();
    if (!lastSwipe) return;
    const bm = lastSwipe;
    setLastSwipe(null);
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    setLibrarySignal((s) => s + 1);
    setArchived((prev) => prev.filter((x) => x.id !== bm.id));
    setLater((prev) => prev.filter((x) => x.id !== bm.id));
    setDeck((prev) => [bm, ...prev.filter((x) => x.id !== bm.id)]);
    postAction(bm.id, "undo");
  };

  const retryBookmark = async (bookmark: Bookmark) => {
    try {
      const res = await fetch(`/api/cards/${bookmark.id}/refetch`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.metaStatus === "failed") {
        // оставляем карточку, обновим только статус
      }
    } catch {
      // молча
    } finally {
      refresh();
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

  const finishOnboarding = async () => {
    telegram?.haptic.impact("medium");
    setOnboarded(true);
    trackClient("onboarding_completed");
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarded: true }),
      });
    } catch {
      // даже если не сохранится — не блокируем пользователя
    }
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
    setLater((prev) => [...prev.filter((b) => b.id !== bookmark.id), bookmark]);
    postAction(bookmark.id, "later");
  };

  const archiveFromLater = (bookmark: Bookmark) => {
    telegram?.haptic.impact("medium");
    setLater((prev) => prev.filter((b) => b.id !== bookmark.id));
    setArchived((prev) => [...prev, bookmark]);
    postAction(bookmark.id, "left");
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
      setSwipeCount(n);
      if (n >= 10) dismissHint();
    } catch {
      // localStorage может быть недоступен — игнорируем
    }
  };

  const refresh = () => {
    setLoading(true);
    setSessionDone(0);
    setSessionArchived(0);
    setSessionLater(0);
    setSessionOpened(0);
    loadCounts();
    loadBookmarks()
      .catch((e) => setError(e instanceof Error ? e.message : t("app.error.load")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  // Онбординг показан.
  useEffect(() => {
    if (onboarded === false) {
      trackClient("onboarding_started");
    }
  }, [onboarded]);

  // Первое открытие колоды (один раз на пользователя через localStorage).
  useEffect(() => {
    if (deck.length > 0) {
      let seen = false;
      try {
        seen = localStorage.getItem("swipe-deck-seen") === "1";
      } catch {
        seen = false;
      }
      if (!seen) {
        try {
          localStorage.setItem("swipe-deck-seen", "1");
        } catch {}
        trackClient("first_deck_opened", { deck_size: deck.length });
      }
    }
  }, [deck.length]);

  // Библиотека открыта (переход на вкладку).
  useEffect(() => {
    if (tab === "library") {
      trackClient("library_opened");
    }
  }, [tab]);

  // Сессия завершена: колода опустела, но карточки есть.
  const completedRef = useRef(false);
  useEffect(() => {
    if (deck.length === 0 && bookmarks.length > 0 && sessionDone > 0 && !completedRef.current) {
      completedRef.current = true;
      trackClient("session_completed", {
        done: sessionDone,
        archived: sessionArchived,
        later: sessionLater,
        opened: sessionOpened,
      });
    }
  }, [deck.length, bookmarks.length, sessionDone, sessionArchived, sessionLater, sessionOpened]);

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
          throw new Error(t("app.error.auth"));
        }
        const authData = (await authRes.json()) as { uid?: string };
        initClientAnalytics(authData.uid);
        await Promise.all([loadSettings(), loadBookmarks(), loadCounts()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("app.error.load"));
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
          <p className="mt-2 text-sm text-muted">{t("app.subtitle")}</p>
        </div>
        <a
          href="https://t.me/SwipeMarkBot/app"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-3 font-semibold text-white shadow-lg active:scale-95 transition-transform"
        >
          <span>{t("app.openInTelegram")}</span>
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
          <p className="text-sm text-muted">{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">⚠️</div>
        <p className="text-sm text-red-400">{t("app.error", { error })}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-surface px-6 py-2 text-sm"
        >
          {t("app.retry")}
        </button>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🔐</div>
        <p className="text-sm text-muted">{t("app.error.authData")}</p>
      </div>
    );
  }

  const showHint =
    tab === "inbox" && !folderDeck && deck.length > 0 && !hintDismissed;

  return (
    <div className="app-column mx-auto flex h-dvh w-full flex-col bg-bg">
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
            onClick={() => {
              telegram?.haptic.selection();
              setSettingsOpen(true);
            }}
            aria-label={t("header.settings")}
            title={t("header.settings")}
            className="flex size-9 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-text active:scale-90"
          >
            <MoreHorizontal className="size-5" />
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
                      aria-label={t("common.close")}
                      className="flex size-8 items-center justify-center rounded-full bg-surface text-muted active:scale-90"
                    >
                      <X className="size-4" />
                    </button>
                    <span className="text-sm font-medium text-text">
                      {t("header.folder", { name: folderDeck.folderName, count: folderDeckCards.length })}
                    </span>
                  </div>
                </div>
              )}

              {folderDeck ? (
                folderDeckLoading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  </div>
                ) : folderDeckCards.length > 0 ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-2 md:max-h-[min(820px,calc(100dvh-140px))]">
                    <SwipeDeck
                      bookmarks={folderDeckCards}
                      onSwipe={(dir, bm) => {
                        void handleSwipe(dir, bm);
                        setFolderDeckCards((prev) => prev.filter((b) => b.id !== bm.id));
                      }}
                      onOpen={openBookmark}
                      onRetry={retryBookmark}
                    />
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="text-5xl">📂</div>
                    <p className="text-sm text-muted">{t("header.folderEmpty")}</p>
                  </div>
                )
              ) : deck.length > 0 ? (
                <div className="flex flex-1 min-h-0 items-center justify-center px-4 pb-2 md:max-h-[min(820px,calc(100dvh-140px))]">
                  <SwipeDeck bookmarks={deck} onSwipe={handleSwipe} onOpen={openBookmark} onRetry={retryBookmark} done={sessionDone} showHint={showHint} swipeCount={swipeCount} />
                </div>
              ) : bookmarks.length > 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 180, damping: 14 }}
                    className="text-7xl"
                  >
                    🎉
                  </motion.div>
                  <div>
                    <p className="text-xl font-bold text-text">
                      {t("completion.title", { count: sessionDone, word: tp("words.save", sessionDone) })}
                    </p>
                    <p className="mt-1 text-sm text-muted">{t("completion.deckClean")}</p>
                  </div>
                  {(sessionArchived > 0 || sessionLater > 0 || sessionOpened > 0) && (
                    <div className="flex w-full max-w-[280px] flex-col gap-2">
                      {sessionOpened > 0 && (
                        <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-2.5">
                          <span className="text-sm text-muted">{t("completion.kept")}</span>
                          <span className="font-bold tabular-nums text-accent">
                            {sessionOpened}
                          </span>
                        </div>
                      )}
                      {sessionLater > 0 && (
                        <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-2.5">
                          <span className="text-sm text-muted">{t("completion.later")}</span>
                          <span className="font-bold tabular-nums text-success">
                            {sessionLater}
                          </span>
                        </div>
                      )}
                      {sessionArchived > 0 && (
                        <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-2.5">
                          <span className="text-sm text-muted">{t("completion.archived")}</span>
                          <span className="font-bold tabular-nums text-danger">
                            {sessionArchived}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex flex-col gap-2.5">
                    <button
                      onClick={() => {
                        telegram?.haptic.selection();
                        setTab("library");
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition-transform active:scale-95"
                    >
                      {t("completion.seeKept")}
                    </button>
                    <button
                      onClick={refresh}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-surface px-8 py-2.5 text-sm text-text hover:bg-line transition-colors"
                    >
                      <RefreshCw className="size-3.5" />
                      {t("completion.checkNew")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="flex size-20 items-center justify-center rounded-2xl bg-surface text-4xl">
                    📭
                  </div>
                  <h2 className="text-xl font-semibold text-text">{t("empty.title")}</h2>
                  <p className="max-w-xs text-sm text-muted">{t("empty.text")}</p>
                  <a
                    href="https://t.me/SwipeMarkBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition-transform active:scale-95"
                  >
                    {t("empty.openBot")}
                  </a>
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
          ) : tab === "later" ? (
            <motion.div
              key="later"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {later.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 hide-scrollbar">
                  {later.map((c) => (
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
                          {new Date(c.createdAt).toLocaleString(lang, {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          onClick={() => archiveFromLater(c)}
                          aria-label={t("deck.btn.archive")}
                          title={t("deck.btn.archive")}
                          className="flex size-8 items-center justify-center rounded-full bg-surface text-danger transition-colors hover:bg-line active:scale-90"
                        >
                          <Archive className="size-4" />
                        </button>
                        <button
                          onClick={() => returnToDeck(c)}
                          aria-label={t("library.toDeck")}
                          title={t("library.toDeck")}
                          className="flex size-8 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:bg-line active:scale-90"
                        >
                          <Undo2 className="size-4" />
                        </button>
                        <button
                          onClick={() => {
                            telegram?.haptic.impact("medium");
                            openBookmark(c);
                          }}
                          aria-label={t("common.open")}
                          title={t("common.open")}
                          className="flex size-8 items-center justify-center rounded-full bg-accent/15 text-accent transition-colors hover:bg-accent/25 active:scale-90"
                        >
                          <ExternalLink className="size-4" />
                        </button>
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
                    ⏰
                  </motion.div>
                  <p className="text-text">{t("later.emptyTitle")}</p>
                  <p className="text-sm text-muted">{t("later.emptyText")}</p>
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <motion.nav
        animate={{ y: navHidden && tab === "inbox" ? "100%" : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="flex items-stretch border-t border-line bg-surface/50 px-2 py-1.5"
        style={{ minHeight: 68 }}
      >
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setNavHidden(false);
            setTab("inbox");
          }}
          className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
            tab === "inbox" ? "text-accent" : "text-muted"
          }`}
        >
          <div className="relative">
            <Inbox className="size-[26px]" />
            {(folderDeck ? folderDeckCards.length > 0 : (counts?.inDeck ?? deck.length) > 0) && (
              <span className="absolute -right-3 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-text">
                {folderDeck ? folderDeckCards.length : counts?.inDeck ?? deck.length}
              </span>
            )}
          </div>
          <span className="text-xs font-medium">{t("nav.sort")}</span>
        </button>
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setNavHidden(false);
            setTab("library");
          }}
          className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
            tab === "library" ? "text-accent" : "text-muted"
          }`}
        >
          <div className="relative">
            <LibraryBig className="size-[26px]" />
            {(counts?.unsorted ?? 0) > 0 && (
              <span className="absolute -right-3 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-text">
                {counts?.unsorted ?? 0}
              </span>
            )}
          </div>
          <span className="text-xs font-medium">{t("nav.library")}</span>
        </button>
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setNavHidden(false);
            setTab("later");
          }}
          className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
            tab === "later" ? "text-accent" : "text-muted"
          }`}
        >
          <div className="relative">
            <Clock className="size-[26px]" />
            {later.length > 0 && (
              <span className="absolute -right-3 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-text">
                {later.length}
              </span>
            )}
          </div>
          <span className="text-xs font-medium">{t("nav.later")}</span>
        </button>
      </motion.nav>

      {/* Триггер для возврата навигации в immersive-режиме */}
      {navHidden && tab === "inbox" && (
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setNavHidden(false);
          }}
          aria-label={t("nav.showMenu")}
          className="fixed bottom-1.5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-line bg-surface/80 px-4 py-1 text-muted backdrop-blur-sm transition-colors hover:text-text active:scale-95"
          style={{ touchAction: "none" }}
        >
          ⋯
        </button>
      )}

      {/* Undo toast */}
      <AnimatePresence>
        {lastSwipe && deck.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full border border-line bg-surface/95 py-2 pl-4 pr-2 shadow-2xl backdrop-blur-sm"
          >
            <span className="text-fs-sm text-text">{undoLabel}</span>
            <button
              onClick={undoLastSwipe}
              className="rounded-full bg-accent px-3 py-1 text-fs-sm font-semibold text-accent-text transition-colors active:scale-95"
            >
              {t("undo.undo")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
                  <h2 className="text-base font-bold text-text">{t("clearArchive.title")}</h2>
                  <p className="text-xs text-muted">{t("clearArchive.text")}</p>
                </div>
              </div>
              <div className="mt-5 flex gap-2.5">
                <button
                  onClick={() => setClearConfirmOpen(false)}
                  className="flex-1 rounded-full bg-surface py-2.5 text-sm font-medium text-muted transition-colors hover:bg-line"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={clearArchive}
                  className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
                >
                  {t("clearArchive.deleteAll")}
                </button>
              </div>
</motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings sheet */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
            onClick={() => setSettingsOpen(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex max-h-[85dvh] w-full max-w-sm flex-col rounded-t-3xl border border-line bg-surface sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-4">
                <h2 className="text-lg font-bold text-text">{t("settings.title")}</h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  aria-label={t("common.close")}
                  className="flex size-9 items-center justify-center rounded-full bg-surface text-muted active:scale-90"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto hide-scrollbar">
                <div className="flex flex-col gap-2 p-5 pb-0">
                  <UiScaleSettings />
                  <FullscreenSettings />
                </div>
                <div className="flex items-center justify-between gap-3 px-5 pt-4">
                  <span className="text-sm font-medium text-text">
                    {t("settings.language")}
                  </span>
                  <div className="flex items-center gap-1 rounded-full bg-bg p-1">
                    {(["ru", "en"] as const).map((code) => (
                      <button
                        key={code}
                        onClick={() => {
                          telegram?.haptic.selection();
                          setLang(code);
                          syncLang(code);
                        }}
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase transition-colors ${
                          lang === code
                            ? "bg-accent text-accent-text"
                            : "text-muted hover:text-text"
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2 px-5 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {t("settings.archive")}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">{t("settings.ttl")}</span>
                    {[
                      { label: t("settings.ttl.24"), hours: 24 },
                      { label: t("settings.ttl.7d"), hours: 168 },
                      { label: t("settings.ttl.30d"), hours: 720 },
                      { label: t("settings.ttl.off"), hours: null },
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
                      {t("settings.clear")}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted">
                    {t("settings.archiveHint")}
                  </p>
                </div>
                <div className="px-5 pb-5 pt-1">
                  <AiSettings />
                </div>
                <div className="px-5 pb-5">
                  <DiagnosticsSettings />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Онбординг */}
      {!loading && onboarded === false && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-bg sm:items-center"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
            className="w-full max-w-sm px-6 pb-8 sm:pb-6"
          >
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.1 }}
                className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-4xl shadow-2xl shadow-purple-500/30"
              >
                ⚡
              </motion.div>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-text">
                {t("onboarding.title")}
              </h1>
              <p className="mt-2 text-sm text-muted">{t("onboarding.sub")}</p>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <div className="flex items-center gap-3 rounded-xl bg-surface p-3.5">
                <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 text-lg">
                  📩
                </span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-text">{t("onboarding.saveTitle")}</p>
                  <p className="text-xs text-muted">{t("onboarding.saveText")}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-surface p-3.5">
                <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-xl bg-success/15 text-lg">
                  👆
                </span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-text">{t("onboarding.sortTitle")}</p>
                  <p className="text-xs text-muted">{t("onboarding.sortText")}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-surface p-3.5">
                <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-lg">
                  ✨
                </span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-text">{t("onboarding.aiTitle")}</p>
                  <p className="text-xs text-muted">{t("onboarding.aiText")}</p>
                </div>
              </div>
            </div>

            <button
              onClick={finishOnboarding}
              className="mt-6 w-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-500/30 transition-transform active:scale-[0.98]"
            >
              {t("onboarding.start")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
