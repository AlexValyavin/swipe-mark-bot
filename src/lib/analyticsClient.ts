"use client";

import posthog from "posthog-js";
import type { BeforeSendFn } from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let initialized = false;

/**
 * Telegram Mini App живёт по URL с initData в hash (#tgWebAppData=...).
 * Это подпись сессии + личные данные (имя, username) — их нельзя отправлять
 * в аналитику. Вырезаем из любых URL-свойств события.
 */
function sanitizeUrl(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (!raw.includes("tgWebAppData")) return raw;
  try {
    const u = new URL(raw);
    u.hash = "";
    return u.href;
  } catch {
    return raw;
  }
}

const sanitizeEvent: BeforeSendFn = (event) => {
  if (!event) return event;
  const props = event.properties;
  if (props && typeof props === "object") {
    for (const key of Object.keys(props)) {
      if (/url|referrer|pathname/i.test(key)) {
        (props as Record<string, unknown>)[key] = sanitizeUrl(props[key]);
      }
    }
  }
  return event;
};

export function initClientAnalytics(distinctId?: string): void {
  if (!KEY || !HOST || initialized) return;
  initialized = true;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    capture_exceptions: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
    before_send: sanitizeEvent,
  });
  if (distinctId) posthog.identify(distinctId);
}

export function trackClient(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (!KEY || !HOST || !initialized) return;
  posthog.capture(event, properties);
}

export function identifyClient(distinctId: string): void {
  if (!KEY || !HOST || !initialized) return;
  posthog.identify(distinctId);
}