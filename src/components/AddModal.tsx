"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, AlertTriangle, Check } from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";

type PreviewLink = {
  url: string;
  type: string;
  duplicate: boolean;
};

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

export function AddModal({ onClose, onSaved }: Props) {
  const telegram = useTelegram();
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<PreviewLink[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const check = async () => {
    if (!input.trim()) return;
    setChecking(true);
    setErr(null);
    setPreview(null);
    try {
      const res = await fetch("/api/cards/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Ошибка проверки");
        return;
      }
      setPreview(data.links || []);
    } catch {
      setErr("Сеть недоступна");
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    setErr(null);
    try {
      const urls = preview.filter((l) => !l.duplicate).map((l) => l.url);
      if (urls.length === 0) {
        setSavedMsg("Дублей не сохраняем — новых ссылок нет");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Ошибка сохранения");
        return;
      }
      telegram?.haptic.notification("success");
      setSavedMsg(
        `Сохранено: ${data.created?.length ?? 0} новых, пропущено дублей: ${data.duplicates?.length ?? 0}`
      );
      setPreview(null);
      setInput("");
      onSaved();
      setTimeout(onClose, 1200);
    } catch {
      setErr("Сеть недоступна");
    } finally {
      setSaving(false);
    }
  };

  const newCount = preview?.filter((l) => !l.duplicate).length ?? 0;
  const dupCount = preview?.filter((l) => l.duplicate).length ?? 0;

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
        <h2 className="text-base font-bold text-text">Добавить ссылки</h2>
        <p className="mt-1 text-xs text-muted">
          Вставь текст со ссылками — найдём дубли и предложим сохранить только новые.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-bg px-3 py-2.5">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setPreview(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void check();
              }}
              placeholder="Ссылки или текст с ссылками…"
              className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            />
          </div>
          <button
            onClick={() => void check()}
            disabled={checking || !input.trim()}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent disabled:opacity-40"
          >
            {checking ? (
              <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            ) : (
              <Search className="size-5" />
            )}
          </button>
        </div>

        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}

        {preview && (
          <div className="mt-3 max-h-44 overflow-y-auto rounded-xl bg-bg p-2 hide-scrollbar">
            {preview.map((l) => (
              <div
                key={l.url}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
              >
                {l.duplicate ? (
                  <AlertTriangle className="size-3.5 shrink-0 text-yellow-500" />
                ) : (
                  <Check className="size-3.5 shrink-0 text-success" />
                )}
                <span className="min-w-0 flex-1 truncate text-text">{l.url}</span>
                {l.duplicate && (
                  <span className="shrink-0 rounded bg-yellow-500/15 px-1.5 py-0.5 font-medium text-yellow-500">
                    дубль
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {savedMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-xs font-medium text-success">
            <Check className="size-4" />
            {savedMsg}
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
            onClick={() => void save()}
            disabled={saving || !preview || newCount === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text disabled:opacity-50"
          >
            <Plus className="size-4" />
            {newCount === 0 && dupCount === 0
              ? "Проверь ссылки"
              : `Сохранить (${newCount} новых${dupCount > 0 ? `, ${dupCount} дублей` : ""})`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AddButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Добавить"
      title="Добавить"
      className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-accent transition-colors hover:bg-accent/25 active:scale-90"
    >
      <Plus className="size-4" />
    </button>
  );
}