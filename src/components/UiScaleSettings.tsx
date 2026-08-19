"use client";

import { useEffect, useState } from "react";
import { Type } from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { useI18n } from "@/components/I18nProvider";

export type UiScale = "s" | "m" | "l";

const OPTIONS: { value: UiScale; label: string }[] = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];

function applyScale(scale: UiScale) {
  document.documentElement.setAttribute("data-ui-scale", scale);
}

export function UiScaleSettings() {
  const telegram = useTelegram();
  const { t } = useI18n();
  const [scale, setScale] = useState<UiScale>("m");

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        const v: UiScale =
          data.uiScale === "s" || data.uiScale === "l" ? data.uiScale : "m";
        setScale(v);
        applyScale(v);
      } catch {
        applyScale("m");
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const change = async (next: UiScale) => {
    setScale(next);
    applyScale(next);
    telegram?.haptic.selection();
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiScale: next }),
      });
    } catch {
      // молча — масштаб применяется локально
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Type className="size-4 text-muted" />
        <span className="text-sm font-medium text-text">{t("uiscale.label")}</span>
      </div>
      <div className="flex items-center gap-1 rounded-full bg-bg p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => void change(o.value)}
            aria-label={t("uiscale.aria", { label: o.label })}
            className={`min-w-9 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              scale === o.value
                ? "bg-accent text-accent-text"
                : "text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}