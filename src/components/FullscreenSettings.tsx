"use client";

import { useEffect } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { useI18n } from "@/components/I18nProvider";

const FS_KEY = "swipe-fullscreen";

export function FullscreenSettings() {
  const telegram = useTelegram();
  const { t } = useI18n();

  // Авто-восстановление: если пользователь включал полный экран — применяем при старте.
  useEffect(() => {
    if (!telegram?.fullscreen.supported) return;
    const saved = localStorage.getItem(FS_KEY);
    if (saved === "1" && !telegram.fullscreen.isFullscreen) {
      telegram.fullscreen.request();
    }
  }, [telegram]);

  if (!telegram?.fullscreen.supported) return null;

  const isFullscreen = telegram.fullscreen.isFullscreen;

  const toggle = () => {
    telegram?.haptic.selection();
    if (isFullscreen) {
      telegram.fullscreen.exit();
      localStorage.setItem(FS_KEY, "0");
    } else {
      telegram.fullscreen.request();
      localStorage.setItem(FS_KEY, "1");
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
      <div className="flex items-center gap-2.5">
        {isFullscreen ? (
          <Minimize className="size-4 text-muted" />
        ) : (
          <Maximize className="size-4 text-muted" />
        )}
        <span className="text-sm font-medium text-text">{t("fullscreen.label")}</span>
      </div>
      <button
        onClick={toggle}
        role="switch"
        aria-checked={isFullscreen}
        aria-label={t("fullscreen.label")}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          isFullscreen ? "bg-accent" : "bg-bg"
        }`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${
            isFullscreen ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}