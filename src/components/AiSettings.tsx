"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTelegram } from "@/components/TelegramProvider";
import { useI18n, type TKey } from "@/components/I18nProvider";
import { PairingSettings } from "@/components/PairingSettings";
import { Eye, EyeOff, Loader2, RefreshCw, Check, Trash2 } from "lucide-react";

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

const MODE_LABELS: Record<AiMode, TKey> = {
  off: "ai.mode.off",
  suggest: "ai.mode.suggest",
  auto: "ai.mode.auto",
};

export function AiSettings() {
  const telegram = useTelegram();
  const { t } = useI18n();
  const [state, setState] = useState<AiSettingsState>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [manualModel, setManualModel] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    model?: string;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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
        setSaveMsg(data.error || t("ai.error.save"));
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
      setSaveMsg(t("ai.saved"));
    } catch {
      setSaveMsg(t("common.error.network"));
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
      setTestResult({ ok: false, error: t("common.error.network") });
    } finally {
      setTesting(false);
    }
  };

  const loadModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/settings/ai/models");
      const data = await res.json();
      if (!res.ok || data.error) {
        setModelsError(data.error || t("ai.error.models"));
        setModels(null);
        return;
      }
      setModels((data.models as string[]) ?? []);
    } catch {
      setModelsError(t("common.error.network"));
      setModels(null);
    } finally {
      setModelsLoading(false);
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
    <div className="flex-1 overflow-y-auto hide-scrollbar">
      {/* Compact AI header */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <button
          onClick={() => {
            telegram?.haptic.selection();
            setExpanded((v) => !v);
          }}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-lg">
            ✨
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">{t("ai.assistant")}</span>
            <span className="block truncate text-xs text-muted">
              {state.hasKey
                ? `${PROVIDER_LABELS[state.provider] ?? state.provider} · ${t(MODE_LABELS[state.mode])}`
                : t("ai.notConfigured")}
            </span>
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${
              state.hasKey
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-line text-muted"
            }`}
          >
            {state.hasKey ? t("ai.enabled") : t("ai.disabled")}
            <span className={`transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
          </span>
        </button>

        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              {/* Telegram pairing */}
              <PairingSettings />

              {/* Provider */}
              <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
                {t("ai.provider")}
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
                  <label className="text-xs text-muted">{t("ai.baseUrl")}</label>
                  <input
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    onBlur={() => {
                      if (customUrl.trim() !== (state.customBaseUrl ?? "")) {
                        void save({ customBaseUrl: customUrl });
                      }
                    }}
                    placeholder={t("ai.baseUrlPlaceholder")}
                    className="mt-1.5 w-full rounded-xl bg-surface px-4 py-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <p className="mt-1 text-xs text-muted">
                    {t("ai.baseUrlHint")}
                  </p>
                </div>
              )}

              {/* Model */}
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {t("ai.model")}
                  </h2>
                  <button
                    onClick={() => {
                      telegram?.haptic.selection();
                      setManualModel((v) => !v);
                    }}
                    className="text-xs text-accent"
                  >
                    {manualModel ? t("ai.modelAuto") : t("ai.modelManual")}
                  </button>
                </div>
                {manualModel ? (
                  <div className="mt-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={state.model}
                        onChange={(e) => setState((s) => ({ ...s, model: e.target.value }))}
                        onBlur={() => {
                          if (state.model.trim()) void save({ model: state.model.trim() });
                        }}
                        placeholder={t("ai.modelIdPlaceholder")}
                        className="w-full rounded-xl bg-surface px-4 py-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <button
                        onClick={() => void loadModels()}
                        disabled={modelsLoading || !state.hasKey}
                        title={t("ai.loadModels")}
                        aria-label={t("ai.loadModelsLabel")}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent disabled:opacity-40"
                      >
                        <RefreshCw className={`size-4 ${modelsLoading ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    {models && models.length > 0 ? (
                      <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto hide-scrollbar">
                        {models.map((m) => (
                          <button
                            key={m}
                            onClick={() => {
                              telegram?.haptic.selection();
                              setState((s) => ({ ...s, model: m }));
                              void save({ model: m });
                            }}
                            className={`flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-left text-sm transition-colors ${
                              state.model === m ? "text-accent" : "text-text hover:bg-line"
                            }`}
                          >
                            <span className="flex-1 truncate">{m}</span>
                            {state.model === m && <Check className="size-4 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => void loadModels()}
                          disabled={modelsLoading || !state.hasKey}
                          className="text-xs text-accent disabled:opacity-40"
                        >
                          {modelsLoading ? t("ai.modelsLoading") : modelsError ? t("ai.retryModels") : t("ai.loadModels")}
                        </button>
                        {modelsError && <span className="truncate text-xs text-red-400">{modelsError}</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1.5 rounded-xl bg-surface px-4 py-3 text-sm text-text">
                    {state.model || t("ai.modelAutoDefault")}
                  </div>
                )}
              </div>

              {/* API key */}
              <div className="mt-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t("ai.apiKey")}
                </h2>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface px-3 py-2.5">
                    <input
                      type={showKey ? "text" : "password"}
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder={state.hasKey ? t("ai.keyEntered", { mask: state.keyMask ?? "••••" }) : "sk-…"}
                      autoComplete="off"
                      className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
                    />
                    <button
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={t("ai.toggleKey")}
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
                      {t("common.save")}
                    </button>
                  )}
                </div>
                {state.hasKey && (
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-success">{t("ai.keySaved")}</p>
                    <button
                      onClick={() => void save({ clearKey: true })}
                      disabled={saving}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                      {t("common.delete")}
                    </button>
                  </div>
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
                  {t("ai.test")}
                </button>
              </div>
              {testResult && (
                <div
                  className={`mt-2 rounded-xl px-4 py-3 text-sm ${
                    testResult.ok ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {testResult.ok
                    ? t("ai.testOk", {
                        model: testResult.model ?? "",
                        ms: testResult.latencyMs ?? "?",
                      })
                    : t("ai.testError", { error: testResult.error ?? t("common.error.generic") })}
                </div>
              )}

              {/* Mode */}
              <div className="mt-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t("ai.mode")}
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
                      {t(MODE_LABELS[m])}
                    </button>
                  ))}
                </div>
                {!state.hasKey && (
                  <p className="mt-2 text-xs text-muted">
                    {t("ai.keyNeeded")}
                  </p>
                )}
              </div>

              {saveMsg && (
                <p className="mt-4 text-center text-xs text-muted">{saveMsg}</p>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}