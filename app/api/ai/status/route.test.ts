import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

beforeEach(() => {
  // Clear provider envs.
  for (const k of ["GROQ_API_KEY", "OPENAI_API_KEY", "AI_PROVIDER"]) delete process.env[k];
});

afterEach(() => { vi.restoreAllMocks(); });

describe("GET /api/ai/status", () => {
  it("reports configured=false with a hint when no provider is configured", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.configured).toBe(false);
    expect(data.providers).toBeInstanceOf(Array);
    expect(data.hint).toContain("Nessun provider");
  });

  it("reports configured=true and a default provider when a key is set", async () => {
    process.env.GROQ_API_KEY = "gsk_x";
    const res = await GET();
    const data = await res.json();
    expect(data.configured).toBe(true);
    expect(data.defaultProvider).toBe("groq");
    expect(data.defaultModel).toBe("llama-3.3-70b-versatile");
    const groq = data.providers.find((p: { id: string }) => p.id === "groq");
    expect(groq.configured).toBe(true);
  });
});
