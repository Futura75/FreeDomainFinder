// Server-only helpers: read env, resolve the active provider+model, call it.
// Imported only by API route handlers (never by the client bundle).

import { ProviderDef } from "./ai-providers";

export interface ResolvedProvider {
  provider: ProviderDef;
  model: string;
  baseUrl: string;
  apiKey: string | null;
}

export interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  models: { id: string; label: string }[];
  defaultModel: string;
}

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

/** A provider is configured when its key is present (or it needs none) and,
 * if it requires a base URL, that base URL is set. */
export function isProviderConfigured(p: ProviderDef): boolean {
  if (p.requiresBaseUrl) {
    if (!env(p.envBaseUrl ?? "")) return false;
  }
  if (p.envKey) {
    if (!env(p.envKey)) return false;
  }
  return true;
}

export function getConfiguredProviders(): ProviderStatus[] {
  return getProviderList().map((p) => ({
    id: p.id,
    label: p.label,
    configured: isProviderConfigured(p),
    models: p.models,
    defaultModel: resolveModel(p),
  }));
}

function getProviderList(): ProviderDef[] {
  // Imported registry (re-exported to keep this file self-contained).
  // We use the module-level PROVIDERS indirectly via getProvider + a list.
  // Simplest: re-import the array.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("./ai-providers").PROVIDERS as ProviderDef[];
}

export function resolveModel(p: ProviderDef): string {
  if (p.envModel && env(p.envModel)) return env(p.envModel)!;
  return p.defaultModel;
}

function resolveBaseUrl(p: ProviderDef): string {
  if (p.envBaseUrl && env(p.envBaseUrl)) return env(p.envBaseUrl)!;
  return p.baseUrl;
}

/**
 * Resolve the active provider + model for a generate request.
 * Priority: body.provider/model > env AI_PROVIDER > env per-provider model >
 * first configured provider > none.
 */
export function resolveSelection(
  providerId?: string,
  modelId?: string
): ResolvedProvider | null {
  const list = getProviderList();

  // Explicit provider from the request.
  if (providerId) {
    const p = list.find((x) => x.id === providerId);
    if (p && isProviderConfigured(p)) {
      const model = (modelId && modelId.trim()) || resolveModel(p);
      if (!model) return null;
      return {
        provider: p,
        model,
        baseUrl: resolveBaseUrl(p),
        apiKey: p.envKey ? env(p.envKey) ?? null : null,
      };
    }
  }

  // Env-chosen default provider.
  const envProvider = env("AI_PROVIDER");
  if (envProvider) {
    const p = list.find((x) => x.id === envProvider);
    if (p && isProviderConfigured(p)) {
      const model = resolveModel(p);
      if (!model) return null;
      return {
        provider: p,
        model,
        baseUrl: resolveBaseUrl(p),
        apiKey: p.envKey ? env(p.envKey) ?? null : null,
      };
    }
  }

  // First configured provider.
  const first = list.find((p) => isProviderConfigured(p));
  if (first) {
    const model = resolveModel(first);
    if (!model) return null;
    return {
      provider: first,
      model,
      baseUrl: resolveBaseUrl(first),
      apiKey: first.envKey ? env(first.envKey) ?? null : null,
    };
  }

  return null;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Build the chat request for the provider's API shape and return the text content. */
export async function callProvider(
  resolved: ResolvedProvider,
  messages: ChatMessage[],
  opts: { temperature: number; maxTokens: number; jsonMode: boolean }
): Promise<string> {
  const { provider, model, baseUrl, apiKey } = resolved;

  if (provider.apiShape === "anthropic-messages") {
    // Anthropic Messages API: separate system, x-api-key + anthropic-version.
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const userMsgs = messages.filter((m) => m.role !== "system");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (apiKey) headers["x-api-key"] = apiKey;
    const body: Record<string, unknown> = {
      model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system,
      messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
    };
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`);
    }
    const data = await res.json();
    // content is an array of blocks; concatenate text blocks.
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return blocks
      .map((b: { type?: string; text?: string }) => (b?.type === "text" ? b.text ?? "" : ""))
      .join("");
  }

  // OpenAI-compatible chat completions.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.authScheme === "bearer" && apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider.authScheme === "x-api-key" && apiKey) {
    headers["x-api-key"] = apiKey;
  }
  // OpenRouter likes optional referer/title headers; harmless if absent.
  if (provider.id === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "FreeDomainFinder";
  }
  const body: Record<string, unknown> = {
    model,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    messages,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${provider.label} ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
