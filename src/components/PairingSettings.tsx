"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink, Link2, Loader2, QrCode, Unlink } from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";

type PairingState = {
  linked: boolean;
  telegramUsername: string | null;
  linkedAt: string | null;
  code: string | null;
  expiresAt: string | null;
};

export function PairingSettings() {
  const telegram = useTelegram();
  const [state, setState] = useState<PairingState>({
    linked: false,
    telegramUsername: null,
    linkedAt: null,
    code: null,
    expiresAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pairing/status");
      const data = await res.json();
      if (data.error) return;
      setState((prev) => {
        const next: PairingState = {
          linked: !!data.linked,
          telegramUsername: data.telegramUsername ?? null,
          linkedAt: data.linkedAt ?? null,
          code: data.code ?? null,
          expiresAt: data.expiresAt ?? null,
        };
        // Если вдруг привязался во время polling — код больше не нужен.
        if (next.linked && !next.code) return next;
        return next;
      });
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

  // Таймер TTL — обновляем каждые 5 секунд.
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  // Polling статуса каждые 3 с, пока есть активный код и он не истёк.
  const hasActiveCode = state.code && state.expiresAt && new Date(state.expiresAt).getTime() > now;
  useEffect(() => {
    if (!hasActiveCode) return;
    pollRef.current = window.setInterval(() => void load(), 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [hasActiveCode, load]);

  const generate = async () => {
    setGenerating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pairing/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMsg(data.error || "Ошибка генерации кода");
        return;
      }
      setState((s) => ({ ...s, code: data.code, expiresAt: data.expiresAt }));
      telegram?.haptic.selection();
    } catch {
      setMsg("Ошибка сети");
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!state.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      telegram?.haptic.notification("success");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // молча
    }
  };

  const unlink = async () => {
    setUnlinking(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pairing/unlink", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMsg(data.error || "Ошибка отвязки");
        return;
      }
      setState({ linked: false, telegramUsername: null, linkedAt: null, code: null, expiresAt: null });
      telegram?.haptic.notification("success");
    } catch {
      setMsg("Ошибка сети");
    } finally {
      setUnlinking(false);
    }
  };

  const expiresIn = hasActiveCode
    ? Math.max(0, Math.ceil((new Date(state.expiresAt!).getTime() - now) / 1000))
    : 0;
  const mins = Math.floor(expiresIn / 60);
  const secs = expiresIn % 60;

  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-accent" />
        <h2 className="text-sm font-bold text-text">Привязка Telegram</h2>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : state.linked ? (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <Link2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">
                @{state.telegramUsername ?? "telegram"}
              </p>
              {state.linkedAt && (
                <p className="text-xs text-muted">
                  Привязан {new Date(state.linkedAt).toLocaleDateString("ru-RU")}
                </p>
              )}
            </div>
            <button
              onClick={() => void unlink()}
              disabled={unlinking}
              className="inline-flex items-center gap-1 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              <Unlink className="size-3.5" />
              {unlinking ? "…" : "Отвязать"}
            </button>
          </div>
        </div>
      ) : state.code ? (
        <div className="mt-3">
          <p className="text-xs text-muted">
            Открой бота SwipeMark и отправь команду со своим кодом:
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-bg px-4 py-3">
              <span className="font-mono text-xl font-bold tracking-[0.2em] text-text">
                {state.code}
              </span>
              <button
                onClick={() => void copy()}
                aria-label="Скопировать код"
                className="text-muted hover:text-text"
              >
                {copied ? <span className="text-xs text-success">✓</span> : <Copy className="size-4" />}
              </button>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {mins}:{String(secs).padStart(2, "0")}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-white p-2">
              {state.code && (
                <QRCodeSVG
                  value={`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME || "SwipeMarkBot"}?start=${state.code}`}
                  size={80}
                />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <button
                onClick={() => void copy()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent/15 py-2.5 text-sm font-semibold text-accent"
              >
                <Copy className="size-4" />
                {copied ? "Скопировано" : "Скопировать код"}
              </button>
              <button
                onClick={() => {
                  const url = `https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME || "SwipeMarkBot"}?start=${state.code}`;
                  window.open(url, "_blank");
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface py-2.5 text-sm font-medium text-text hover:bg-line"
              >
                <ExternalLink className="size-4" />
                Открыть Telegram
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <QrCode className="size-4 text-muted" />
            <p className="text-xs text-muted">
              Отсканируй QR с телефона или открой бота по кнопке выше.
            </p>
          </div>
          {expiresIn <= 60 && (
            <p className="mt-2 text-xs text-red-400">Код скоро истечёт. Сгенерируй новый.</p>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-xs text-muted">
            Свяжи свой Telegram-аккаунт с профилем SwipeMark, чтобы бот узнавал тебя и привязывал сохранения.
          </p>
          <button
            onClick={() => void generate()}
            disabled={generating}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-text disabled:opacity-50"
          >
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {generating ? "Генерация…" : "Привязать Telegram"}
          </button>
        </div>
      )}

      {msg && <p className="mt-3 text-center text-xs text-red-400">{msg}</p>}
    </div>
  );
}