"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FolderPlus,
  Plus,
  RefreshCw,
  Search,
  X,
  Trash2,
  Folder,
  Clock,
  Undo2,
  ExternalLink,
} from "lucide-react";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useTelegram } from "@/components/TelegramProvider";

export type FolderMeta = {
  id: string;
  name: string;
  emoji: string | null;
  count: number;
  sortOrder: number;
};

type LibraryTab = "deck" | "later" | "archive";

type Props = {
  onOpen: (bookmark: Bookmark) => void;
  onPostpone: (bookmark: Bookmark) => void;
  onReturnToDeck: (bookmark: Bookmark) => void;
  refreshSignal: number;
};

const EMOJI_PRESETS = ["📁", "💼", "🛒", "🏠", "❤️", "🎬", "📚", "🎮", "✈️", "🍔", "💡", "🧠", "💰", "🎵", "🏋️", "📝", "🧰", "🎓", "👨‍👩‍👧", "🌸"];

export function Library({ onOpen, onPostpone, onReturnToDeck, refreshSignal }: Props) {
  const telegram = useTelegram();
  const [tab, setTab] = useState<LibraryTab>("deck");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState<string | null>(null);
  const [folderMenuCard, setFolderMenuCard] = useState<Bookmark | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("tab", tab);
      if (folderId) params.set("folderId", folderId);
      if (q.trim()) params.set("q", q.trim());
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
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, folderId, refreshSignal]);

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
      {/* Search */}
      <div className="flex items-center gap-2 px-5 py-2">
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
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-1 hide-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              telegram?.haptic.selection();
              setTab(t.key);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-accent text-accent-text" : "bg-surface text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Folder chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-1.5 hide-scrollbar">
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
          onClick={() => setCreateOpen(true)}
          aria-label="Создать папку"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-text active:scale-90"
        >
          <Plus className="size-4" />
        </button>
      </div>

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
            <div className="text-5xl">🗂️</div>
            <p className="text-sm text-muted">Пока пусто…</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
            <div className="flex flex-col gap-1">
              {bookmarks.map((b) => (
                <div
                  key={b.id}
                  className="group flex items-center gap-3 rounded-xl bg-surface p-3 transition-colors hover:bg-line"
                >
                  {thumbFor(b) ? (
                    <div className="relative size-12 flex-shrink-0 overflow-hidden rounded-lg bg-bg">
                      <div className="absolute inset-0 flex items-center justify-center text-xl">
                        {typeEmoji(b)}
                      </div>
                      <img
                        src={thumbFor(b) as string}
                        alt=""
                        className="absolute inset-0 size-full rounded-lg object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-lg bg-bg text-xl">
                      {typeEmoji(b)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{b.title}</p>
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
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {tab === "archive" && (
                      <button
                        onClick={() => {
                          telegram?.haptic.selection();
                          onPostpone(b);
                        }}
                        aria-label="Позже"
                        title="Позже"
                        className="flex size-8 items-center justify-center rounded-full bg-surface text-success hover:bg-line active:scale-90"
                      >
                        <Clock className="size-4" />
                      </button>
                    )}
                    {tab === "archive" && (
                      <button
                        onClick={() => {
                          telegram?.haptic.selection();
                          onReturnToDeck(b);
                        }}
                        aria-label="Вернуть в стопку"
                        title="Вернуть в стопку"
                        className="flex size-8 items-center justify-center rounded-full bg-surface text-muted hover:bg-line active:scale-90"
                      >
                        <Undo2 className="size-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        telegram?.haptic.selection();
                        setFolderMenuCard(b);
                        setPickerOpen(true);
                      }}
                      aria-label="В папку"
                      title="В папку"
                      className="flex size-8 items-center justify-center rounded-full bg-surface text-accent hover:bg-line active:scale-90"
                    >
                      <Folder className="size-4" />
                    </button>
                    <button
                      onClick={() => {
                        telegram?.haptic.impact("medium");
                        onOpen(b);
                      }}
                      aria-label="Открыть"
                      title="Открыть"
                      className="flex size-8 items-center justify-center rounded-full bg-accent/15 text-accent hover:bg-accent/25 active:scale-90"
                    >
                      <ExternalLink className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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