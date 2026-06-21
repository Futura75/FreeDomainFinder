import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAiSession,
  computeAvoid,
  clampCountValue,
  type ProviderStatus,
  type UseAiSessionOptions,
  COUNT_LS_KEY,
  PROVIDER_LS_KEY,
  MODEL_LS_KEY,
} from "./use-ai-session";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const groqConfigured: ProviderStatus = {
  id: "groq",
  label: "Groq",
  configured: true,
  models: [{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" }],
  defaultModel: "llama-3.3-70b-versatile",
};
const openaiConfigured: ProviderStatus = {
  id: "openai",
  label: "OpenAI",
  configured: true,
  models: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }],
  defaultModel: "gpt-4o-mini",
};
const openaiNotConfigured: ProviderStatus = {
  id: "openai",
  label: "OpenAI",
  configured: false,
  models: [],
  defaultModel: "gpt-4o-mini",
};

describe("clampCountValue", () => {
  it("clamps 1..20", () => {
    expect(clampCountValue(0)).toBe(1);
    expect(clampCountValue(50)).toBe(20);
    expect(clampCountValue(7)).toBe(7);
  });
  it("defaults to 8 on non-finite", () => {
    expect(clampCountValue(NaN)).toBe(8);
  });
});

describe("computeAvoid", () => {
  it("unions history + suggestions, lowercased, deduped, non-empty", () => {
    expect(computeAvoid([["Foo"], ["bar"]], ["foo", "Baz", ""])).toEqual(["foo", "bar", "baz"]);
  });
  it("returns empty when nothing provided", () => {
    expect(computeAvoid([], [])).toEqual([]);
  });
});

