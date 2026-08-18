"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Не регистрировать внутри Telegram WebView — офлайн-оболочка там не нужна,
    // а управление кэшем может конфликтовать с его собственным.
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("telegram") && ua.includes("webview")) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}