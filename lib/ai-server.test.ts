import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isProviderConfigured,
  resolveSelection,
  resolveModel,
  callProvider,
  getConfiguredProviders,
} from "./ai-server";
import { PROVIDERS } from "./ai-providers";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  // Clear all provider env vars before each test.
  const keys = [
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENCODE_BASE_URL",
    "OPENCODE_API_KEY",
    "OPENCODE_MODEL",
    "TOGETHER_API_KEY",
    "MISTRAL_API_KEY",
    "XAI_API_KEY",
    "OLLAMA_BASE_URL",
    "OLLAMA_MODEL",
    "AI_PROVIDER",
  ];
  setEnv(Object.fromEntries(keys.map((k) => [k, undefined])));
});

afterEach(() => { vi.restoreAllMocks(); });

describe("isProviderConfigured", () => {
  it("true when key is set", () => {
    setEnv({ GROQ_API_KEY: "gsk_x" });
    expect(isProviderConfigured(PROVIDERS.find((p) => p.id === "groq")!)).toBe(true);
  });
  it("false when key is missing", () => {
    expect(isProviderConfigured(PROVIDERS.find((p) => p.id === "groq")!)).toBe(false);
  });
  it("opencode requires base URL too", () => {
    setEnv({ OPENCODE_API_KEY: "k" });
    expect(isProviderConfigured(PROVIDERS.find((p) => p.id === "opencode")!)).toBe(false);
    setEnv({ OPENCODE_BASE_URL: "https://x/v1" });
    expect(isProviderConfigured(PROVIDERS.find((p) => p.id === "opencode")!)).toBe(true);
  });
  it("ollama requires base URL but no API key", () => {
    expect(isProviderConfigured(PROVIDERS.find((p) => p.id === "ollama")!)).toBe(false);
    setEnv({ OLLAMA_BASE_URL: "http://localhost:11434/v1" });
    expect(isProviderConfigured(PROVIDERS.find((p) => p.id === "ollama")!)).toBe(true);
  });
});

describe("resolveModel", () => {
  it("uses env model override when present", () => {
    setEnv({ OLLAMA_MODEL: "qwen2.5" });
    expect(resolveModel(PROVIDERS.find((p) => p.id === "ollama")!)).toBe("qwen2.5");
  });
  it("falls back to provider default", () => {
    expect(resolveModel(PROVIDERS.find((p) => p.id === "groq")!)).toBe("llama-3.3-70b-versatile");
  });
});

describe("resolveSelection", () => {
  it("returns null when nothing is configured", () => {
    expect(resolveSelection()).toBeNull();
    expect(resolveSelection("groq", "llama-3.3-70b-versatile")).toBeNull();
  });

  it("uses explicit provider/model from the request", () => {
    setEnv({ GROQ_API_KEY: "gsk_x", OPENAI_API_KEY: "sk_x" });
    const r = resolveSelection("openai", "gpt-4o-mini");
    expect(r?.provider.id).toBe("openai");
    expect(r?.model).toBe("gpt-4o-mini");
    expect(r?.apiKey).toBe("sk_x");
  });

  it("falls back when the requested provider is not configured", () => {
    setEnv({ GROQ_API_KEY: "gsk_x" });
    const r = resolveSelection("openai", "gpt-4o-mini");
    expect(r?.provider.id).toBe("groq");
  });

  it("honors AI_PROVIDER env default", () => {
    setEnv({ GROQ_API_KEY: "gsk_x", OPENAI_API_KEY: "sk_x", AI_PROVIDER: "openai" });
    const r = resolveSelection();
    expect(r?.provider.id).toBe("openai");
  });

  it("uses the first configured provider otherwise", () => {
    setEnv({ GROQ_API_KEY: "gsk_x" });
    const r = resolveSelection();
    expect(r?.provider.id).toBe("groq");
  });

  it("resolves base URL override for opencode", () => {
    setEnv({ OPENCODE_BASE_URL: "https://my/v1", OPENCODE_API_KEY: "k", OPENCODE_MODEL: "custom" });
    const r = resolveSelection("opencode");
    expect(r?.baseUrl).toBe("https://my/v1");
    expect(r?.model).toBe("custom");
  });
});

describe("getConfiguredProviders", () => {
  it("flags configured vs not", () => {
    setEnv({ GROQ_API_KEY: "gsk_x" });
    const list = getConfiguredProviders();
    const groq = list.find((p) => p.id === "groq");
    const openai = list.find((p) => p.id === "openai");
    expect(groq?.configured).toBe(true);
    expect(openai?.configured).toBe(false);
  });
});

describe("callProvider", () => {
  it("OpenAI-compatible: builds the right request and returns content", async () => {
    setEnv({ GROQ_API_KEY: "gsk_x" });
    const resolved = resolveSelection("groq")!;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "hello" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const out = await callProvider(
      resolved,
      [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      { temperature: 0.9, maxTokens: 100, jsonMode: true }
    );
    expect(out).toBe("hello");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toHaveLength(2);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer gsk_x",
    });
  });

  it("Anthropic Messages API: splits system, uses x-api-key", async () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant" });
    const resolved = resolveSelection("anthropic")!;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "ciao" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const out = await callProvider(
      resolved,
      [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      { temperature: 0.5, maxTokens: 50, jsonMode: false }
    );
    expect(out).toBe("ciao");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "x-api-key": "sk-ant" });
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(String(fetchMock.mock.calls[0][0]).endsWith("/messages")).toBe(true);
  });

  it("OpenRouter: adds referer/title headers", async () => {
    setEnv({ OPENROUTER_API_KEY: "or_x" });
    const resolved = resolveSelection("openrouter")!;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const out = await callProvider(resolved, [{ role: "user", content: "x" }], {
      temperature: 0.5,
      maxTokens: 10,
      jsonMode: false,
    });
    expect(out).toBe("ok");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer or_x",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "FreeDomainFinder",
    });
  });

  it("OpenAI-shape provider with x-api-key auth sends the x-api-key header", async () => {
    const groq = PROVIDERS.find((p) => p.id === "groq")!;
    const resolved = {
      provider: { ...groq, authScheme: "x-api-key" as const },
      model: "m",
      baseUrl: "https://example/v1",
      apiKey: "k",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    await callProvider(resolved, [{ role: "user", content: "x" }], {
      temperature: 0.5,
      maxTokens: 10,
      jsonMode: false,
    });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      "x-api-key": "k",
    });
  });

  it("throws a labelled error on non-ok response", async () => {
    setEnv({ GROQ_API_KEY: "gsk_x" });
    const resolved = resolveSelection("groq")!;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 })
    );
    await expect(
      callProvider(resolved, [{ role: "user", content: "x" }], {
        temperature: 0.5,
        maxTokens: 10,
        jsonMode: false,
      })
    ).rejects.toThrow(/Groq 429/);
  });

  it("salvages Groq's failed_generation on a json_validate_failed 400", async () => {
    setEnv({ GROQ_API_KEY: "gsk_x" });
    const resolved = resolveSelection("groq")!;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "json_validate_failed", failed_generation: '{"names":["x"]}' },
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      )
    );
    const out = await callProvider(resolved, [{ role: "user", content: "x" }], {
      temperature: 0.9,
      maxTokens: 10,
      jsonMode: true,
    });
    expect(out).toBe('{"names":["x"]}');
  });
});