describe("useAiSession", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memStorage();
  });

  it("starts with default state and optimistic aiConfigured=true", () => {
    const { result } = renderHook(() => useAiSession({ storage }));
    expect(result.current.prompt).toBe("");
    expect(result.current.count).toBe(8);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.history).toEqual([]);
    expect(result.current.generating).toBe(false);
    expect(result.current.aiConfigured).toBe(true);
  });

  it("restores count from storage on mount", () => {
    storage.setItem(COUNT_LS_KEY, "15");
    const { result } = renderHook(() => useAiSession({ storage }));
    expect(result.current.count).toBe(15);
  });

  it("setCount clamps and persists", () => {
    const { result } = renderHook(() => useAiSession({ storage }));
    act(() => result.current.setCount(99));
    expect(result.current.count).toBe(20);
    expect(storage.getItem(COUNT_LS_KEY)).toBe("20");
  });

  it("updateSuggestion / removeSuggestion / addSuggestion", () => {
    const { result } = renderHook(() => useAiSession({ storage }));
    act(() => result.current.addSuggestion());
    expect(result.current.suggestions).toEqual([""]);
    act(() => result.current.updateSuggestion(0, "foo"));
    expect(result.current.suggestions).toEqual(["foo"]);
    act(() => result.current.addSuggestion());
    act(() => result.current.removeSuggestion(0));
    expect(result.current.suggestions).toEqual([""]);
  });

  it("generate warns when prompt is blank", async () => {
    const onWarn = vi.fn();
    const { result } = renderHook(() => useAiSession({ storage, onWarn }));
    await act(async () => {
      await result.current.generate();
    });
    expect(onWarn).toHaveBeenCalled();
    expect(result.current.generating).toBe(false);
  });

  it("generate archives current suggestions, swaps in new names, and notifies", async () => {
    const onGenerated = vi.fn();
    const onSuccess = vi.fn();
    type GenArg = Parameters<NonNullable<UseAiSessionOptions["generate"]>>[0];
    const generateFn = vi.fn(async (_: GenArg) => ({ names: ["alpha", "beta"], provider: "groq", model: "m" }));
    const { result } = renderHook(() =>
      useAiSession({
        storage,
        generate: generateFn,
        onSuccess,
        onGenerated,
      })
    );
    // seed current suggestions so they get archived
    act(() => result.current.updateSuggestion(0, "seed"));
    act(() => result.current.addSuggestion()); // workaround: set via hydrate instead
    act(() =>
      result.current.hydrate({ suggestions: ["seed1", "seed2"], prompt: "brief", count: 5 })
    );
    await act(async () => {
      await result.current.generate();
    });
    expect(generateFn).toHaveBeenCalled();
    // avoid should include the prior suggestions
    const call = generateFn.mock.calls[0]![0];
    expect(call.avoid).toContain("seed1");
    expect(call.avoid).toContain("seed2");
    expect(result.current.suggestions).toEqual(["alpha", "beta"]);
    expect(result.current.history).toEqual([["seed1", "seed2"]]);
    expect(onSuccess).toHaveBeenCalled();
    expect(onGenerated).toHaveBeenCalledWith(["alpha", "beta"]);
  });

  it("generate surfaces errors via onError", async () => {
    const onError = vi.fn();
    const generateFn = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() =>
      useAiSession({
        storage,
        generate: generateFn,
        onError,
      })
    );
    act(() => result.current.hydrate({ prompt: "brief" }));
    await act(async () => {
      await result.current.generate();
    });
    expect(onError).toHaveBeenCalledWith("boom");
    expect(result.current.generating).toBe(false);
  });

  it("generate() POSTs to /api/generate when no generator is injected", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ names: ["alpha", "beta"], provider: "groq", model: "m" }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAiSession({ storage, onSuccess }));
    act(() => result.current.hydrate({ prompt: "brief", count: 5 }));
    await act(async () => {
      await result.current.generate();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.current.suggestions).toEqual(["alpha", "beta"]);
    expect(onSuccess).toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("generate() surfaces the API error message on a non-ok response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom server" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useAiSession({ storage, onError }));
    act(() => result.current.hydrate({ prompt: "brief" }));
    await act(async () => {
      await result.current.generate();
    });
    expect(onError).toHaveBeenCalledWith("boom server");
    fetchMock.mockRestore();
  });

  it("fetchStatus sets providers/configured/hint and selects the default provider", async () => {
    const fetchStatus = vi.fn(async () => ({
      configured: true,
      providers: [groqConfigured, openaiNotConfigured],
      defaultProvider: "groq",
      defaultModel: "llama-3.3-70b-versatile",
      hint: null,
    }));
    const { result } = renderHook(() => useAiSession({ storage, fetchStatus }));
    await waitFor(() => expect(result.current.aiStatusLoaded).toBe(true));
    expect(result.current.aiConfigured).toBe(true);
    expect(result.current.configuredProviders.map((p) => p.id)).toEqual(["groq"]);
    expect(result.current.aiProvider).toBe("groq");
    expect(result.current.aiModel).toBe("llama-3.3-70b-versatile");
  });

  it("fetchStatus failure flips aiConfigured to false with a hint", async () => {
    const fetchStatus = vi.fn(async () => {
      throw new Error("net");
    });
    const { result } = renderHook(() => useAiSession({ storage, fetchStatus }));
    await waitFor(() => expect(result.current.aiStatusLoaded).toBe(true));
    expect(result.current.aiConfigured).toBe(false);
    expect(result.current.aiHint).toContain("Impossibile");
  });

  it("onSelectProvider persists and resets the model to that provider default", async () => {
    const fetchStatus = vi.fn(async () => ({
      configured: true,
      providers: [groqConfigured, openaiConfigured],
      defaultProvider: "groq",
      defaultModel: "llama-3.3-70b-versatile",
      hint: null,
    }));
    const { result } = renderHook(() => useAiSession({ storage, fetchStatus }));
    await waitFor(() => expect(result.current.aiStatusLoaded).toBe(true));
    act(() => result.current.onSelectProvider("openai"));
    expect(result.current.aiProvider).toBe("openai");
    expect(result.current.aiModel).toBe("gpt-4o-mini");
    expect(storage.getItem(PROVIDER_LS_KEY)).toBe("openai");
    expect(storage.getItem(MODEL_LS_KEY)).toBe("gpt-4o-mini");
  });

  it("onSelectModel persists the model", () => {
    const { result } = renderHook(() => useAiSession({ storage }));
    act(() => result.current.onSelectModel("custom-model"));
    expect(result.current.aiModel).toBe("custom-model");
    expect(storage.getItem(MODEL_LS_KEY)).toBe("custom-model");
  });

  it("sync effect resets provider/model when the saved provider is no longer configured", async () => {
    const fetchStatus = vi.fn(async () => ({
      configured: true,
      providers: [groqConfigured],
      defaultProvider: "groq",
      defaultModel: "llama-3.3-70b-versatile",
      hint: null,
    }));
    storage.setItem(PROVIDER_LS_KEY, "openai"); // not configured anymore
    const { result } = renderHook(() => useAiSession({ storage, fetchStatus }));
    await waitFor(() => expect(result.current.aiProvider).toBe("groq"));
    expect(result.current.aiModel).toBe("llama-3.3-70b-versatile");
  });

  it("clearRoundState keeps prompt/count, drops suggestions+history", () => {
    const { result } = renderHook(() => useAiSession({ storage }));
    act(() => result.current.hydrate({ prompt: "keep", count: 9, suggestions: ["a"], history: [["b"]] }));
    act(() => result.current.clearRoundState());
    expect(result.current.prompt).toBe("keep");
    expect(result.current.count).toBe(9);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.history).toEqual([]);
  });

  it("reset clears prompt + suggestions + history", () => {
    const { result } = renderHook(() => useAiSession({ storage }));
    act(() => result.current.hydrate({ prompt: "x", suggestions: ["a"], history: [["b"]] }));
    act(() => result.current.reset());
    expect(result.current.prompt).toBe("");
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.history).toEqual([]);
  });
});
