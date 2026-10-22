import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

function req(query: string) {
  return new NextRequest(`http://localhost:3000/api/ai/models${query}`);
}

beforeEach(() => {
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_MODEL;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GROQ_API_KEY;
});

describe("GET /api/ai/models", () => {
  it("400 when the provider param is missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("sconosciuto");
  });

  it("400 for an unknown provider", async () => {
    const res = await GET(req("?provider=nope"));
    expect(res.status).toBe(400);
  });

  it("400 when the provider is not configured", async () => {
    const res = await GET(req("?provider=groq"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("non è configurato");
  });

  it("returns the live model list, filtered to chat models", async () => {
    process.env.GROQ_API_KEY = "gsk_x";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "openai/gpt-oss-120b" },
            { id: "whisper-large-v3" },
            { id: "meta-llama/llama-prompt-guard-2-86m" },
            { id: "qwen/qwen3.8-27b" },
            { id: "openai/gpt-oss-120b" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const res = await GET(req("?provider=groq"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.provider).toBe("groq");
    expect(data.models.map((m: { id: string }) => m.id)).toEqual([
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
    ]);
  });

  it("502 with the provider's error when the upstream call fails", async () => {
    process.env.GROQ_API_KEY = "gsk_x";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":{"message":"bad key"}}', { status: 401 })
    );
    const res = await GET(req("?provider=groq"));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("Groq 401");
  });

  it("502 when the provider returns no usable model", async () => {
    process.env.GROQ_API_KEY = "gsk_x";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "whisper-large-v3" }] }), { status: 200 })
    );
    const res = await GET(req("?provider=groq"));
    expect(res.status).toBe(502);
  });
});
