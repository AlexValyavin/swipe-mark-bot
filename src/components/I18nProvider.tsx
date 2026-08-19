"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AppLang } from "@/lib/db/settings";
import { ru } from "@/lib/i18n/ru";
import { en } from "@/lib/i18n/en";

export type TKey = keyof typeof ru;

export type PluralForms = [one: string, few: string, many: string];

type I18nContextValue = {
  lang: AppLang;
  setLang: (lang: AppLang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  /** Плюрализация: для ru — формы [1, 2, 5], для en — [1, n]. */
  plural: (n: number, forms: PluralForms) => string;
  /** Плюрализация по словарю: key вида "one|few|many". */
  tp: (key: TKey, n: number) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const DICTS: Record<AppLang, Record<TKey, string>> = { ru, en };

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : match
  );
}

function pluralRu(n: number, forms: PluralForms): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(() => {
    if (typeof window === "undefined") return "ru";
    try {
      const stored = localStorage.getItem("swipe-lang");
      return stored === "ru" || stored === "en" ? stored : "ru";
    } catch {
      return "ru";
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: AppLang) => {
    setLangState(next);
    try {
      localStorage.setItem("swipe-lang", next);
    } catch {
      // localStorage может быть недоступен
    }
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) =>
      interpolate(DICTS[lang][key] ?? ru[key] ?? key, vars),
    [lang]
  );

  const plural = useCallback(
    (n: number, forms: PluralForms) =>
      lang === "ru" ? pluralRu(n, forms) : (n === 1 ? forms[0] : forms[2]),
    [lang]
  );

  const tp = useCallback(
    (key: TKey, n: number) => {
      const raw = DICTS[lang][key] ?? ru[key] ?? key;
      const forms = raw.split("|");
      if (forms.length !== 3) return raw;
      return plural(n, forms as PluralForms);
    },
    [lang, plural]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, plural, tp }),
    [lang, setLang, t, plural, tp]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Синхронизация языка с сервером (фоново, после авторизации). */
export function syncLang(lang: AppLang) {
  void fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang }),
  }).catch(() => {});
}