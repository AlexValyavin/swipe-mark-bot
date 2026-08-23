"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  RefreshCw,
  Search,
  X,
  Trash2,
  Folder,
  Clock,
  Undo2,
  ExternalLink,
  Tag,
  Check,
  Sparkles,
  Loader2,
  Inbox,
  CheckCheck,
  Bot,
  Archive,
  ArrowUp,
  SlidersHorizontal,
} from "lucide-react";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useTelegram } from "@/components/TelegramProvider";
import { useI18n } from "@/components/I18nProvider";
import { SourceBadge, MetaStatusDot } from "@/components/SourceBadge";
import { MaterialSheet } from "@/components/MaterialSheet";
import { trackClient } from "@/lib/analyticsClient";

export type FolderMeta = {
  id: string;
  name: string;
  emoji: string | null;
  count: number;
  sortOrder: number;
};

type LibraryTab = "deck" | "later" | "archive";

/** Группировка по дате: Сегодня / На этой неделе / Раньше. */
function groupByPeriod(list: Bookmark[], labels: { today: string; week: string; earlier: string }) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dow = (now.getDay() + 6) % 7; // 0 = понедельник
  const startWeek = startToday - dow * 86400000;
  const groups: { label: string; items: Bookmark[] }[] = [];
  const today: Bookmark[] = [];
  const week: Bookmark[] = [];
  const earlier: Bookmark[] = [];
  for (const b of list) {
    const t = new Date(b.createdAt || 0).getTime();
    if (t >= startToday) today.push(b);
    else if (t >= startWeek) week.push(b);
    else earlier.push(b);
  }
  if (today.length) groups.push({ label: labels.today, items: today });
  if (week.length) groups.push({ label: labels.week, items: week });
  if (earlier.length) groups.push({ label: labels.earlier, items: earlier });
  return groups;
}

function fmtDate(iso: string, lang: "ru" | "en"): string {
  const d = new Date(iso);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - ((startToday.getDay() + 6) % 7));
  if (d.getTime() >= startToday.getTime()) {
    return d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  }
  if (d.getTime() >= startWeek.getTime()) {
    return d.toLocaleDateString(lang, { weekday: "short" });
  }
  return d.toLocaleDateString(lang, { day: "numeric", month: "short" });
}

function fmtDuration(sec?: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `⏱ ${m}:${s.toString().padStart(2, "0")}`;
}

function fmtReadMinutes(min?: number | null, lang: "ru" | "en" = "ru"): string | null {
  if (!min || min <= 0) return null;
  return `📖 ~${min} ${lang === "en" ? "min" : "мин"}`;
}

type Props = {
  onOpen: (bookmark: Bookmark) => void;
  onPostpone: (bookmark: Bookmark) => void;
  onReturnToDeck: (bookmark: Bookmark) => void;
  refreshSignal: number;
  onOpenFolderDeck?: (folderId: string, folderName: string) => void;
};

const EMOJI_PRESETS = ["📁", "💼", "🛒", "🏠", "❤️", "🎬", "📚", "🎮", "✈️", "🍔", "💡", "🧠", "💰", "🎵", "🏋️", "📝", "🧰", "🎓", "👨‍👩‍👧", "🌸"];

