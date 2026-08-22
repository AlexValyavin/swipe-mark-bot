"use client";

import { useEffect, useState } from "react";

type AiProvider = "openrouter" | "mistral" | "openai" | "custom";

export default function AdminPage() {
  const [forbidden, setForbidden] = useState(false);
  const [aiLoading, setAiLoading] = useState(true);
  const [ai, setAi] = useState<{
    provider: AiProvider;
    model: string | null;
    hasKey: boolean;
    keyMask: string | null;
    customBaseUrl: string | null;
    allowByok: boolean;
    source?: string;
  } | null>(null);
  const [provider, setProvider] = useState<AiProvider>("openrouter");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [allowByok, setAllowByok] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  // users list minimal
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const loadAi = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/ai");
      if (res.status === 403) { setForbidden(true); return; }
      const data = await res.json();
      if (res.ok) {
        setAi(data);
        setProvider(data.provider || "openrouter");
        setModel(data.model || "");
        setBaseUrl(data.customBaseUrl || "");
        setAllowByok(!!data.allowByok);
      }
    } catch {} finally { setAiLoading(false); }
  };

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const p = provider;
      const u = `/api/admin/ai/models?provider=${encodeURIComponent(p)}&baseUrl=${encodeURIComponent(baseUrl || "")}`;
      const res = await fetch(u);
      const data = await res.json();
      if (res.ok) setModels(data.models || []);
      else setMsg(data.error || "Ошибка загрузки моделей");
    } catch { setMsg("Ошибка сети"); }
    finally { setModelsLoading(false); }
  };

  const saveAi = async (clearKey = false) => {
    setSaving(true); setMsg(null);
    try {
      const body: any = { provider, model: model || null, customBaseUrl: baseUrl || null, allowByok };
      if (clearKey) body.clearKey = true;
      else if (keyInput.trim()) body.key = keyInput.trim();
      const res = await fetch("/api/admin/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "Ошибка сохранения");
      else { setMsg("Сохранено"); setAi(data); setKeyInput(""); }
    } catch { setMsg("Ошибка сети"); }
    finally { setSaving(false); }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=50`);
      if (res.status === 403) { setForbidden(true); return; }
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
    } catch {}
    finally { setUsersLoading(false); }
  };

  useEffect(() => { loadAi(); loadUsers(); }, []);

  if (forbidden) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted">403 Forbidden — доступ только для владельца.</p>
        <p className="text-xs text-muted">Открой админку через Telegram WebView или войди по QR</p>
        <a href="/admin/login" className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-text">Войти по QR →</a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-5">
      <h1 className="text-2xl font-bold">Admin — SwipeMark</h1>

      {/* AI провайдер — для всех */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">AI — глобально для всех</h2>
        <p className="mt-1 text-xs text-muted">Меняет provider/key/model для всех пользователей. Тумблер «Разрешить BYOK» — если вкл, у кого есть свой ключ в user_settings — используется он.</p>
        {aiLoading ? <p className="mt-3 text-sm text-muted">Загрузка…</p> : (
          <div className="mt-4 flex flex-col gap-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Провайдер</label>
            <div className="flex flex-wrap gap-2">
              {(["openrouter","mistral","openai","custom"] as AiProvider[]).map(p => (
                <button key={p} onClick={() => setProvider(p)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${provider===p ? "bg-accent text-accent-text" : "bg-bg text-muted"}`}>{p}</button>
              ))}
            </div>
            {provider==="custom" && (
              <input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://host:port" className="w-full rounded-xl bg-bg px-3 py-2 text-sm" />
            )}
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Модель</label>
            <div className="flex gap-2">
              <input value={model} onChange={e=>setModel(e.target.value)} placeholder="model-id (пусто = дефолт провайдера)" className="flex-1 rounded-xl bg-bg px-3 py-2 text-sm" />
              <button onClick={loadModels} disabled={modelsLoading} className="rounded-xl bg-bg px-3 py-2 text-xs font-medium text-accent disabled:opacity-50">{modelsLoading ? "…" : "Загрузить"}</button>
            </div>
            {models && (
              <div className="max-h-44 overflow-y-auto rounded-xl bg-bg p-2">
                {models.map(m => (
                  <button key={m} onClick={()=>setModel(m)} className={`block w-full truncate rounded-lg px-2 py-1 text-left text-xs ${model===m ? "bg-accent/20 text-accent" : "text-muted hover:text-text"}`}>{m}</button>
                ))}
              </div>
            )}
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">API ключ {ai?.hasKey ? `(введён ${ai.keyMask})` : "(не задан)"}</label>
            <div className="flex gap-2">
              <input value={keyInput} onChange={e=>setKeyInput(e.target.value)} type={showKey ? "text" : "password"} placeholder="sk-... / or-..." className="flex-1 rounded-xl bg-bg px-3 py-2 text-sm" />
              <button onClick={()=>setShowKey(v=>!v)} className="rounded-xl bg-bg px-3 py-2 text-xs">👁</button>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowByok} onChange={e=>setAllowByok(e.target.checked)} /> Разрешить BYOK (свой ключ у пользователя перекрывает глобальный)</label>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>saveAi(false)} disabled={saving} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-text disabled:opacity-50">{saving ? "…" : "Сохранить"}</button>
              <button onClick={()=>saveAi(true)} disabled={saving || !ai?.hasKey} className="rounded-full bg-surface px-5 py-2 text-sm text-muted disabled:opacity-50">Удалить ключ</button>
            </div>
            {msg && <p className="text-xs text-accent">{msg}</p>}
            <p className="text-[11px] text-muted">Источник: {ai?.source || "db"} {ai?.hasKey ? "· ключ сохранён (шифр enc:v1)" : "· env OPENROUTER_API_KEY как фолбэк если БД пусто"}</p>
          </div>
        )}
      </section>

      {/* Пользователи — заготовка */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Пользователи — заготовка</h2>
        <div className="mt-3 flex gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') loadUsers(); }} placeholder="поиск по username / Telegram ID" className="flex-1 rounded-xl bg-bg px-3 py-2 text-sm" />
          <button onClick={loadUsers} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-text">Найти</button>
        </div>
        {usersLoading ? <p className="mt-3 text-sm text-muted">Загрузка…</p> : (
          <div className="mt-3 flex flex-col gap-2">
            {users.length===0 ? <p className="text-sm text-muted">Нет пользователей или загрузите список.</p> : users.map((u:any)=>(
              <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.display_name || u.telegram_username || "—"} <span className="text-xs text-muted">tg:{u.telegram_id ?? "—"}</span></p>
                  <p className="text-xs text-muted">{u.plan} {u.plan_until ? `до ${new Date(u.plan_until).toLocaleDateString()}` : ""} · saved:{u.stats?.saved ?? "—"} unsorted:{u.stats?.unsorted ?? "—"} autosort:{u.stats?.autosortUsed ?? 0}/50 summary:{u.stats?.summaryUsed ?? 0}/10</p>
                </div>
                <a href={`/api/admin/users/${u.id}`} target="_blank" className="text-xs text-accent">·</a>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">Детали/план/сбросы: <code>POST /api/admin/users/[id]/plan</code>, <code>reset-limits</code>, <code>reset-library</code>, <code>reset-progress</code>, <code>DELETE</code>, лог <code>GET /api/admin/log</code>. Миграция 0006 ещё не применена — до применения API вернёт 500.</p>
      </section>
    </div>
  );
}
