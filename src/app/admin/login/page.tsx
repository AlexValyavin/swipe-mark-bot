"use client";

import { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function AdminLoginPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const generate = async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/login/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setCode(data.code);
      setExpiresAt(data.expiresAt);
      setDeepLink(data.deepLink);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка генерации");
    }
  };

  // tick для отсчёта + первичная генерация кода
  useEffect(() => {
    const first = setTimeout(() => {
      setNow(Date.now());
      void generate();
    }, 0);
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  const expiresIn = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0;
  const hasActive = !!code && !!expiresAt && expiresIn > 0 && !linked;

  // polling статуса
  useEffect(() => {
    if (!hasActive || !code) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/login/status?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.linked && data.authorized) {
          setLinked(true);
          if (pollRef.current) window.clearInterval(pollRef.current);
          setTimeout(() => { window.location.href = "/admin"; }, 800);
        }
      } catch {}
    };
    pollRef.current = window.setInterval(() => void poll(), 3000);
    void poll();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [hasActive, code]);

  const mins = Math.floor(expiresIn / 60);
  const secs = expiresIn % 60;

  if (linked) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 overflow-y-auto p-8 text-center hide-scrollbar">
        <div className="text-5xl">✅</div>
        <p className="text-lg font-semibold text-text">Админ-вход подтверждён</p>
        <p className="text-sm text-muted">Возвращаемся в админку…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col items-center gap-6 overflow-y-auto p-6 hide-scrollbar">
      <h1 className="text-2xl font-bold">Вход в админку</h1>
      <p className="text-center text-sm text-muted">Отсканируй QR кодом из Telegram (только владелец) — боту придёт <code>/start admin_…</code></p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex size-56 items-center justify-center rounded-2xl bg-white p-4 shadow-lg">
        {deepLink ? <QRCodeSVG value={deepLink} size={200} /> : <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
      </div>

      {code && (
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-lg font-bold tracking-[0.2em] text-text">{code}</span>
          <span className="text-xs tabular-nums text-muted">{mins}:{String(secs).padStart(2, "0")}</span>
          {expiresIn <= 60 && expiresIn > 0 && <p className="text-xs text-amber-400">Код скоро истечёт</p>}
          {expiresIn === 0 && <p className="text-xs text-red-400">Код истёк</p>}
        </div>
      )}

      <div className="flex gap-2">
        {deepLink && (
          <a href={deepLink} target="_blank" rel="noopener noreferrer" className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-text">Открыть в Telegram</a>
        )}
        <button onClick={() => void generate()} className="rounded-full bg-surface px-5 py-2 text-sm text-muted">Обновить код</button>
      </div>

      <p className="text-center text-xs text-muted">Код действует 5 минут, одноразовый. После сканирования браузер получит <code>swipe_session</code> куку и доступ к <code>/admin</code>.</p>
    </div>
  );
}
