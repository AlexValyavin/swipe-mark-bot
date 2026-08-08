"use client";

import { createContext, useContext, useEffect, useState } from "react";

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
    query_id?: string;
    auth_date?: string;
    hash?: string;
  };
  platform: string;
  version: string;
  ready: () => void;
  setHeaderColor: (color: string) => void;
  expand: () => void;
  close: () => void;
};

const TelegramContext = createContext<TelegramWebApp | null>(null);

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [twa, setTwa] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (window as any).Telegram?.WebApp as TelegramWebApp | undefined;

    if (existing?.initDataUnsafe?.user) {
      // Нативный Telegram Mini App — WebApp уже инжектирован
      existing.ready();
      existing.expand();
      setTimeout(() => setTwa(existing), 0);
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
        setTimeout(() => setTwa(app), 0);
      }
    };
    document.head.appendChild(script);
  }, []);

  return (
    <TelegramContext.Provider value={twa}>
      {children}
    </TelegramContext.Provider>
  );
}

export const useTelegram = () => useContext(TelegramContext);