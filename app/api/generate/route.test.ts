import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { type NextRequest } from "next/server";
import { POST } from "./route";

// We mock the generateNames module so the route test stays focused on the
// HTTP adapter: body parsing -> status code mapping.
vi.mock("@/lib/generate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generate")>("@/lib/generate");
  return {
    ...actual,
    generateNames: vi.fn(),
  };
});

import { generateNames, EmptyPromptError, NoProviderConfiguredError } from "@/lib/generate";

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

beforeEach(() => {
  vi.mocked(generateNames).mockReset();
});

afterEach(() => { vi.restoreAllMocks(); });

describe("POST /api/generate", () => {
  it("returns 200 with the result on success", async () => {
    vi.mocked(generateNames).mockResolvedValue({
      names: ["foo", "bar"],
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });
    const res = await POST(req({ prompt: "brief", count: 5 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ names: ["foo", "bar"], provider: "groq", model: "llama-3.3-70b-versatile" });
  });

  it("returns 400 on EmptyPromptError", async () => {
    vi.mocked(generateNames).mockRejectedValue(new EmptyPromptError());
    const res = await POST(req({ prompt: "  ", count: 5 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/prompt/);
  });

  it("returns 500 on NoProviderConfiguredError", async () => {
    vi.mocked(generateNames).mockRejectedValue(new NoProviderConfiguredError());
    const res = await POST(req({ prompt: "x", count: 5 }));
    expect(res.status).toBe(500);
  });

  it("returns 502 on other errors", async () => {
    vi.mocked(generateNames).mockRejectedValue(new Error("provider down"));
    const res = await POST(req({ prompt: "x", count: 5 }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("provider down");
  });
});
