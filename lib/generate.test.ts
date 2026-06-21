import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateNames,
  buildSystemPrompt,
  extractNames,
  cleanNames,
  clampCount,
  EmptyPromptError,
  NoProviderConfiguredError,
} from "./generate";

beforeEach(() => {
  // No provider keys by default.
  const keys = [
    "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY",
    "OPENCODE_BASE_URL", "OPENCODE_API_KEY", "OPENCODE_MODEL",
    "TOGETHER_API_KEY", "MISTRAL_API_KEY", "XAI_API_KEY",
    "OLLAMA_BASE_URL", "OLLAMA_MODEL", "AI_PROVIDER",
  ];
  for (const k of keys) delete process.env[k];
});

afterEach(() => { vi.restoreAllMocks(); });

describe("clampCount", () => {
  it("clamps to 1..20", () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(100)).toBe(20);
    expect(clampCount(8)).toBe(8);
    expect(clampCount("5")).toBe(5);
  });
  it("defaults to 8 on garbage", () => {
    expect(clampCount("nope")).toBe(8);
    expect(clampCount(undefined)).toBe(8);
    expect(clampCount(NaN)).toBe(8);
  });
});

describe("buildSystemPrompt", () => {
  it("includes the count and JSON instruction", () => {
    const p = buildSystemPrompt(7, [], []);
    expect(p).toContain("Genera 7");
    expect(p).toContain('{"names":');
  });
  it("includes exclusion + avoid lines when provided", () => {
    const p = buildSystemPrompt(3, ["foo"], ["bar", "baz"]);
    expect(p).toContain("Non usare queste parole come base: foo");
    expect(p).toContain("bar, baz");
  });
  it("omits those lines when arrays are empty", () => {
    const p = buildSystemPrompt(3, [], []);
    expect(p).not.toContain("Non usare queste parole");
    expect(p).not.toContain("Sono già stati proposti");
  });
});

describe("extractNames", () => {
  it("parses a clean JSON object", () => {
    expect(extractNames('{"names":["a","b"]}')).toEqual(["a", "b"]);
  });
  it("extracts the first JSON block from prose", () => {
    expect(extractNames('Sure! {"names":["x"]} hope that helps')).toEqual(["x"]);
  });
  it("returns [] on no JSON or wrong shape", () => {
    expect(extractNames("no json here")).toEqual([]);
    expect(extractNames('{"other":1}')).toEqual([]);
    expect(extractNames("")).toEqual([]);
  });
});

describe("cleanNames", () => {
  it("sanitizes, validates, dedupes, caps to count", () => {
    expect(cleanNames(["Foo", "FOO", "bar-baz", "x_y"], [], 10)).toEqual(["foo", "bar-baz", "xy"]);
  });
  it("drops names already in avoid", () => {
    expect(cleanNames(["foo", "bar"], ["foo"], 10)).toEqual(["bar"]);
  });
  it("drops invalid SLDs", () => {
    expect(cleanNames(["-bad", "good", ""], [], 10)).toEqual(["good"]);
  });
  it("caps to count, preserving order", () => {
    expect(cleanNames(["a", "b", "c"], [], 2)).toEqual(["a", "b"]);
  });
});

describe("generateNames", () => {
  it("throws EmptyPromptError on blank prompt", async () => {
    await expect(generateNames({ prompt: "   ", count: 5 })).rejects.toBeInstanceOf(
      EmptyPromptError
    );
  });

  it("throws NoProviderConfiguredError when nothing is configured", async () => {
    await expect(generateNames({ prompt: "x", count: 5 })).rejects.toBeInstanceOf(
      NoProviderConfiguredError
    );
  });

  it("runs the full pipeline and returns cleaned names + provider/model", async () => {
    process.env.GROQ_API_KEY = "gsk_x";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"names":["Alpha","Beta-2","bad_one","alpha"]}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const r = await generateNames({ prompt: "brief", count: 5 });
    expect(r.names).toEqual(["alpha", "beta-2", "badone"]);
    expect(r.provider).toBe("groq");
    expect(r.model).toBe("llama-3.3-70b-versatile");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("drops names present in avoid", async () => {
    process.env.GROQ_API_KEY = "gsk_x";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"names":["foo","bar"]}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const r = await generateNames({ prompt: "x", count: 5, avoid: ["foo"] });
    expect(r.names).toEqual(["bar"]);
  });

  it("throws when the model returns no valid names", async () => {
    process.env.GROQ_API_KEY = "gsk_x";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "no json" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    await expect(generateNames({ prompt: "x", count: 5 })).rejects.toThrow(
      /non ha restituito nomi validi/
    );
  });
});
