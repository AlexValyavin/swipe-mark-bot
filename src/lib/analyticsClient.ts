"use client";

import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let initialized = false;

export function initClientAnalytics(distinctId?: string): void {
  if (!KEY || !HOST || initialized) return;
  initialized = true;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
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