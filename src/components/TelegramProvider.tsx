"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };
    start_param?: string;
    query_id?: string;
    auth_date?: string;
    hash?: string;
  };
  platform: string;
  version: string;
  colorScheme: "light" | "dark";
  themeParams?: ThemeParams;
  ready: () => void;
  setHeaderColor: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  expand: () => void;
  close: () => void;
  isFullscreen?: boolean;
  requestFullscreen?: () => Promise<void>;
  exitFullscreen?: () => Promise<void>;
  onEvent?: (event: string, callback: (...args: unknown[]) => void) => void;
  offEvent?: (event: string, callback: (...args: unknown[]) => void) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  showConfirm?: (
    message: string,
    callback?: (ok: boolean) => void
  ) => void;
};

type Haptic = {
  impact: (style?: "light" | "medium" | "heavy") => void;
  notification: (type?: "error" | "success" | "warning") => void;
  selection: () => void;
};

type TelegramContextValue = {
  app: TelegramWebApp | null;
  colorScheme: "light" | "dark" | null;
  themeParams: ThemeParams | null;
  haptic: Haptic;
  confirm: (message: string) => Promise<boolean>;
  fullscreen: {
    supported: boolean;
    isFullscreen: boolean;
    request: () => void;
    exit: () => void;
  };
};

const noop = () => {};

const TelegramContext = createContext<TelegramContextValue | null>(null);

function applyThemeParams(app: TelegramWebApp) {
  const root = document.documentElement;
  const tp = app.themeParams;
  if (!tp) return;
  const mapping: Record<string, string> = {
    bg_color: "--tg-theme-bg-color",
    text_color: "--tg-theme-text-color",
    hint_color: "--tg-theme-hint-color",
    link_color: "--tg-theme-link-color",
    button_color: "--tg-theme-button-color",
    button_text_color: "--tg-theme-button-text-color",
    secondary_bg_color: "--tg-theme-secondary-bg-color",
  };
  for (const [key, cssVar] of Object.entries(mapping)) {
    const value = tp[key as keyof ThemeParams];
    if (value) root.style.setProperty(cssVar, value);
  }
}

/**
 * Красим нативную Bottom Bar Telegram под тему приложения.
 * Ключевое слово "secondary_bg_color" — Telegram сам следит за сменой темы.
 */
function applyBottomBarColor(app: TelegramWebApp) {
  if (typeof app.setBottomBarColor === "function") {
    app.setBottomBarColor("secondary_bg_color");
  }
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [twa, setTwa] = useState<TelegramWebApp | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (window as any).Telegram?.WebApp as TelegramWebApp | undefined;

    if (existing?.initDataUnsafe?.user) {
      // Нативный Telegram Mini App — WebApp уже инжектирован
      existing.ready();
      existing.expand();
      applyThemeParams(existing);
      applyBottomBarColor(existing);
      setTimeout(() => {
        setTwa(existing);
        setIsFullscreen(!!existing.isFullscreen);
      }, 0);
      return;
    }

    // Fallback: загружаем скрипт (Telegram Web / разработка)
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js?63";
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = (window as any).Telegram?.WebApp as TelegramWebApp | undefined;
      if (app?.initDataUnsafe?.user) {
        app.ready();
        applyThemeParams(app);
        applyBottomBarColor(app);
        setTimeout(() => {
          setTwa(app);
          setIsFullscreen(!!app.isFullscreen);
        }, 0);
      }
    };
    document.head.appendChild(script);
  }, []);

  // Подписка на изменения полноэкранного режима (Telegram WebApp).
  useEffect(() => {
    if (!twa || typeof twa.onEvent !== "function") return;
    const handler = () => setIsFullscreen(!!twa.isFullscreen);
    twa.onEvent("isFullscreenChanged", handler);
    return () => {
      if (typeof twa.offEvent === "function") twa.offEvent("isFullscreenChanged", handler);
    };
  }, [twa]);

  const haptic: Haptic = twa?.HapticFeedback
    ? {
        impact: (style) => twa.HapticFeedback?.impactOccurred(style || "light"),
        notification: (type) =>
          twa.HapticFeedback?.notificationOccurred(type || "success"),
        selection: () => twa.HapticFeedback?.selectionChanged(),
      }
    : { impact: noop, notification: noop, selection: noop };

  const confirm = (message: string): Promise<boolean> => {
    if (twa?.showConfirm) {
      return new Promise((resolve) =>
        twa.showConfirm!(message, (ok) => resolve(ok))
      );
    }
    return Promise.resolve(typeof window !== "undefined" && window.confirm(message));
  };

  const fsSupported = !!twa && typeof twa.requestFullscreen === "function";
  const fullscreen = {
    supported: fsSupported,
    isFullscreen,
    request: () => {
      if (fsSupported) twa!.requestFullscreen!().catch(() => {});
    },
    exit: () => {
      if (fsSupported) twa!.exitFullscreen!().catch(() => {});
    },
  };

  return (
    <TelegramContext.Provider
      value={{
        app: twa,
        colorScheme: twa?.colorScheme ?? null,
        themeParams: twa?.themeParams ?? null,
        haptic,
        confirm,
        fullscreen,
      }}
    >
      {children}
    </TelegramContext.Provider>
  );
}

export const useTelegram = () => useContext(TelegramContext);
