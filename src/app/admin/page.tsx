"use client";

import { useEffect, useState } from "react";
import { Trash2, LogOut, Check, Loader2 } from "lucide-react";

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
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // users list minimal
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    if (!ai?.hasKey) { setMsg("Сначала сохраните ключ"); return; }
    setModelsLoading(true);
    setMsg(null);
    try {
      const params = new URLSearchParams({ provider });
      if (provider === "custom" && baseUrl.trim()) params.set("baseUrl", baseUrl.trim());
      const res = await fetch(`/api/admin/ai/models?${params}`);
      const data = await res.json();
      if (res.ok && data.models) setModels(data.models);
      else setMsg(data.error || data.kind || "Ошибка загрузки моделей");
    } catch { setMsg("Ошибка сети"); }
    finally { setModelsLoading(false); }
  };

  const testAi = async () => {
    if (!ai?.hasKey) { setMsg("Сначала сохраните ключ"); return; }
    setTestLoading(true);
    setTestResult(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult(`✅ OK · ${data.model || model || provider} · ${data.latencyMs ?? "?"}ms`);
        setMsg(`✅ Проверка OK · ${data.model || ""}`);
      } else {
        const err = data.error || data.kind || "Ошибка проверки";
        setTestResult(`❌ ${err}`);
        setMsg(`❌ ${err}`);
      }
    } catch { setMsg("Ошибка сети"); setTestResult("❌ Ошибка сети"); }
    finally { setTestLoading(false); }
  };

  const saveAi = async (clearKey = false) => {
    setSaving(true); setMsg(null);
    try {
      const body: any = { provider, allowByok };
      if (model.trim()) body.model = model.trim();
      if (baseUrl.trim()) body.customBaseUrl = baseUrl.trim();
      if (clearKey) body.clearKey = true;
      else if (keyInput.trim()) body.key = keyInput.trim();
      const res = await fetch("/api/admin/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        const details = (data as { details?: { fieldErrors?: Record<string, string[]> } })?.details?.fieldErrors;
        const first = details ? Object.entries(details).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ") : null;
        setMsg(first || data.error || "Ошибка сохранения");
      } else { setMsg("Сохранено"); setAi(data); setKeyInput(""); setTestResult(null); }
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

  const handleDelete = async (id: string, display: string) => {
    if (!confirm(`Удалить пользователя ${display} и все его данные? Это необратимо.`)) return;
    if (!confirm(`Подтвердите ещё раз: удалить ${display}? Введите OK в следующем окне.`)) return;
    const second = prompt(`Напишите DELETE для подтверждения удаления ${display}`);
    if (second !== "DELETE") { alert("Отменено"); return; }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data.error || "Ошибка удаления");
      else { alert("Удалено"); await loadUsers(); }
    } catch { alert("Ошибка сети"); }
    finally { setDeletingId(null); }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {}
    // also clear client cookie fallback
    try { document.cookie = "swipe_session=; Max-Age=0; Path=/;"; } catch {}
    window.location.href = "/admin/login";
  };

  useEffect(() => { loadAi(); loadUsers(); }, []);

  if (forbidden) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 overflow-y-auto p-8 text-center hide-scrollbar">
        <p className="text-sm text-muted">403 Forbidden — доступ только для владельца.</p>
        <p className="text-xs text-muted">Открой админку через Telegram WebView или войди по QR</p>
        <a href="/admin/login" className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-text">Войти по QR →</a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col gap-6 overflow-y-auto p-5 hide-scrollbar">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin — SwipeMark</h1>
        <button onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-bg hover:text-text">
          <LogOut className="size-3.5" /> Выйти
        </button>
      </div>

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
              <button onClick={loadModels} disabled={modelsLoading} className="rounded-xl bg-bg px-3 py-2 text-xs font-medium text-accent disabled:opacity-50">{modelsLoading ? <Loader2 className="size-4 animate-spin" /> : "Загрузить"}</button>
              <button onClick={testAi} disabled={testLoading || !ai?.hasKey} className="rounded-xl bg-accent/15 px-3 py-2 text-xs font-medium text-accent disabled:opacity-50">{testLoading ? <Loader2 className="size-4 animate-spin" /> : "Проверить"}</button>
            </div>
            {testResult && <p className="text-xs font-medium text-accent">{testResult}</p>}
            {models && (
              <div className="max-h-44 overflow-y-auto rounded-xl bg-bg p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-muted">Найдено {models.length} моделей</span>
                  <button onClick={()=>setModels(null)} className="text-xs text-muted hover:text-text">Скрыть ×</button>
                </div>
                {models.map(m => (
                  <button key={m} onClick={()=>{ setModel(m); setModels(null); }} className={`flex w-full items-center justify-between truncate rounded-lg px-2 py-1.5 text-left text-xs ${model===m ? "bg-accent/20 text-accent" : "text-muted hover:bg-surface hover:text-text"}`}>
                    <span className="truncate">{m}</span>
                    {model===m && <Check className="size-3.5 shrink-0" />}
                  </button>
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
            {msg && <p className="text-xs font-medium text-accent">{msg}</p>}
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
              <div key={u.id} className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.display_name || u.telegram_username || "—"} <span className="text-xs text-muted">tg:{u.telegram_id ?? "—"}</span></p>
                  <p className="text-xs text-muted">{u.plan} {u.plan_until ? `до ${new Date(u.plan_until).toLocaleDateString()}` : ""} · saved:{u.stats?.saved ?? "—"} unsorted:{u.stats?.unsorted ?? "—"} autosort:{u.stats?.autosortUsed ?? 0}/50 summary:{u.stats?.summaryUsed ?? 0}/10</p>
                </div>
                <button
                  onClick={() => handleDelete(u.id, u.display_name || u.telegram_username || u.telegram_id || u.id)}
                  disabled={deletingId===u.id}
                  aria-label="Удалить пользователя"
                  title="Удалить пользователя"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                >
                  {deletingId===u.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">Детали/план/сбросы: <code>POST /api/admin/users/[id]/plan</code>, <code>reset-limits</code>, <code>reset-library</code>, <code>reset-progress</code>, <code>DELETE</code>, лог <code>GET /api/admin/log</code>. Миграция 0006 ещё не применена — до применения API вернёт 500.</p>
      </section>
    </div>
  );
}
