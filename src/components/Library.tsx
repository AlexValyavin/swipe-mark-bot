"use client";

import { useEffect, useMemo, useState } from "react";
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
  Inbox,
  CheckCheck,
  Bot,
  Archive,
  ArrowUp,
  SlidersHorizontal,
} from "lucide-react";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useTelegram } from "@/components/TelegramProvider";
import { SourceBadge, MetaStatusDot } from "@/components/SourceBadge";

export type FolderMeta = {
  id: string;
  name: string;
  emoji: string | null;
  count: number;
  sortOrder: number;
};

type LibraryTab = "deck" | "later" | "archive";

/** Группировка по дате: Сегодня / На этой неделе / Раньше. */
function groupByPeriod(list: Bookmark[]) {
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
  if (today.length) groups.push({ label: "Сегодня", items: today });
  if (week.length) groups.push({ label: "На этой неделе", items: week });
  if (earlier.length) groups.push({ label: "Раньше", items: earlier });
  return groups;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - ((startToday.getDay() + 6) % 7));
  if (d.getTime() >= startToday.getTime()) {
    return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  }
  if (d.getTime() >= startWeek.getTime()) {
    return d.toLocaleDateString("ru", { weekday: "short" });
  }
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

function fmtDuration(sec?: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `⏱ ${m}:${s.toString().padStart(2, "0")}`;
}

