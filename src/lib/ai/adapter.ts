export type AiProvider = "openrouter" | "mistral" | "openai" | "custom";

export type AiErrorKind = "auth" | "rate" | "timeout" | "network" | "parse";

export class AiError extends Error {
  kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "AiError";
  }
}

export const PROVIDER_BASE_URLS: Record<AiProvider, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  mistral: "https://api.mistral.ai/v1",
  openai: "https://api.openai.com/v1",
  custom: "", // берётся из ai_custom_base_url
};

export const PROVIDER_DEFAULT_MODELS: Record<AiProvider, string> = {
  openrouter: "mistralai/mistral-7b-instruct:free",
  mistral: "open-mistral-7b",
  openai: "gpt-4o-mini",
  custom: "gpt-4o-mini",
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionInput = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string; // только для custom
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export type ChatCompletionResult = {
  content: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

function resolveEndpoint(provider: AiProvider, baseUrl?: string): string {
  if (provider === "custom") {
    const b = (baseUrl ?? "").trim().replace(/\/+$/, "");
    if (!b) throw new AiError("network", "custom_base_url is required");
    return `${b}/chat/completions`;
  }
  return `${PROVIDER_BASE_URLS[provider]}/chat/completions`;
}

function mapError(status: number): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  if (status === 400) return "parse";
  return "network";
}

export async function chatCompletion(
  input: ChatCompletionInput
): Promise<ChatCompletionResult> {
  const timeoutMs = input.timeoutMs ?? 8000;
  const endpoint = resolveEndpoint(input.provider, input.baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 600,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new AiError("timeout", "Request timed out");
    }
    throw new AiError("network", `Network error: ${e instanceof Error ? e.message : e}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      // тело не JSON — не критично
    }
    throw new AiError(mapError(res.status), `HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  let data: {
    choices?: { message?: { content?: string | null } }[];
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new AiError("parse", "Failed to parse provider response");
  }

  const content = data.choices?.[0]?.message?.content ?? null;
  if (typeof content !== "string") {
    throw new AiError("parse", "No content in provider response");
  }

  return {
    content,
    model: data.model ?? input.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}
