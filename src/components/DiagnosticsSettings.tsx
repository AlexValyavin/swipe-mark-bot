"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Wrench } from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";

type FailedCard = {
  id: string;
  url: string | null;
  error: string | null;
  createdAt: string;
};

export function DiagnosticsSettings() {
  const telegram = useTelegram();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<FailedCard[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/diagnostics");
      if (res.status === 403) {
        setAvailable(false);
        return;
      }
      const data = await res.json();
      if (data.error) return;
      setAvailable(true);
      setFailed(data.failed ?? []);
    } catch {
      // молча
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const refetch = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/cards/${id}/refetch`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMsg(data.error || "Ошибка");
        return;
      }
      setFailed((prev) => prev.filter((c) => c.id !== id));
      telegram?.haptic.notification("success");
    } catch {
      setMsg("Ошибка сети");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center rounded-2xl border border-line bg-surface p-4 py-8">
        <Loader2 className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!available) return null;

  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Wrench className="size-4 text-accent" />
        <h2 className="text-sm font-bold text-text">Диагностика</h2>
      </div>

      <p className="mt-2 text-xs text-muted">
        Карточки, у которых не получилось извлечь метаданные или сохранить медиа.
      </p>

      {failed.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-xs text-success">
          <AlertTriangle className="size-4" />
          Сбоев нет. Все карточки обработаны.
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {failed.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-text">
                  {c.url ?? "(без ссылки)"}
                </p>
                <p className="mt-0.5 text-[11px] text-red-400">
                  {c.error ?? "unknown"}
                  {c.createdAt
                    ? ` · ${new Date(c.createdAt).toLocaleString("ru-RU")}`
                    : ""}
                </p>
              </div>
              <button
                onClick={() => void refetch(c.id)}
                disabled={busyId === c.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
              >
                {busyId === c.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Повторить
              </button>
            </li>
          ))}
        </ul>
      )}

      {msg && <p className="mt-3 text-center text-xs text-red-400">{msg}</p>}
    </div>
  );
}
