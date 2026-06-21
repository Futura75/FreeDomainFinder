import { describe, it, expect } from "vitest";
import { PROVIDERS, getProvider } from "./ai-providers";

describe("PROVIDERS registry", () => {
  it("includes all the expected providers", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "groq",
        "openai",
        "anthropic",
        "openrouter",
        "opencode",
        "together",
        "mistral",
        "xai",
        "ollama",
      ])
    );
  });

  it("each provider has a label, baseUrl (or required), envKey (or none), defaultModel, models", () => {
    for (const p of PROVIDERS) {
      expect(typeof p.label).toBe("string");
      expect(p.label.length).toBeGreaterThan(0);
      expect(["openai-chat", "anthropic-messages"]).toContain(p.apiShape);
      expect(["bearer", "x-api-key", "none"]).toContain(p.authScheme);
      if (p.requiresBaseUrl) {
        expect(p.envBaseUrl).toBeTruthy();
      } else {
        expect(p.baseUrl.length).toBeGreaterThan(0);
      }
      expect(Array.isArray(p.models)).toBe(true);
    }
  });

  it("ollama needs no key", () => {
    const ollama = getProvider("ollama");
    expect(ollama).toBeDefined();
    expect(ollama?.envKey).toBeNull();
    expect(ollama?.authScheme).toBe("none");
  });

  it("opencode requires a base URL", () => {
    const oc = getProvider("opencode");
    expect(oc?.requiresBaseUrl).toBe(true);
    expect(oc?.envBaseUrl).toBe("OPENCODE_BASE_URL");
  });

  it("anthropic uses the Messages API shape with x-api-key", () => {
    const a = getProvider("anthropic");
    expect(a?.apiShape).toBe("anthropic-messages");
    expect(a?.authScheme).toBe("x-api-key");
  });

  it("groq models do not include the deprecated mixtral", () => {
    const groq = getProvider("groq");
    const ids = groq?.models.map((m) => m.id);
    expect(ids).not.toContain("mixtral-8x7b-32768");
    expect(ids).toContain("llama-3.3-70b-versatile");
  });

  it("getProvider returns undefined for unknown ids", () => {
    expect(getProvider("nope")).toBeUndefined();
  });
});
