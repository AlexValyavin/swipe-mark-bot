import { PostHog } from "posthog-node";

const KEY = process.env.POSTHOG_PROJECT_API_KEY;
const HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!KEY) return null;
  if (!client) {
    client = new PostHog(KEY, {
      host: HOST,
      flushAt: 1,
      flushInterval: 5000,
    });
  }
  return client;
}

export type AnalyticsProps = Record<string, unknown>;

/**
 * Серверное событие. Безопасно для serverless: captureImmediate ждёт отправки,
 * но сам вызов обёрнут в try/catch и никогда не роняет роут.
 */
export async function track(
  event: string,
  distinctId: string,
  properties?: AnalyticsProps
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.captureImmediate({ distinctId, event, properties });
  } catch (e) {
    console.error(`[analytics] track "${event}" error:`, e);
  }
}

export async function identify(
  distinctId: string,
  properties?: AnalyticsProps
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    c.identify({ distinctId, properties });
  } catch (e) {
    console.error("[analytics] identify error:", e);
  }
}