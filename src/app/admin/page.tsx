"use client";

import { useEffect, useState } from "react";
import { Trash2, LogOut, Check, Loader2, MoreHorizontal, X } from "lucide-react";

type AiProvider = "openrouter" | "mistral" | "openai" | "custom";
type Plan = "free" | "beta" | "pro" | "blocked";

type AdminUser = {
  id: string;
  telegram_id: number | null;
  telegram_username: string | null;
  display_name: string | null;
  plan: string;
  plan_until: string | null;
  created_at: string;
  updated_at: string;
  stats?: {
    saved?: number;
    unsorted?: number;
    autosortUsed?: number;
    summaryUsed?: number;
    lastActivity?: string;
  };
};

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

  // users
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // plan modal
  const [planTarget, setPlanTarget] = useState<AdminUser | null>(null);
  const [planValue, setPlanValue] = useState<Plan>("free");
  const [planUntil, setPlanUntil] = useState("");
  const [planSaving, setPlanSaving] = useState(false);

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
      const body: Record<string, unknown> = { provider, allowByok };
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

  const handleDelete = async (u: AdminUser) => {
    const display = u.display_name || u.telegram_username || u.telegram_id || u.id;
    if (!confirm(`Удалить пользователя ${display} и все его данные? Это необратимо.`)) return;
    const second = prompt(`Напишите DELETE для подтверждения удаления ${display}`);
    if (second !== "DELETE") { alert("Отменено"); return; }
    setBusyUserId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data.error || "Ошибка удаления");
      else { alert("Удалено"); setMenuOpenId(null); await loadUsers(); }
    } catch { alert("Ошибка сети"); }
    finally { setBusyUserId(null); }
  };

  const runAction = async (u: AdminUser, action: "reset-limits" | "reset-library" | "reset-progress", confirmText: string) => {
    if (!confirm(confirmText)) return;
    setBusyUserId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data.error || "Ошибка действия");
      else { alert("Готово"); setMenuOpenId(null); await loadUsers(); }
    } catch { alert("Ошибка сети"); }
    finally { setBusyUserId(null); }
  };

  const openPlanModal = (u: AdminUser) => {
    setPlanTarget(u);
    setPlanValue((u.plan as Plan) || "free");
    // дефолт для beta — +14 дней
    const def = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    setPlanUntil(u.plan_until ? u.plan_until.slice(0, 10) : def);
    setMenuOpenId(null);
  };

  const savePlan = async () => {
    if (!planTarget) return;
    setPlanSaving(true);
    try {
      const body: Record<string, unknown> = { plan: planValue };
      if (planValue === "beta") body.plan_until = planUntil ? new Date(planUntil).toISOString() : null;
      const res = await fetch(`/api/admin/users/${planTarget.id}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data.error || "Ошибка сохранения плана");
      else { setPlanTarget(null); await loadUsers(); }
    } catch { alert("Ошибка сети"); }
    finally { setPlanSaving(false); }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {}
    try { document.cookie = "swipe_session=; Max-Age=0; Path=/;"; } catch {}
    window.location.href = "/admin/login";
  };

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAi();
      void loadUsers();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBetaExpired = (u: AdminUser) => {
    const now = new Date().getTime();
    return u.plan === "beta" && !!u.plan_until && new Date(u.plan_until).getTime() < now;
  };

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

      {/* Пользователи */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Пользователи</h2>
        <div className="mt-3 flex gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') loadUsers(); }} placeholder="поиск по username / Telegram ID" className="flex-1 rounded-xl bg-bg px-3 py-2 text-sm" />
          <button onClick={loadUsers} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-text">Найти</button>
        </div>
        {usersLoading ? <p className="mt-3 text-sm text-muted">Загрузка…</p> : (
          <div className="mt-3 flex flex-col gap-2">
            {users.length===0 ? <p className="text-sm text-muted">Нет пользователей или загрузите список.</p> : users.map((u)=>(
              <div key={u.id} className="relative flex items-center gap-2 rounded-xl bg-bg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {u.display_name || u.telegram_username || "—"} <span className="text-xs text-muted">tg:{u.telegram_id ?? "—"}</span>
                    {" "}
                    {isBetaExpired(u) ? (
                      <span className="ml-1 inline-flex rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Beta истекла</span>
                    ) : (
                      <span className={`ml-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${u.plan==="blocked" ? "bg-red-500/15 text-red-400" : u.plan==="beta" ? "bg-accent/15 text-accent" : u.plan==="pro" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-muted"}`}>{u.plan}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {u.plan==="beta" && u.plan_until ? `до ${new Date(u.plan_until).toLocaleDateString()} · ` : ""}
                    saved:{u.stats?.saved ?? "—"} unsorted:{u.stats?.unsorted ?? "—"} autosort:{u.stats?.autosortUsed ?? 0}/50 summary:{u.stats?.summaryUsed ?? 0}/10
                  </p>
                </div>
                {/* меню действий */}
                <button
                  onClick={() => setMenuOpenId(menuOpenId===u.id ? null : u.id)}
                  aria-label="Действия"
                  title="Действия"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
                >
                  <MoreHorizontal className="size-4" />
                </button>
                <button
                  onClick={() => handleDelete(u)}
                  disabled={busyUserId===u.id}
                  aria-label="Удалить пользователя"
                  title="Удалить пользователя"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                >
                  {busyUserId===u.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>

                {menuOpenId===u.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                    <div className="absolute right-12 top-11 z-50 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
                      <button onClick={() => openPlanModal(u)} className="block w-full px-4 py-2.5 text-left text-sm text-text hover:bg-line">
                        📋 План…
                      </button>
                      <button onClick={() => runAction(u, "reset-limits", `Обнулить AI-счётчики (${u.stats?.autosortUsed ?? 0}/50 и ${u.stats?.summaryUsed ?? 0}/10) на этот месяц?`)} className="block w-full px-4 py-2.5 text-left text-sm text-text hover:bg-line">
                        ♻️ Сбросить лимиты
                      </button>
                      <button onClick={() => runAction(u, "reset-progress", "Вернуть все карточки в «неразобрано» и стереть историю свайпов?")} className="block w-full px-4 py-2.5 text-left text-sm text-text hover:bg-line">
                        ↩️ Вернуть карточки в начало
                      </button>
                      <button onClick={() => runAction(u, "reset-library", "Очистить библиотеку: удалить карточки, папки, теги и свайпы? Профиль и план останутся.")} className="block w-full px-4 py-2.5 text-left text-sm text-text hover:bg-line">
                        🗑 Очистить библиотеку
                      </button>
                      <div className="border-t border-line" />
                      <button onClick={() => handleDelete(u)} className="block w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10">
                        ❌ Удалить аккаунт полностью
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">Все действия пишутся в журнал (<code>GET /api/admin/log</code>). Миграции 0006/0007 должны быть применены в SQL Editor — до этого API вернёт 500.</p>
      </section>

      {/* Модалка плана */}
      {planTarget && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setPlanTarget(null)}>
          <div className="w-full max-w-sm rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text">
                План: {planTarget.display_name || planTarget.telegram_username || `tg:${planTarget.telegram_id}`}
              </h3>
              <button onClick={() => setPlanTarget(null)} aria-label="Закрыть" className="flex size-8 items-center justify-center rounded-full bg-bg text-muted">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["free","beta","pro","blocked"] as Plan[]).map(p => (
                <button key={p} onClick={() => setPlanValue(p)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${planValue===p ? "bg-accent text-accent-text" : "bg-bg text-muted"}`}>{p}</button>
              ))}
            </div>
            {planValue==="beta" && (
              <div className="mt-4">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted">Beta до</label>
                <input type="date" value={planUntil} onChange={e=>setPlanUntil(e.target.value)} className="mt-1.5 w-full rounded-xl bg-bg px-3 py-2 text-sm text-text" />
              </div>
            )}
            {planValue==="blocked" && (
              <p className="mt-4 text-xs text-red-400">Blocked отключает AI для пользователя (сохранение продолжит работать).</p>
            )}
            <div className="mt-5 flex gap-2.5">
              <button onClick={() => setPlanTarget(null)} className="flex-1 rounded-full bg-bg py-2.5 text-sm font-medium text-muted hover:bg-line">Отмена</button>
              <button onClick={savePlan} disabled={planSaving} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-text disabled:opacity-50">
                {planSaving ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