export function Library({
  onOpen,
  onPostpone,
  onReturnToDeck,
  refreshSignal,
  onOpenFolderDeck,
}: Props) {
  const telegram = useTelegram();
  const { t, tp, lang } = useI18n();
  const [tab, setTab] = useState<LibraryTab>("deck");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; count: number }[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [unsortedCount, setUnsortedCount] = useState(0);
  const [tabCounts, setTabCounts] = useState<{
    inDeck: number;
    readLater: number;
    archived: number;
  }>({ inDeck: 0, readLater: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [autosortOpen, setAutosortOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState<string | null>(null);
  const [folderMenuCard, setFolderMenuCard] = useState<Bookmark | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tagMenuCard, setTagMenuCard] = useState<Bookmark | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [detailBookmark, setDetailBookmark] = useState<Bookmark | null>(null);
  const [foldersCollapsed, setFoldersCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("library-folders-collapsed") === "1";
  });
  const [viewMode, setViewMode] = useState<"overview" | "all">("overview");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massMenu, setMassMenu] = useState<"none" | "folder" | "tag">("none");
  const [massBusy, setMassBusy] = useState(false);
  const [massTagInput, setMassTagInput] = useState("");
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("library-folders-collapsed", foldersCollapsed ? "1" : "0");
    } catch {}
  }, [foldersCollapsed]);

  // сброс viewMode при смене фильтра — возвращаемся в обзор
  useEffect(() => {
    if (folderId !== null || q.trim() || selectedTags.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewMode("overview");
    }
  }, [folderId, q, selectedTags]);

  const loadTags = async () => {
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      if (!data.error) {
        setAvailableTags(
          (data.tags || []).map((tag: { id: string; name: string; count: number }) => ({
            id: tag.id,
            name: tag.name,
            count: tag.count,
          }))
        );
      }
    } catch {
      // молча игнорируем, чипы просто не появятся
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("tab", tab);
      if (folderId) params.set("folderId", folderId);
      if (q.trim()) params.set("q", q.trim());
      if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
      const res = await fetch(`/api/library?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBookmarks(data.bookmarks || []);
      setFolders(
        (data.folders || []).map((f: FolderMeta) => ({
          id: f.id,
          name: f.name,
          emoji: f.emoji,
          count: f.count,
          sortOrder: f.sortOrder,
        }))
      );
      setUnsortedCount(Number(data.counts?.unsorted ?? 0));
      setTabCounts({
        inDeck: Number(data.counts?.inDeck ?? 0),
        readLater: Number(data.counts?.readLater ?? 0),
        archived: Number(data.counts?.archived ?? 0),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("app.error.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      void loadTags();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, folderId, selectedTags, refreshSignal]);

  // дебаунс поиска
  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const searchRef = useRef("");

  // Поиск использован: трекаем при непустом запросе.
  useEffect(() => {
    if (q.trim() && q.trim() !== searchRef.current) {
      searchRef.current = q.trim();
      trackClient("search_used", { query_length: q.trim().length });
    }
    if (!q.trim()) searchRef.current = "";
  }, [q]);

  const refresh = () => {
    telegram?.haptic.selection();
    load();
  };

  const createFolder = async (name: string, emoji: string) => {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emoji }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) return { error: t("folder.exists") };
      return { error: data.error || t("folder.createError") };
    }
    telegram?.haptic.selection();
    await load();
    trackClient("folder_created", { emoji });
    return { ok: true };
  };

  const deleteFolder = async (id: string, cardsTo: "none" | "archive") => {
    const res = await fetch(`/api/folders/${id}?cardsTo=${cardsTo}`, { method: "DELETE" });
    if (!res.ok) return;
    telegram?.haptic.impact("medium");
    if (folderId === id) setFolderId(null);
    setDeleteOpen(null);
    await load();
  };

  const setCardFolders = async (cardId: string, folderIds: string[]) => {
    await fetch(`/api/cards/${cardId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderIds }),
    });
    telegram?.haptic.selection();
    await load();
    if (folderIds.length > 0) {
      trackClient("item_moved_to_folder", { folder_count: folderIds.length });
    }
  };

  const toggleInPicker = (folderId: string) => {
    if (!folderMenuCard) return;
    const current = folderMenuCard.folders?.map((f) => f.id) ?? [];
    const next = current.includes(folderId)
      ? current.filter((f) => f !== folderId)
      : [...current, folderId];
    const updated = { ...folderMenuCard, folders: next.map((id) => ({ id, name: "", emoji: null })) };
    setFolderMenuCard(updated);
  };

  const savePicker = () => {
    if (!folderMenuCard) return;
    const ids = folderMenuCard.folders?.map((f) => f.id) ?? [];
    setCardFolders(folderMenuCard.id, ids);
    setPickerOpen(false);
    setFolderMenuCard(null);
  };

  const toggleTag = (name: string) => {
    telegram?.haptic.selection();
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const saveCardTags = async (cardId: string, names: string[]) => {
    const res = await fetch(`/api/cards/${cardId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    const data = await res.json();
    if (!res.ok) return data?.error || t("tag.saveError");
    telegram?.haptic.selection();
    await Promise.all([load(), loadTags()]);
    return null;
  };

  const toggleTagOnCard = (card: Bookmark, name: string) => {
    const cur = card.tags?.map((tag) => tag.name) ?? [];
    const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name];
    setTagMenuCard({ ...card, tags: next.map((n) => ({ id: "tmp-" + n, name: n })) });
  };

  const removeSingleTag = async (card: Bookmark, tag: { id: string; name: string }) => {
    await fetch(`/api/cards/${card.id}/tags/${tag.id}`, { method: "DELETE" });
    telegram?.haptic.selection();
    await Promise.all([load(), loadTags()]);
  };

  const acceptAi = async (card: Bookmark) => {
    await fetch(`/api/cards/${card.id}/ai-accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "folder" }),
    });
    telegram?.haptic.notification("success");
    await load();
  };

  const dismissAi = async (card: Bookmark) => {
    await fetch(`/api/cards/${card.id}/ai-dismiss`, { method: "POST" });
    telegram?.haptic.selection();
    await load();
  };

  const startLongPress = (id: string) => {
    const t = window.setTimeout(() => {
      telegram?.haptic.impact("medium");
      setSelectMode(true);
      setSelectedIds(new Set([id]));
    }, 350);
    setLongPressTimer(t);
  };

  const cancelLongPress = () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setMassMenu("none");
  };

  const runBulk = async (action: string, payload?: Record<string, unknown>) => {
    if (selectedIds.size === 0) return;
    setMassBusy(true);
    try {
      const res = await fetch("/api/cards/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: [...selectedIds], action, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        telegram?.haptic.notification("error");
        return;
      }
      telegram?.haptic.notification("success");
      if (data.failed > 0) {
        telegram?.haptic.notification("error");
      }
      exitSelect();
      await load();
    } catch {
      telegram?.haptic.notification("error");
    } finally {
      setMassBusy(false);
    }
  };

  const runBulkAi = async () => {
    if (selectedIds.size === 0) return;
    trackClient("ai_sort_requested", { scope: "selected", count: selectedIds.size });
    setMassBusy(true);
    try {
      const res = await fetch("/api/cards/bulk-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        telegram?.haptic.notification("error");
        trackClient("ai_sort_completed", { status: "error", scope: "selected" });
        return;
      }
      if (!data.jobId) {
        // карточек нет — просто обновляем
        telegram?.haptic.selection();
        exitSelect();
        await load();
        trackClient("ai_sort_completed", { status: "done", scope: "selected", done: 0 });
        return;
      }
      // Поллим job до завершения.
      let running = true;
      while (running) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const s = await fetch(`/api/cards/bulk-ai/${data.jobId}`);
          const j = await s.json();
          if (s.ok && j.status !== "running") {
            running = false;
            telegram?.haptic.notification(j.status === "done" ? "success" : "warning");
            trackClient("ai_sort_completed", {
              status: j.status,
              scope: "selected",
              done: j.done ?? 0,
              failed: j.failed ?? 0,
            });
          }
        } catch {
          running = false;
          telegram?.haptic.notification("error");
          trackClient("ai_sort_completed", { status: "network_error", scope: "selected" });
        }
      }
      exitSelect();
      await load();
    } catch {
      telegram?.haptic.notification("error");
      trackClient("ai_sort_completed", { status: "error", scope: "selected" });
    } finally {
      setMassBusy(false);
    }
  };

  const massToFolder = async (folderId: string) => {
    await runBulk("toFolder", { folderId });
  };

  const massAddTag = async (name: string) => {
    await runBulk("addTag", { names: [name] });
  };

  const tabs: { key: LibraryTab; label: string }[] = [
    { key: "deck", label: t("library.tab.deck") },
    { key: "later", label: t("library.tab.later") },
  ];

  const activeFolders = useMemo(
    () =>
      folders.filter((f) =>
        tab === "archive" ? true : f.count > 0
      ),
    [folders, tab]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: Мои сохранёнки + ＋ / ⋯ */}
      <div className="flex items-center justify-between px-5 py-3">
        <h1 className="text-xl font-bold tracking-tight text-text">{t("library.title")}</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCreateOpen(true)}
            aria-label={t("library.createFolder")}
            className="flex size-9 items-center justify-center rounded-full bg-surface text-text active:scale-90"
          >
            <Plus className="size-5" />
          </button>
          <button
            onClick={() => setFiltersOpen(true)}
            aria-label={t("library.filters")}
            className="relative flex size-9 items-center justify-center rounded-full bg-surface text-muted active:scale-90"
          >
            <SlidersHorizontal className="size-4" />
            {(selectedTags.length > 0 || q.trim()) && (
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-bg" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Search: ✨ Найти в сохранёнках — слот под будущий AI Search */}
        <div className="px-5 pb-3">
        <div className="flex items-center gap-2.5 rounded-2xl bg-surface px-4 py-3 ring-1 ring-white/5">
          <Search className="size-[18px] shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("library.searchAiPlaceholder")}
            className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
          {q ? (
            <button onClick={() => setQ("")} aria-label={t("library.clear")}>
              <X className="size-4 text-muted" />
            </button>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-[11px] font-semibold text-accent">
              <Sparkles className="size-3" /> AI
            </span>
          )}
        </div>
      </div>

      {/* Папки — главный объект библиотеки (компактный грид + сворачивание) */}
      {folderId === null && !q.trim() && selectedTags.length === 0 && viewMode === "overview" && (
        <div className="px-5 pb-2">
          <div className="mb-1.5 flex items-center justify-between">
            <button
              onClick={() => {
                telegram?.haptic.selection();
                setFoldersCollapsed((v) => !v);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"
            >
              <span>{t("library.section.folders")}</span>
              <span className={`transition-transform ${foldersCollapsed ? "-rotate-90" : "rotate-0"}`}>▾</span>
              <span className="ml-1 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">
                {folders.length + 1}
              </span>
            </button>
            <button
              onClick={() => {
                telegram?.haptic.selection();
                setViewMode("all");
              }}
              className="text-xs font-medium text-accent"
            >
              {t("library.allSaves")} →
            </button>
          </div>

          {!foldersCollapsed && (
            <div className="grid grid-cols-2 gap-2">
              {/* Системная — компактная */}
              <button
                onClick={() => {
                  telegram?.haptic.selection();
                  setFolderId("unsorted");
                }}
                className="relative flex flex-col gap-1 rounded-xl border bg-surface px-3 py-3 text-left transition-colors hover:bg-line active:scale-[0.98] border-amber-500/15"
              >
                <span className="text-xl leading-none">📥</span>
                <span className="truncate text-[13px] font-semibold leading-tight text-text">
                  {t("library.chip.unsorted")}
                </span>
                <span className="text-[11px] leading-none text-muted">
                  {unsortedCount} {tp("words.save", unsortedCount)}
                </span>
                {unsortedCount > 0 && (
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                    <Sparkles className="size-3" /> {t("library.unsortedAction")}
                  </span>
                )}
              </button>

              {folders.map((f) => (
                <div
                  key={f.id}
                  className="relative flex flex-col gap-1 rounded-xl bg-surface px-3 py-3 text-left transition-colors hover:bg-line"
                >
                  <button
                    onClick={() => {
                      telegram?.haptic.selection();
                      setFolderId(f.id);
                    }}
                    className="flex flex-col gap-1 text-left active:scale-[0.98]"
                  >
                    <span className="text-xl leading-none">{f.emoji || "📁"}</span>
                    <span className="truncate text-[13px] font-semibold leading-tight text-text">{f.name}</span>
                    <span className="text-[11px] leading-none text-muted">
                      {f.count} {tp("words.save", f.count)}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      telegram?.haptic.selection();
                      setDeleteOpen(f.id);
                    }}
                    aria-label={t("library.deleteFolder")}
                    title={t("library.deleteFolder")}
                    className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-bg/80 text-muted opacity-60 transition-opacity hover:opacity-100 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!foldersCollapsed && folders.length === 0 && unsortedCount === 0 && (
            <p className="mt-2 text-center text-xs text-muted">{t("library.noFoldersHint")}</p>
          )}
        </div>
      )}

      {/* Когда выбрана папка — компактный хедер фильтра с кнопкой Назад */}
      {folderId !== null && (
        <div className="flex items-center gap-2 px-5 py-1">
          <button
            onClick={() => {
              telegram?.haptic.selection();
              setFolderId(null);
            }}
            className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-text"
          >
            ← {t("common.back")}
          </button>
          <span className="truncate text-sm font-semibold text-text">
            {folderId === "unsorted"
              ? t("library.chip.unsorted")
              : folders.find((f) => f.id === folderId)?.name || t("folder.pickerTitle")}
          </span>
          <span className="text-xs text-muted">
            {folderId === "unsorted"
              ? unsortedCount
              : folders.find((f) => f.id === folderId)?.count ?? 0}
          </span>
          {folderId !== "unsorted" && (
            <button
              onClick={() => setDeleteOpen(folderId)}
              aria-label={t("library.deleteFolder")}
              className="ml-auto flex size-7 items-center justify-center rounded-full bg-surface text-muted hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Режим выбора — компактно */}
      {selectMode && (
        <div className="flex items-center gap-2 px-5 py-1">
          <button
            onClick={exitSelect}
            className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-text"
          >
            <CheckCheck className="size-3.5" />
            {t("library.doneCount", { count: selectedIds.size })}
          </button>
        </div>
      )}

      {/* Автосортировка — баннер только при unsorted > 0 */}
      {unsortedCount > 0 && folderId !== "unsorted" && (
        <div className="px-5 py-1">
          <button
            onClick={() => {
              telegram?.haptic.selection();
              setAutosortOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-xl bg-accent/15 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/25 active:scale-[0.98]"
          >
            <Sparkles className="size-3.5" />
            <span>{t("library.aiSort")}</span>
            <span className="ml-auto opacity-60">→</span>
          </button>
        </div>
      )}

      {/* Убран дубль-табов «Разобрать/Потом/Архив» — нижняя навигация уже есть (spec §8). Библиотека теперь фильтр по папкам, а не по статусу. */}

      {/* Фильтры в sheet */}
      <AnimatePresence>
        {filtersOpen && (
          <FiltersSheet
            tags={availableTags}
            selectedTags={selectedTags}
            onToggleTag={(name) => toggleTag(name)}
            onClear={() => {
              setSelectedTags([]);
              setQ("");
            }}
            tab={tab}
            onTabChange={(t) => setTab(t)}
            onClose={() => setFiltersOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Автосортировка — sheet (шаг 3) */}
      <AnimatePresence>
        {autosortOpen && (
          <AutosortSheet
            count={unsortedCount}
            onClose={() => setAutosortOpen(false)}
            onDone={() => {
              void load();
            }}
          />
        )}
      </AnimatePresence>

      {/* Разобрать папку */}
      {folderId && folderId !== "unsorted" && (
        <div className="px-5 py-1.5">
          <button
            onClick={() => {
              const f = folders.find((x) => x.id === folderId);
              telegram?.haptic.selection();
              onOpenFolderDeck?.(folderId, f?.name || t("library.untitled"));
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/25 active:scale-[0.98]"
          >
            <Inbox className="size-3.5" />
            {t("library.sortFolder")}
          </button>
        </div>
      )}

      {/* Массовая панель */}
      {selectMode && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 hide-scrollbar">
          <button
            onClick={() => {
              telegram?.haptic.selection();
              if (selectedIds.size === bookmarks.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(bookmarks.map((b) => b.id)));
            }}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-text"
          >
            <CheckCheck className="size-3.5" />
            {selectedIds.size === bookmarks.length ? t("library.deselectAll") : t("library.selectAll")}
          </button>
          <button
            onClick={() => {
              telegram?.haptic.selection();
              setMassMenu(massMenu === "folder" ? "none" : "folder");
            }}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-accent disabled:opacity-50"
          >
            <Folder className="size-3.5" />
            {t("library.mass.folder")}
          </button>
          <button
            onClick={() => {
              telegram?.haptic.selection();
              setMassMenu(massMenu === "tag" ? "none" : "tag");
            }}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-accent disabled:opacity-50"
          >
            <Tag className="size-3.5" />
            {t("library.mass.tag")}
          </button>
          <button
            onClick={() => void runBulk("archive")}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-muted disabled:opacity-50"
          >
            <Archive className="size-3.5" />
            {t("library.mass.archive")}
          </button>
          <button
            onClick={() => void runBulk("toDeck")}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-muted disabled:opacity-50"
          >
            <ArrowUp className="size-3.5" />
            {t("library.mass.deck")}
          </button>
          <button
            onClick={() => void runBulkAi()}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-accent disabled:opacity-50"
          >
            <Bot className="size-3.5" />
            {t("library.mass.sort")}
          </button>
          <button
            onClick={() => void runBulk("delete")}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-red-600/20 px-3 py-2 text-xs font-medium text-red-400 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            {t("library.mass.delete")}
          </button>
        </div>
      )}

      {selectMode && massMenu === "folder" && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-1 hide-scrollbar">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => void massToFolder(f.id)}
              disabled={massBusy}
              className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-50"
            >
              <span>{f.emoji || "📁"}</span>
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      )}

      {selectMode && massMenu === "tag" && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-1 hide-scrollbar">
          <input
            value={massTagInput}
            onChange={(e) => setMassTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && massTagInput.trim()) {
                void massAddTag(massTagInput.trim());
                setMassTagInput("");
              }
            }}
            placeholder={t("library.massTagPlaceholder")}
            maxLength={40}
            className="w-40 shrink-0 rounded-xl bg-bg px-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={() => {
              if (massTagInput.trim()) {
                void massAddTag(massTagInput.trim());
                setMassTagInput("");
              }
            }}
            disabled={massBusy || !massTagInput.trim()}
            className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-text disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            {t("common.add")}
          </button>
          {availableTags.slice(0, 8).map((tag) => (
            <button
              key={tag.id}
              onClick={() => void massAddTag(tag.name)}
              disabled={massBusy}
              className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-50"
            >
              <span>#{tag.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="text-5xl">
              {q ? "🔍" : selectedTags.length > 0 ? "🏷️" : folderId ? "📂" : tab === "archive" ? "🗂️" : "🗂️"}
            </div>
            <p className="text-sm font-medium text-text">
              {q
                ? t("library.empty.search")
                : selectedTags.length > 0
                  ? t("library.empty.tags")
                  : folderId === "unsorted"
                    ? t("library.empty.unsorted")
                    : folderId
                      ? t("library.empty.folder")
                      : tab === "archive"
                        ? t("library.empty.archive")
                        : t("library.empty.default")}
            </p>
            <p className="text-xs text-muted">
              {q
                ? t("library.empty.searchHint")
                : selectedTags.length > 0
                  ? t("library.empty.tagsHint")
                  : folderId === "unsorted"
                    ? t("library.empty.unsortedHint")
                    : folderId
                      ? t("library.empty.folderHint")
                      : t("library.empty.defaultHint")}
            </p>
          </div>
        ) : folderId === null && !q.trim() && selectedTags.length === 0 && viewMode === "overview" ? (
          /* Обзор библиотеки: папки уже выше, тут — Недавние (spec §2, §11) */
          <div className="flex flex-col">
            <div className="px-5 py-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("library.recent")}
              </h3>
              <span className="text-xs text-muted">{bookmarks.length} {tp("words.save", bookmarks.length)}</span>
            </div>
            {bookmarks.length > 0 ? (
              <div className="px-4 pb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {bookmarks.slice(0, 6).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      telegram?.haptic.selection();
                      setDetailBookmark(b);
                    }}
                    className="flex flex-col overflow-hidden rounded-2xl bg-surface text-left transition-colors hover:bg-line active:scale-[0.98]"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg">
                      {thumbFor(b) ? (
                        <img
                          src={thumbFor(b) as string}
                          alt=""
                          className="size-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-3xl">
                          {typeEmoji(b)}
                        </div>
                      )}
                      <MetaStatusDot bookmark={b} />
                    </div>
                    <div className="flex flex-col gap-1.5 p-3">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-text">{b.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {b.folders && b.folders.length > 0 ? (
                          <span className="rounded-full bg-bg px-2 py-1 text-xs text-muted">
                            {b.folders[0].emoji || "📁"} {b.folders[0].name}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-400">📥 {t("library.chip.unsorted")}</span>
                        )}
                        {b.tags?.slice(0, 2).map((tag) => (
                          <span key={tag.id} className="text-accent">#{tag.name}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <SourceBadge bookmark={b} />
                        <span>·</span>
                        <span>{fmtReadMinutes(b.readTimeMin, lang) || fmtDuration(b.durationSeconds) || fmtDate(b.createdAt, lang)}</span>
                      </div>
                      <div className="mt-1 flex gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            telegram?.haptic.impact("medium");
                            onOpen(b);
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25"
                        >
                          <ExternalLink className="size-3.5" /> {t("common.open")}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            telegram?.haptic.impact("medium");
                            void fetch("/api/cards/bulk", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ cardIds: [b.id], action: "delete" }),
                            }).then(() => load());
                          }}
                          className="flex size-8 items-center justify-center rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25"
                          aria-label={t("common.delete")}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-5 py-4 text-sm text-muted text-center">{t("library.empty.defaultHint")}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col p-4">
            {viewMode === "all" && !q.trim() && selectedTags.length === 0 && folderId === null && (
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => {
                    telegram?.haptic.selection();
                    setViewMode("overview");
                  }}
                  className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-text"
                >
                  ← {t("library.showFolders")}
                </button>
                <span className="text-sm font-semibold text-text">{t("library.allSaves")}</span>
                <span className="text-xs text-muted">{bookmarks.length}</span>
              </div>
            )}
            {groupByPeriod(bookmarks, {
              today: t("library.group.today"),
              week: t("library.group.week"),
              earlier: t("library.group.earlier"),
            }).map((g) => (
              <div key={g.label} className="mb-3">
                <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
                  {g.label}
                </h3>
                <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((b) => (
                    <div
                      key={b.id}
                      onPointerDown={() => {
                        if (!selectMode) startLongPress(b.id);
                      }}
                      onPointerUp={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onClick={() => {
                        if (selectMode) toggleSelect(b.id);
                        else {
                          telegram?.haptic.selection();
                          setDetailBookmark(b);
                        }
                      }}
                      className={`group relative flex items-center gap-3 rounded-xl bg-surface p-3 transition-colors hover:bg-line ${
                        selectMode
                          ? selectedIds.has(b.id)
                            ? "ring-2 ring-accent"
                            : "opacity-70"
                          : ""
                      }`}
                    >
                      {selectMode && (
                        <div
                          className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
                            selectedIds.has(b.id)
                              ? "border-accent bg-accent text-accent-text"
                              : "border-line bg-bg"
                          }`}
                        >
                          {selectedIds.has(b.id) && <Check className="size-3.5" />}
                        </div>
                      )}
                      <div className="relative size-14 flex-shrink-0 overflow-hidden rounded-xl bg-bg">
                        <div className="absolute inset-0 flex items-center justify-center text-xl">
                          {typeEmoji(b)}
                        </div>
                        {thumbFor(b) ? (
                          <img
                            src={thumbFor(b) as string}
                            alt=""
                            className="absolute inset-0 size-full rounded-xl object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                        <MetaStatusDot bookmark={b} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-text">
                          {b.title}
                        </p>
                        {b.metaStatus === "failed" && (
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                            {t("library.loadFailed")}
                          </span>
                        )}
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
                          <SourceBadge bookmark={b} />
                          {fmtDuration(b.durationSeconds)}
                          {fmtReadMinutes(b.readTimeMin, lang)}
                          <span>{fmtDate(b.createdAt, lang)}</span>
                        </div>
                        {b.folders && b.folders.length > 0 && (
                          <div className="mt-0.5 flex items-center gap-1 overflow-hidden">
                            {b.folders.slice(0, 2).map((f) => (
                              <span
                                key={f.id}
                                className="max-w-[90px] truncate rounded bg-bg px-1.5 py-0.5 text-[10px] text-muted"
                              >
                                {f.emoji || "📁"} {f.name}
                              </span>
                            ))}
                            {b.folders.length > 2 && (
                              <span className="text-[10px] text-muted">+{b.folders.length - 2}</span>
                            )}
                          </div>
                        )}
                        {b.tags && b.tags.length > 0 && (
                          <div className="mt-0.5 flex items-center gap-1 overflow-hidden">
                            {b.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag.id}
                                className="max-w-[90px] truncate rounded bg-bg px-1.5 py-0.5 text-[10px] text-accent"
                              >
                                #{tag.name}
                              </span>
                            ))}
                            {b.tags.length > 2 && (
                              <span className="text-[10px] text-muted">+{b.tags.length - 2}</span>
                            )}
                          </div>
                        )}
                        {b.aiFolderName && b.aiStatus === "done" && (
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              <Sparkles className="size-3" />
                              {t("library.aiBadge", { name: b.aiFolderName })}
                              {typeof b.aiConfidence === "number" && (
                                <span className="opacity-60">
                                  {Math.round(b.aiConfidence * 100)}%
                                </span>
                              )}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); void acceptAi(b); }}
                              aria-label={t("library.acceptAi")}
                              title={t("library.accept")}
                              className="flex size-5 items-center justify-center rounded-full bg-success/20 text-success active:scale-90"
                            >
                              <Check className="size-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); void dismissAi(b); }}
                              aria-label={t("library.rejectAi")}
                              title={t("library.reject")}
                              className="flex size-5 items-center justify-center rounded-full bg-bg text-muted active:scale-90"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        {!selectMode && tab === "archive" && (
                          <button
                            onClick={() => {
                              telegram?.haptic.selection();
                              onPostpone(b);
                            }}
                            aria-label={t("deck.btn.later")}
                            title={t("deck.btn.later")}
                            className="flex size-9 items-center justify-center rounded-full bg-surface text-success hover:bg-line active:scale-90"
                          >
                            <Clock className="size-4" />
                          </button>
                        )}
                        {!selectMode && tab === "archive" && (
                          <button
                            onClick={() => {
                              telegram?.haptic.selection();
                              onReturnToDeck(b);
                            }}
                            aria-label={t("library.toDeck")}
                            title={t("library.toDeck")}
                            className="flex size-9 items-center justify-center rounded-full bg-surface text-muted hover:bg-line active:scale-90"
                          >
                            <Undo2 className="size-4" />
                          </button>
                        )}
                        {!selectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              telegram?.haptic.selection();
                              setFolderMenuCard(b);
                              setPickerOpen(true);
                            }}
                            aria-label={t("library.mass.folder")}
                            title={t("library.mass.folder")}
                            className="flex size-9 items-center justify-center rounded-full bg-surface text-accent hover:bg-line active:scale-90"
                          >
                            <Folder className="size-4" />
                          </button>
                        )}
                        {!selectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              telegram?.haptic.selection();
                              setTagMenuCard(b);
                              setTagPickerOpen(true);
                            }}
                            aria-label={t("library.mass.tag")}
                            title={t("library.mass.tag")}
                            className="flex size-9 items-center justify-center rounded-full bg-surface text-accent hover:bg-line active:scale-90"
                          >
                            <Tag className="size-4" />
                          </button>
                        )}
                        {!selectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              telegram?.haptic.impact("medium");
                              onOpen(b);
                            }}
                            aria-label={t("common.open")}
                            title={t("common.open")}
                            className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-accent hover:bg-accent/25 active:scale-90"
                          >
                            <ExternalLink className="size-4" />
                          </button>
                        )}
                        {!selectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              telegram?.haptic.impact("medium");
                              void fetch("/api/cards/bulk", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ cardIds: [b.id], action: "delete" }),
                              }).then(() => load());
                            }}
                            aria-label={t("common.delete")}
                            title={t("common.delete")}
                            className="flex size-9 items-center justify-center rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 active:scale-90"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Create folder modal */}
      <AnimatePresence>
        {createOpen && (
          <CreateFolderModal
            onClose={() => setCreateOpen(false)}
            onCreate={createFolder}
          />
        )}
      </AnimatePresence>

      {/* Delete folder confirm */}
      <AnimatePresence>
        {deleteOpen && (
          <DeleteFolderModal
            folder={
              folders.find((f) => f.id === deleteOpen) ?? {
                id: deleteOpen,
                name: "",
                emoji: null,
                count: 0,
                sortOrder: 0,
              }
            }
            onClose={() => setDeleteOpen(null)}
            onConfirm={(cardsTo) => deleteFolder(deleteOpen, cardsTo)}
          />
        )}
      </AnimatePresence>

      {/* Folder picker */}
      <AnimatePresence>
        {pickerOpen && folderMenuCard && (
          <FolderPickerModal
            card={folderMenuCard}
            folders={folders}
            onToggle={toggleInPicker}
            onSave={savePicker}
            onClose={() => {
              setPickerOpen(false);
              setFolderMenuCard(null);
            }}
            onCreate={(name, emoji) => createFolder(name, emoji)}
          />
        )}
      </AnimatePresence>

      {/* Tag picker */}
      <AnimatePresence>
        {tagPickerOpen && tagMenuCard && (
          <TagPickerModal
            card={tagMenuCard}
            tags={availableTags}
            onToggle={(name) => toggleTagOnCard(tagMenuCard, name)}
            onRemove={(tagName) => toggleTagOnCard(tagMenuCard, tagName)}
            onSave={() => {
              const names = tagMenuCard.tags?.map((t) => t.name) ?? [];
              void saveCardTags(tagMenuCard.id, names).then((err) => {
                if (!err) {
                  setTagPickerOpen(false);
                  setTagMenuCard(null);
                }
              });
            }}
            onClose={() => {
              setTagPickerOpen(false);
              setTagMenuCard(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Material detail — тап по карточке → просмотр (spec §5) */}
      <AnimatePresence>
        {detailBookmark && (
          <MaterialSheet
            bookmark={detailBookmark}
            onClose={() => setDetailBookmark(null)}
            onOpen={(b) => {
              setDetailBookmark(null);
              onOpen(b);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function thumbFor(c: Bookmark): string | null {
  return c.imageUrl || c.mediaItems?.[0]?.imageUrl || null;
}

function typeEmoji(c: Bookmark): string {
  if (c.type === "photo") return "📷";
  if (c.type === "video") return "🎬";
  if (c.type === "text") return "📝";
  if (c.type === "forward") return "📨";
  return "🔗";
}

function CreateFolderModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, emoji: string) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const telegram = useTelegram();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const r = await onCreate(trimmed, emoji);
    setSaving(false);
    if (r.error) {
      telegram?.haptic.notification("error");
      setErr(r.error);
    } else {
      telegram?.haptic.notification("success");
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-full max-w-sm rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-text">{t("folder.createTitle")}</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("folder.namePlaceholder")}
          maxLength={40}
          autoFocus
          className="mt-4 w-full rounded-xl bg-bg px-4 py-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EMOJI_PRESETS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`flex size-9 items-center justify-center rounded-lg text-lg transition-colors ${
                emoji === e ? "bg-accent/30 ring-1 ring-accent" : "bg-bg"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-surface py-2.5 text-sm font-medium text-muted hover:bg-line"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text disabled:opacity-50"
          >
            {t("folder.create")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DeleteFolderModal({
  folder,
  onClose,
  onConfirm,
}: {
  folder: FolderMeta;
  onClose: () => void;
  onConfirm: (cardsTo: "none" | "archive") => void;
}) {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
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
            <h2 className="text-base font-bold text-text">
              {t("folder.deleteTitle", { name: `${folder.emoji || "📁"} ${folder.name}` })}
            </h2>
            <p className="text-xs text-muted">
              {t("folder.deleteCount", { count: folder.count })}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => onConfirm("archive")}
            className="w-full rounded-xl bg-red-600/15 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-600/25"
          >
            {t("folder.deleteToArchive")}
          </button>
          <button
            onClick={() => onConfirm("none")}
            className="w-full rounded-xl bg-surface py-2.5 text-sm font-semibold text-muted hover:bg-line"
          >
            {t("folder.deleteToNone")}
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-sm text-muted"
          >
            {t("common.cancel")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FolderPickerModal({
  card,
  folders,
  onToggle,
  onSave,
  onClose,
  onCreate,
}: {
  card: Bookmark;
  folders: FolderMeta[];
  onToggle: (folderId: string) => void;
  onSave: () => void;
  onClose: () => void;
  onCreate: (name: string, emoji: string) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const telegram = useTelegram();
  const { t } = useI18n();
  const [newName, setNewName] = useState("");
  const selected = card.folders?.map((f) => f.id) ?? [];

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    // создаём папку и сразу добавляем её в выбор карточки
    const r = await onCreate(trimmed, "📁");
    if (r.ok) {
      setNewName("");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-full max-w-sm rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-text">{t("folder.pickerTitle")}</h2>
        <div className="mt-3 flex max-h-56 flex-col gap-1 overflow-y-auto hide-scrollbar">
          {folders.length === 0 && (
            <p className="py-4 text-center text-xs text-muted">{t("folder.pickerEmpty")}</p>
          )}
          {folders.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-bg px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked={selected.includes(f.id)}
                onChange={() => onToggle(f.id)}
                className="size-4 accent-[var(--color-accent)]"
              />
              <span className="text-base">{f.emoji || "📁"}</span>
              <span className="flex-1 truncate text-sm text-text">{f.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("folder.pickerPlaceholder")}
            maxLength={40}
            className="flex-1 rounded-xl bg-bg px-4 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            aria-label={t("library.createFolder")}
            className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent disabled:opacity-40"
          >
            <Plus className="size-5" />
          </button>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-surface py-2.5 text-sm font-medium text-muted hover:bg-line"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => {
              telegram?.haptic.selection();
              onSave();
            }}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text"
          >
            {t("common.done")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FiltersSheet({
  tags,
  selectedTags,
  onToggleTag,
  onClear,
  tab,
  onTabChange,
  onClose,
}: {
  tags: { id: string; name: string; count: number }[];
  selectedTags: string[];
  onToggleTag: (name: string) => void;
  onClear: () => void;
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  onClose: () => void;
}) {
  const telegram = useTelegram();
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-full max-w-sm rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text">{t("filters.title")}</h2>
          {selectedTags.length > 0 && (
            <button
              onClick={() => {
                telegram?.haptic.selection();
                onClear();
              }}
              className="rounded-lg bg-bg px-2.5 py-1 text-xs font-medium text-muted hover:text-text"
            >
              {t("filters.reset")}
            </button>
          )}
        </div>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
          {t("filters.show")}
        </h3>
        <div className="mt-2 flex items-center rounded-xl bg-bg p-1">
          {(
            [
              { key: "deck", label: t("library.tab.deck") },
              { key: "later", label: t("library.tab.later") },
              { key: "archive", label: t("library.tab.archive") },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                telegram?.haptic.selection();
                onTabChange(opt.key);
              }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                tab === opt.key ? "bg-accent text-accent-text" : "text-muted hover:text-text"
              }`}
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">
          {t("filters.tags")}
        </h3>
        {tags.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("filters.noTags")}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const active = selectedTags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    telegram?.haptic.selection();
                    onToggleTag(tag.name);
                  }}
                  className={`flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    active ? "bg-accent text-accent-text" : "bg-bg text-muted hover:text-text"
                  }`}
                >
                  <span>{tag.name}</span>
                  <span className="opacity-60">{tag.count}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text"
          >
            {t("common.done")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AutosortSheet({
  count,
  onClose,
  onDone,
}: {
  count: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const telegram = useTelegram();
  const { t } = useI18n();
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<{
    jobId: string | null;
    status: string;
    total: number;
    done: number;
    failed: number;
  } | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const start = async () => {
    setStarting(true);
    trackClient("ai_sort_requested", { scope: "unsorted", count });
    try {
      const res = await fetch("/api/cards/bulk-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "unsorted" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || t("autosort.startError"));
      setJob(data);
      telegram?.haptic.impact("medium");
      pollRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(`/api/cards/bulk-ai/${data.jobId}`);
          const j = await r.json();
          if (r.ok && !j.error) {
            setJob(j);
            if (j.status !== "running") {
              stopPolling();
              telegram?.haptic.notification(j.status === "done" ? "success" : "warning");
              trackClient("ai_sort_completed", {
                scope: "unsorted",
                status: j.status,
                done: j.done ?? 0,
                failed: j.failed ?? 0,
              });
              onDone();
            }
          }
        } catch {
          // сеть упала — просто не обновляем, следующий тик
        }
      }, 2000);
    } catch (e) {
      telegram?.haptic.notification("error");
      setStarting(false);
      if (e instanceof Error && e.message) {
        // показываем ошибку в самом sheet
        setJob({ jobId: null, status: "error", total: 0, done: 0, failed: 0 });
      }
    }
  };

  const cancel = async () => {
    stopPolling();
    if (job?.jobId) {
      try {
        await fetch(`/api/cards/bulk-ai/${job.jobId}/cancel`, { method: "POST" });
      } catch {
        // молча
      }
    }
    setJob((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    telegram?.haptic.impact("light");
    onDone();
  };

  useEffect(() => () => stopPolling(), []);

  const running = job?.status === "running";
  const total = job?.total ?? count;
  const done = job?.done ?? 0;
  const failed = job?.failed ?? 0;
  const progress = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
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
          <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text">{t("autosort.title")}</h2>
            <p className="text-xs text-muted">
              {job ? t("autosort.queueCount", { count: total }) : t("autosort.queueCount", { count })}
            </p>
          </div>
        </div>

        {!job && !starting && (
          <>
            <p className="mt-4 rounded-xl bg-bg px-4 py-3 text-sm text-muted">
              {t("autosort.desc")}
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                onClick={onClose}
                className="flex-1 rounded-full border border-line py-2.5 text-sm font-semibold text-text active:scale-[0.98]"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => void start()}
                className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text active:scale-[0.98]"
              >
                {t("autosort.start")}{count > 0 ? ` (${count})` : ""}
              </button>
            </div>
          </>
        )}

        {starting && !job && (
          <div className="mt-5 flex flex-col items-center gap-3 py-4">
            <Loader2 className="size-6 animate-spin text-accent" />
            <p className="text-sm text-muted">{t("autosort.starting")}</p>
          </div>
        )}

        {job && (
          <div className="mt-4">
            {running && (
              <>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("autosort.progress", { done: done + failed, total })}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={false}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                {failed > 0 && (
                  <p className="mt-1.5 text-xs text-muted">{t("autosort.failed", { failed })}</p>
                )}
                <div className="mt-5 flex gap-2.5">
                  <button
                    onClick={() => void cancel()}
                    className="flex-1 rounded-full border border-line py-2.5 text-sm font-semibold text-text active:scale-[0.98]"
                  >
                    {t("autosort.cancel")}
                  </button>
                </div>
              </>
            )}

            {job.status === "done" && (
              <>
                <p className="mt-4 rounded-xl bg-success/10 px-4 py-3 text-sm text-text">
                  {failed > 0
                    ? t("autosort.doneWithFailed", { done, failed })
                    : t("autosort.done", { done })}
                </p>
                <div className="mt-5 flex gap-2.5">
                  <button
                    onClick={onClose}
                    className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text active:scale-[0.98]"
                  >
                    {t("autosort.great")}
                  </button>
                </div>
              </>
            )}

            {job.status === "cancelled" && (
              <>
                <p className="mt-4 rounded-xl bg-bg px-4 py-3 text-sm text-muted">
                  {t("autosort.cancelled", { done, total })}
                </p>
                <div className="mt-5 flex gap-2.5">
                  <button
                    onClick={onClose}
                    className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text active:scale-[0.98]"
                  >
                    {t("autosort.ok")}
                  </button>
                </div>
              </>
            )}

            {job.status === "error" && (
              <>
                <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-text">
                  {t("autosort.error")}
                </p>
                <div className="mt-5 flex gap-2.5">
                  <button
                    onClick={onClose}
                    className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text active:scale-[0.98]"
                  >
                    {t("autosort.ok")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function TagPickerModal({
  card,
  tags,
  onToggle,
  onRemove,
  onSave,
  onClose,
}: {
  card: Bookmark;
  tags: { id: string; name: string; count: number }[];
  onToggle: (name: string) => void;
  onRemove: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const telegram = useTelegram();
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const selected = card.tags?.map((tag) => tag.name) ?? [];
  const filtered = tags.filter(
    (tag) => !selected.includes(tag.name) && tag.name.toLowerCase().includes(input.toLowerCase().trim())
  );
  const canAdd = input.trim().length > 0 && !selected.includes(input.trim().toLowerCase());

  const addNew = () => {
    const name = input.trim().toLowerCase();
    if (!name || selected.includes(name)) return;
    telegram?.haptic.selection();
    onToggle(name);
    setInput("");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-full max-w-sm rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-text">{t("tag.pickerTitle")}</h2>

        {/* Selected chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent"
            >
              #{name}
              <button
                onClick={() => {
                  telegram?.haptic.selection();
                  onRemove(name);
                }}
                aria-label={t("tag.remove", { name })}
                className="flex size-3.5 items-center justify-center rounded-full hover:bg-black/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {selected.length === 0 && (
            <span className="text-xs text-muted">{t("tag.pickerEmpty")}</span>
          )}
        </div>

        {/* Input */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-bg px-3 py-2">
            <Tag className="size-4 text-muted" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNew();
                }
              }}
              placeholder={t("tag.pickerPlaceholder")}
              maxLength={40}
              className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            />
          </div>
          <button
            onClick={addNew}
            disabled={!canAdd}
            aria-label={t("tag.add")}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent disabled:opacity-40"
          >
            <Plus className="size-5" />
          </button>
        </div>

        {/* Suggestions / add-new hint */}
        {canAdd && (
          <button
            onClick={addNew}
            className="mt-2 flex w-full items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-sm text-accent"
          >
            <Plus className="size-4" />
            {t("tag.create", { name: input.trim().toLowerCase() })}
          </button>
        )}

        {/* Autocomplete list */}
        {filtered.length > 0 && (
          <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto hide-scrollbar">
            {filtered.map((tag) => (
              <button
                key={tag.id}
                onClick={() => {
                  telegram?.haptic.selection();
                  onToggle(tag.name);
                }}
                className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2.5 text-left text-sm text-text hover:bg-line"
              >
                <Tag className="size-4 text-muted" />
                <span className="flex-1 truncate">{tag.name}</span>
                <span className="text-xs text-muted">{tag.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-surface py-2.5 text-sm font-medium text-muted hover:bg-line"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => {
              telegram?.haptic.selection();
              onSave();
            }}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text"
          >
            {t("common.done")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}