function fmtReadMinutes(min?: number | null): string | null {
  if (!min || min <= 0) return null;
  return `📖 ~${min} мин`;
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

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massMenu, setMassMenu] = useState<"none" | "folder" | "tag">("none");
  const [massBusy, setMassBusy] = useState(false);
  const [massTagInput, setMassTagInput] = useState("");
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);

  const loadTags = async () => {
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      if (!data.error) {
        setAvailableTags(
          (data.tags || []).map((t: { id: string; name: string; count: number }) => ({
            id: t.id,
            name: t.name,
            count: t.count,
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
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
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
      if (res.status === 409) return { error: "Такая папка уже есть" };
      return { error: data.error || "Ошибка создания" };
    }
    telegram?.haptic.selection();
    await load();
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
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  };

  const saveCardTags = async (cardId: string, names: string[]) => {
    const res = await fetch(`/api/cards/${cardId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    const data = await res.json();
    if (!res.ok) return data?.error || "Ошибка сохранения тегов";
    telegram?.haptic.selection();
    await Promise.all([load(), loadTags()]);
    return null;
  };

  const toggleTagOnCard = (card: Bookmark, name: string) => {
    const cur = card.tags?.map((t) => t.name) ?? [];
    const next = cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name];
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
    setMassBusy(true);
    try {
      const res = await fetch("/api/cards/bulk-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok) {
        telegram?.haptic.notification("error");
        return;
      }
      telegram?.haptic.notification("success");
      exitSelect();
      await load();
    } catch {
      telegram?.haptic.notification("error");
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
    { key: "deck", label: "В колоде" },
    { key: "later", label: "Открыть позже" },
    { key: "archive", label: "Архив" },
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
      {/* Header: title + search + filters */}
      <div className="flex items-center gap-2 px-5 py-2">
        <h1 className="shrink-0 text-lg font-bold text-text">Библиотека</h1>
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface px-3 py-2">
          <Search className="size-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по названию…"
            className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Очистить">
              <X className="size-4 text-muted" />
            </button>
          )}
        </div>
        <button
          onClick={refresh}
          aria-label="Обновить"
          className="flex size-9 items-center justify-center rounded-full bg-surface text-muted active:scale-90"
        >
          <RefreshCw className="size-4" />
        </button>
        <button
          onClick={() => setFiltersOpen(true)}
          aria-label="Фильтры"
          className="relative flex size-9 items-center justify-center rounded-full bg-surface text-muted active:scale-90"
        >
          <SlidersHorizontal className="size-4" />
          {(selectedTags.length > 0 || q.trim()) && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-bg" />
          )}
        </button>
      </div>

      {/* Folder chips: Все + папки + несортированное + создать */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-1.5 hide-scrollbar">
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setFolderId(null);
          }}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            folderId === null
              ? "bg-accent text-accent-text"
              : "bg-surface text-muted hover:text-text"
          }`}
        >
          <span>Все</span>
          <span className="opacity-60">
            {tab === "archive" ? tabCounts.archived : tab === "later" ? tabCounts.readLater : tabCounts.inDeck}
          </span>
        </button>
        {activeFolders.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              telegram?.haptic.selection();
              setFolderId(folderId === f.id ? null : f.id);
            }}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              folderId === f.id
                ? "bg-accent text-accent-text"
                : "bg-surface text-muted hover:text-text"
            }`}
          >
            <span>{f.emoji || "📁"}</span>
            <span>{f.name}</span>
            <span className="opacity-60">{f.count}</span>
            {folderId === f.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteOpen(f.id);
                }}
                aria-label="Удалить папку"
                className="ml-0.5 flex size-4 items-center justify-center rounded-full hover:bg-black/20"
              >
                <X className="size-3" />
              </button>
            )}
          </button>
        ))}
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setFolderId(folderId === "unsorted" ? null : "unsorted");
          }}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            folderId === "unsorted"
              ? "bg-accent text-accent-text"
              : "bg-surface text-muted hover:text-text"
          }`}
        >
          <Sparkles className="size-3.5" />
          <span>Несортированное</span>
          <span className="opacity-60">{unsortedCount}</span>
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          aria-label="Создать папку"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-text active:scale-90"
        >
          <Plus className="size-4" />
        </button>
        {selectMode && (
          <button
            onClick={exitSelect}
            aria-label="Выйти из выбора"
            className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-text"
          >
            <CheckCheck className="size-3.5" />
            Готово · {selectedIds.size}
          </button>
        )}
      </div>

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
            <span>Автосортировать {unsortedCount} карточек</span>
            <span className="ml-auto opacity-60">→</span>
          </button>
        </div>
      )}

      {/* Segment tabs со счётчиками */}
      <div className="px-5 py-1.5">
        <div className="flex items-center rounded-xl bg-surface p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                telegram?.haptic.selection();
                setTab(t.key);
              }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-accent text-accent-text" : "text-muted hover:text-text"
              }`}
            >
              <span>{t.label}</span>
              <span className={`text-xs ${tab === t.key ? "opacity-70" : "opacity-60"}`}>
                {t.key === "archive"
                  ? tabCounts.archived
                  : t.key === "later"
                    ? tabCounts.readLater
                    : tabCounts.inDeck}
              </span>
            </button>
          ))}
        </div>
      </div>

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
            onClose={() => setFiltersOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Автосортировка — sheet-заглушка (шаг 3) */}
      <AnimatePresence>
        {autosortOpen && (
          <AutosortSheet count={unsortedCount} onClose={() => setAutosortOpen(false)} />
        )}
      </AnimatePresence>

      {/* Разобрать папку */}
      {folderId && folderId !== "unsorted" && (
        <div className="px-5 py-1.5">
          <button
            onClick={() => {
              const f = folders.find((x) => x.id === folderId);
              telegram?.haptic.selection();
              onOpenFolderDeck?.(folderId, f?.name || "Без названия");
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/25 active:scale-[0.98]"
          >
            <Inbox className="size-3.5" />
            Разобрать эту папку
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
            {selectedIds.size === bookmarks.length ? "Снять все" : "Выбрать все"}
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
            В папку
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
            Тег
          </button>
          <button
            onClick={() => void runBulk("archive")}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-muted disabled:opacity-50"
          >
            <Archive className="size-3.5" />
            В архив
          </button>
          <button
            onClick={() => void runBulk("toDeck")}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-muted disabled:opacity-50"
          >
            <ArrowUp className="size-3.5" />
            В колоду
          </button>
          <button
            onClick={() => void runBulkAi()}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-medium text-accent disabled:opacity-50"
          >
            <Bot className="size-3.5" />
            Распределить
          </button>
          <button
            onClick={() => void runBulk("delete")}
            disabled={massBusy}
            className="flex shrink-0 items-center gap-1 rounded-full bg-red-600/20 px-3 py-2 text-xs font-medium text-red-400 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            Удалить
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
            placeholder="Название тега…"
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
            Добавить
          </button>
          {availableTags.slice(0, 8).map((t) => (
            <button
              key={t.id}
              onClick={() => void massAddTag(t.name)}
              disabled={massBusy}
              className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-50"
            >
              <span>#{t.name}</span>
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
                ? "Ничего не найдено"
                : selectedTags.length > 0
                  ? "Нет карточек с этими тегами"
                  : folderId === "unsorted"
                    ? "Несортированных нет"
                    : folderId
                      ? "В папке пока пусто"
                      : tab === "archive"
                        ? "Архив пуст"
                        : "Пока пусто…"}
            </p>
            <p className="text-xs text-muted">
              {q
                ? "Попробуй изменить запрос или сбросить теги"
                : selectedTags.length > 0
                  ? "Сбрось теги, чтобы увидеть все карточки"
                  : folderId === "unsorted"
                    ? "Все карточки уже разложены по папкам"
                    : folderId
                      ? "Добавь карточки в эту папку"
                      : "Отправь ссылку боту — карточки появятся здесь"}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
            {groupByPeriod(bookmarks).map((g) => (
              <div key={g.label} className="mb-3">
                <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
                  {g.label}
                </h3>
                <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
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
                            ⚠️ Не удалось загрузить
                          </span>
                        )}
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
                          <SourceBadge bookmark={b} />
                          {fmtDuration(b.durationSeconds)}
                          {fmtReadMinutes(b.readTimeMin)}
                          <span>{fmtDate(b.createdAt)}</span>
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
                            {b.tags.slice(0, 2).map((t) => (
                              <span
                                key={t.id}
                                className="max-w-[90px] truncate rounded bg-bg px-1.5 py-0.5 text-[10px] text-accent"
                              >
                                #{t.name}
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
                              AI: {b.aiFolderName}
                              {typeof b.aiConfidence === "number" && (
                                <span className="opacity-60">
                                  {Math.round(b.aiConfidence * 100)}%
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => void acceptAi(b)}
                              aria-label="Принять подсказку AI"
                              title="Принять"
                              className="flex size-5 items-center justify-center rounded-full bg-success/20 text-success active:scale-90"
                            >
                              <Check className="size-3" />
                            </button>
                            <button
                              onClick={() => void dismissAi(b)}
                              aria-label="Отклонить подсказку AI"
                              title="Отклонить"
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
                            aria-label="Позже"
                            title="Позже"
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
                            aria-label="Вернуть в стопку"
                            title="Вернуть в стопку"
                            className="flex size-9 items-center justify-center rounded-full bg-surface text-muted hover:bg-line active:scale-90"
                          >
                            <Undo2 className="size-4" />
                          </button>
                        )}
                        {!selectMode && (
                          <button
                            onClick={() => {
                              telegram?.haptic.selection();
                              setFolderMenuCard(b);
                              setPickerOpen(true);
                            }}
                            aria-label="В папку"
                            title="В папку"
                            className="flex size-9 items-center justify-center rounded-full bg-surface text-accent hover:bg-line active:scale-90"
                          >
                            <Folder className="size-4" />
                          </button>
                        )}
                        {!selectMode && (
                          <button
                            onClick={() => {
                              telegram?.haptic.selection();
                              setTagMenuCard(b);
                              setTagPickerOpen(true);
                            }}
                            aria-label="Теги"
                            title="Теги"
                            className="flex size-9 items-center justify-center rounded-full bg-surface text-accent hover:bg-line active:scale-90"
                          >
                            <Tag className="size-4" />
                          </button>
                        )}
                        {!selectMode && (
                          <button
                            onClick={() => {
                              telegram?.haptic.impact("medium");
                              onOpen(b);
                            }}
                            aria-label="Открыть"
                            title="Открыть"
                            className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-accent hover:bg-accent/25 active:scale-90"
                          >
                            <ExternalLink className="size-4" />
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
        <h2 className="text-base font-bold text-text">Новая папка</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название (до 40 символов)"
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
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text disabled:opacity-50"
          >
            Создать
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
              Удалить «{folder.emoji || "📁"} {folder.name}»?
            </h2>
            <p className="text-xs text-muted">
              {folder.count} карточек в папке
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => onConfirm("archive")}
            className="w-full rounded-xl bg-red-600/15 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-600/25"
          >
            Удалить, карточки в архив
          </button>
          <button
            onClick={() => onConfirm("none")}
            className="w-full rounded-xl bg-surface py-2.5 text-sm font-semibold text-muted hover:bg-line"
          >
            Удалить, карточки без папки
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-sm text-muted"
          >
            Отмена
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
        <h2 className="text-base font-bold text-text">Папки карточки</h2>
        <div className="mt-3 flex max-h-56 flex-col gap-1 overflow-y-auto hide-scrollbar">
          {folders.length === 0 && (
            <p className="py-4 text-center text-xs text-muted">Папок пока нет</p>
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
            placeholder="Новая папка…"
            maxLength={40}
            className="flex-1 rounded-xl bg-bg px-4 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            aria-label="Создать папку"
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
            Отмена
          </button>
          <button
            onClick={() => {
              telegram?.haptic.selection();
              onSave();
            }}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text"
          >
            Готово
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
  onClose,
}: {
  tags: { id: string; name: string; count: number }[];
  selectedTags: string[];
  onToggleTag: (name: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const telegram = useTelegram();
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
          <h2 className="text-base font-bold text-text">Фильтры</h2>
          {selectedTags.length > 0 && (
            <button
              onClick={() => {
                telegram?.haptic.selection();
                onClear();
              }}
              className="rounded-lg bg-bg px-2.5 py-1 text-xs font-medium text-muted hover:text-text"
            >
              Сбросить
            </button>
          )}
        </div>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
          Теги
        </h3>
        {tags.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Тегов пока нет</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const active = selectedTags.includes(t.name);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    telegram?.haptic.selection();
                    onToggleTag(t.name);
                  }}
                  className={`flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    active ? "bg-accent text-accent-text" : "bg-bg text-muted hover:text-text"
                  }`}
                >
                  <span>{t.name}</span>
                  <span className="opacity-60">{t.count}</span>
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
            Готово
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AutosortSheet({ count, onClose }: { count: number; onClose: () => void }) {
  const telegram = useTelegram();
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
            <h2 className="text-base font-bold text-text">Автосортировка</h2>
            <p className="text-xs text-muted">Карточек без папки: {count}</p>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-bg px-4 py-3 text-sm text-muted">
          ✨ Функция появится в следующем обновлении — распределим всё по папкам в один тап.
        </p>
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text"
          >
            Понятно
          </button>
        </div>
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
  const [input, setInput] = useState("");
  const selected = card.tags?.map((t) => t.name) ?? [];
  const filtered = tags.filter(
    (t) => !selected.includes(t.name) && t.name.toLowerCase().includes(input.toLowerCase().trim())
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
        <h2 className="text-base font-bold text-text">Теги карточки</h2>

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
                aria-label={`Убрать тег ${name}`}
                className="flex size-3.5 items-center justify-center rounded-full hover:bg-black/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {selected.length === 0 && (
            <span className="text-xs text-muted">Тегов пока нет</span>
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
              placeholder="Добавить тег…"
              maxLength={40}
              className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            />
          </div>
          <button
            onClick={addNew}
            disabled={!canAdd}
            aria-label="Добавить тег"
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
            Создать «{input.trim().toLowerCase()}»
          </button>
        )}

        {/* Autocomplete list */}
        {filtered.length > 0 && (
          <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto hide-scrollbar">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  telegram?.haptic.selection();
                  onToggle(t.name);
                }}
                className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2.5 text-left text-sm text-text hover:bg-line"
              >
                <Tag className="size-4 text-muted" />
                <span className="flex-1 truncate">{t.name}</span>
                <span className="text-xs text-muted">{t.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-surface py-2.5 text-sm font-medium text-muted hover:bg-line"
          >
            Отмена
          </button>
          <button
            onClick={() => {
              telegram?.haptic.selection();
              onSave();
            }}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text"
          >
            Готово
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}