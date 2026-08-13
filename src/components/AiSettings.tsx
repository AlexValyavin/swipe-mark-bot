"use client";

import { useEffect, useState } from "react";
import { useTelegram } from "@/components/TelegramProvider";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";

export type AiMode = "off" | "suggest" | "auto";

type AiSettingsState = {
  provider: string;
  model: string;
  mode: AiMode;
  hasKey: boolean;
  keyMask: string | null;
  customBaseUrl: string | null;
};

const INITIAL: AiSettingsState = {
  provider: "openrouter",
  model: "",
  mode: "off",
  hasKey: false,
  keyMask: null,
  customBaseUrl: null,
};

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  mistral: "Mistral",
  openai: "OpenAI",
  custom: "Custom",
};

const MODE_LABELS: Record<AiMode, string> = {
  off: "Выкл",
  suggest: "Предлагать",
  auto: "Авто",
};

export function AiSettings() {
  const telegram = useTelegram();
  const [state, setState] = useState<AiSettingsState>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [manualModel, setManualModel] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    model?: string;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/settings/ai");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setState({
        provider: data.provider || "openrouter",
        model: data.model || "",
        mode: data.mode === "suggest" || data.mode === "auto" ? data.mode : "off",
        hasKey: !!data.hasKey,
        keyMask: data.keyMask ?? null,
        customBaseUrl: data.customBaseUrl ?? null,
      });
      setCustomUrl(data.customBaseUrl ?? "");
      setManualModel(data.autodetectModel === false);
    } catch {
      // молча
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
  }, []);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setSaveMsg(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg(data.error || "Ошибка сохранения");
        return;
      }
      setState({
        provider: data.provider,
        model: data.model,
        mode: data.mode === "suggest" || data.mode === "auto" ? data.mode : "off",
        hasKey: !!data.hasKey,
        keyMask: data.keyMask ?? null,
        customBaseUrl: data.customBaseUrl ?? null,
      });
      setCustomUrl(data.customBaseUrl ?? "");
      setNewKey("");
      telegram?.haptic.notification("success");
      setSaveMsg("Сохранено");
    } catch {
      setSaveMsg("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  const saveMode = async (mode: AiMode) => {
    setState((s) => ({ ...s, mode }));
    await save({ mode });
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: state.provider,
          key: newKey || undefined,
          model: state.model || undefined,
          customBaseUrl: customUrl || undefined,
        }),
      });
      const data = await res.json();
      setTestResult({
        ok: !!data.ok,
        latencyMs: data.latencyMs,
        model: data.model,
        error: data.error,
      });
      telegram?.haptic.notification(data.ok ? "success" : "error");
    } catch {
      setTestResult({ ok: false, error: "Ошибка сети" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 hide-scrollbar">
      {/* Provider */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
        AI-провайдер
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              telegram?.haptic.selection();
              void save({ provider: key });
            }}
            className={`rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
              state.provider === key
                ? "bg-accent text-accent-text"
                : "bg-surface text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom base URL */}
      {state.provider === "custom" && (
        <div className="mt-4">
          <label className="text-xs text-muted">Base URL</label>
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onBlur={() => {
              if (customUrl.trim() !== (state.customBaseUrl ?? "")) {
                void save({ customBaseUrl: customUrl });
              }
            }}
            placeholder="https://…"
            className="mt-1.5 w-full rounded-xl bg-surface px-4 py-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      )}

      {/* Model */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Модель
          </h2>
          <button
            onClick={() => {
              telegram?.haptic.selection();
              setManualModel((v) => !v);
            }}
            className="text-xs text-accent"
          >
            {manualModel ? "Авто" : "Вручную"}
          </button>
        </div>
        {manualModel ? (
          <input
            value={state.model}
            onChange={(e) => setState((s) => ({ ...s, model: e.target.value }))}
            onBlur={() => {
              if (state.model.trim()) void save({ model: state.model.trim() });
            }}
            placeholder="model-id"
            className="mt-1.5 w-full rounded-xl bg-surface px-4 py-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : (
          <div className="mt-1.5 rounded-xl bg-surface px-4 py-3 text-sm text-text">
            {state.model || "Авто (дефолт провайдера)"}
          </div>
        )}
      </div>

      {/* API key */}
      <div className="mt-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          API-ключ
        </h2>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface px-3 py-2.5">
            <input
              type={showKey ? "text" : "password"}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={state.hasKey ? `Введён: ${state.keyMask ?? "••••"}` : "sk-…"}
              autoComplete="off"
              className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              aria-label="Показать/скрыть ключ"
              className="text-muted hover:text-text"
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {newKey && (
            <button
              onClick={() => void save({ key: newKey.trim() })}
              disabled={saving}
              className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-text disabled:opacity-50"
            >
              Сохранить
            </button>
          )}
        </div>
        {state.hasKey && (
          <p className="mt-1 text-xs text-success">Ключ сохранён (зашифрован).</p>
        )}
      </div>

      {/* Test */}
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={() => void testConnection()}
          disabled={testing || (!state.hasKey && !newKey)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent/15 py-3 text-sm font-semibold text-accent disabled:opacity-40"
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Проверить
        </button>
      </div>
      {testResult && (
        <div
          className={`mt-2 rounded-xl px-4 py-3 text-sm ${
            testResult.ok ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"
          }`}
        >
          {testResult.ok
            ? `✅ OK · ${testResult.model ?? ""} · ${testResult.latencyMs ?? "?"} мс`
            : `❌ ${testResult.error ?? "Ошибка"}`}
        </div>
      )}

      {/* Mode */}
      <div className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Режим AI
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(Object.keys(MODE_LABELS) as AiMode[]).map((m) => (
            <button
              key={m}
              onClick={() => void saveMode(m)}
              disabled={!state.hasKey && m !== "off"}
              className={`rounded-xl px-3 py-3 text-sm font-medium transition-colors disabled:opacity-40 ${
                state.mode === m
                  ? "bg-accent text-accent-text"
                  : "bg-surface text-muted hover:text-text"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        {!state.hasKey && (
          <p className="mt-2 text-xs text-muted">
            Для режимов «Предлагать»/«Авто» нужен API-ключ.
          </p>
        )}
      </div>

      {saveMsg && (
        <p className="mt-4 text-center text-xs text-muted">{saveMsg}</p>
      )}
    </div>
  );
}