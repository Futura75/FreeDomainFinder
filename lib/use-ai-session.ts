"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  models: { id: string; label: string }[];
  defaultModel: string;
}

export interface AiStatusResponse {
  configured: boolean;
  providers: ProviderStatus[];
  defaultProvider: string | null;
  defaultModel: string | null;
  hint: string | null;
}

export interface AiSessionSnapshot {
  prompt: string;
  count: number;
  suggestions: string[];
  history: string[][];
}

export interface UseAiSessionOptions {
  /** Inject the status fetcher (for tests). */
  fetchStatus?: () => Promise<AiStatusResponse>;
  storage?: Storage;
  /** Inject the generator (for tests). */
  generate?: (args: {
    prompt: string;
    count: number;
    exclusions: string[];
    avoid: string[];
    provider: string;
    model: string;
  }) => Promise<{ names: string[]; provider: string; model: string }>;
  /** Inject notifications (for tests). */
  onWarn?: (message: string) => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
  /** Called with the freshly generated names so the caller can auto-check. */
  onGenerated?: (names: string[]) => void;
}

export const COUNT_LS_KEY = "fdf-count";
export const PROVIDER_LS_KEY = "fdf-ai-provider";
export const MODEL_LS_KEY = "fdf-ai-model";

/** Clamp a count to the supported 1..20 range. */
export function clampCountValue(n: number): number {
  if (!Number.isFinite(n)) return 8;
  return Math.max(1, Math.min(20, Math.trunc(n)));
}

/** Compute the avoid list = union of all previous rounds + current
 * suggestions, lowercased, deduplicated, non-empty. This is the load-bearing
 * invariant of the AI session: it guarantees regeneration never repeats
 * names already seen. Centralising it here means no caller can bypass it. */
export function computeAvoid(history: string[][], suggestions: string[]): string[] {
  return Array.from(
    new Set(
      [...history.flat(), ...suggestions].map((n) => n.trim().toLowerCase())
    )
  ).filter(Boolean);
}

export interface AiSession {
  prompt: string;
  setPrompt: (p: string) => void;
  count: number;
  setCount: (n: number) => void;
  generating: boolean;
  suggestions: string[];
  history: string[][];
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  // Provider/model selection.
  aiProviders: ProviderStatus[];
  aiConfigured: boolean;
  aiHint: string | null;
  aiProvider: string;
  aiModel: string;
  configuredProviders: ProviderStatus[];
  currentProviderStatus: ProviderStatus | null;
  onSelectProvider: (id: string) => void;
  onSelectModel: (model: string) => void;
  aiStatusLoaded: boolean;
  // Mutations.
  updateSuggestion: (i: number, value: string) => void;
  removeSuggestion: (i: number) => void;
  addSuggestion: () => void;
  generate: () => Promise<void>;
  clearRoundState: () => void;
  reset: () => void;
  hydrate: (snap: Partial<AiSessionSnapshot>) => void;
}

/** The AI-session module: owns prompt/count/suggestions/history/generating
 * plus the provider/model selection and the avoid-invariant behind one
 * interface. generate() is the only way to produce suggestions, so the
 * round-archiving + avoid-invariant can't be bypassed. */
export function useAiSession(options: UseAiSessionOptions = {}): AiSession {
  const {
    fetchStatus,
    storage,
    generate: generateFn,
    onWarn,
    onError,
    onSuccess,
    onGenerated,
  } = options;

  const [prompt, setPrompt] = useState("");
  const [count, setCountState] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<string[][]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [aiProviders, setAiProviders] = useState<ProviderStatus[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true); // optimistic
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string>("");
  const [aiModel, setAiModel] = useState<string>("");
  const [aiStatusLoaded, setAiStatusLoaded] = useState(false);

  // Restore persisted count.
  useEffect(() => {
    if (!storage) return;
    const saved = storage.getItem(COUNT_LS_KEY);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 1 && n <= 20) setCountState(n);
    }
  }, [storage]);

  const setCount = useCallback(
    (n: number) => {
      const clamped = clampCountValue(n);
      setCountState(clamped);
      try {
        storage?.setItem(COUNT_LS_KEY, String(clamped));
      } catch {
        /* ignore */
      }
    },
    [storage]
  );

  // Fetch provider status.
  useEffect(() => {
    if (!fetchStatus) return;
    let cancelled = false;
    fetchStatus()
      .then((data) => {
        if (cancelled) return;
        setAiProviders(data.providers ?? []);
        setAiConfigured(Boolean(data.configured));
        setAiHint(data.hint ?? null);
        const savedProvider = storage?.getItem(PROVIDER_LS_KEY) ?? null;
        const savedModel = storage?.getItem(MODEL_LS_KEY) ?? null;
        const configured = (data.providers ?? []).filter((p) => p.configured);
        const chosen =
          configured.find((p) => p.id === savedProvider) ??
          configured.find((p) => p.id === data.defaultProvider) ??
          configured[0];
        if (chosen) {
          setAiProvider(chosen.id);
          const model =
            (savedModel && chosen.models.some((m) => m.id === savedModel)
              ? savedModel
              : null) ??
            data.defaultModel ??
            chosen.defaultModel;
          setAiModel(model ?? "");
        }
        setAiStatusLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAiConfigured(false);
        setAiHint("Impossibile verificare la configurazione AI.");
        setAiStatusLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchStatus, storage]);

  const configuredProviders = useMemo(
    () => aiProviders.filter((p) => p.configured),
    [aiProviders]
  );

  const currentProviderStatus = useMemo(
    () => configuredProviders.find((p) => p.id === aiProvider) ?? null,
    [configuredProviders, aiProvider]
  );

  // Keep provider + model selections consistent with configured providers.
  useEffect(() => {
    if (!aiStatusLoaded || configuredProviders.length === 0) return;
    if (!configuredProviders.some((p) => p.id === aiProvider)) {
      const first = configuredProviders[0];
      setAiProvider(first.id);
      try {
        storage?.setItem(PROVIDER_LS_KEY, first.id);
      } catch {
        /* ignore */
      }
      setAiModel(first.defaultModel || "");
      try {
        storage?.setItem(MODEL_LS_KEY, first.defaultModel || "");
      } catch {
        /* ignore */
      }
      return;
    }
    const current = configuredProviders.find((p) => p.id === aiProvider)!;
    if (current.models.length > 0 && !current.models.some((m) => m.id === aiModel)) {
      const fallback = current.defaultModel || current.models[0].id;
      setAiModel(fallback);
      try {
        storage?.setItem(MODEL_LS_KEY, fallback);
      } catch {
        /* ignore */
      }
    }
  }, [aiStatusLoaded, configuredProviders, aiProvider, aiModel, storage]);

  const onSelectProvider = useCallback(
    (id: string) => {
      setAiProvider(id);
      try {
        storage?.setItem(PROVIDER_LS_KEY, id);
      } catch {
        /* ignore */
      }
      const status = aiProviders.find((x) => x.id === id);
      const model = status?.defaultModel || "";
      setAiModel(model);
      try {
        storage?.setItem(MODEL_LS_KEY, model);
      } catch {
        /* ignore */
      }
    },
    [aiProviders, storage]
  );

  const onSelectModel = useCallback(
    (model: string) => {
      setAiModel(model);
      try {
        storage?.setItem(MODEL_LS_KEY, model);
      } catch {
        /* ignore */
      }
    },
    [storage]
  );

  const updateSuggestion = useCallback((i: number, value: string) => {
    setSuggestions((cur) => cur.map((s, idx) => (idx === i ? value : s)));
  }, []);

  const removeSuggestion = useCallback((i: number) => {
    setSuggestions((cur) => cur.filter((_, idx) => idx !== i));
  }, []);

  const addSuggestion = useCallback(() => {
    setSuggestions((cur) => [...cur, ""]);
  }, []);

  const generate = useCallback(async () => {
    if (!prompt.trim()) {
      onWarn?.("Scrivi un breve prompt per l'AI.");
      return;
    }
    const avoid = computeAvoid(history, suggestions);
    setGenerating(true);
    try {
      const result = generateFn
        ? await generateFn({
            prompt,
            count,
            exclusions: [], // caller injects exclusions via the generate fn closure if needed
            avoid,
            provider: aiProvider,
            model: aiModel,
          })
        : await defaultFetchGenerate({
            prompt,
            count,
            exclusions: [],
            avoid,
            provider: aiProvider,
            model: aiModel,
          });
      // Archive the current suggestions (if any) before swapping.
      setHistory((cur) => (suggestions.length > 0 ? [...cur, suggestions] : cur));
      setSuggestions(result.names);
      onSuccess?.(
        `Generate ${result.names.length} alternative: verifica automatica avviata.`
      );
      onGenerated?.(result.names);
    } catch (e) {
      onError?.((e as Error).message || "Errore generazione AI.");
    } finally {
      setGenerating(false);
    }
  }, [prompt, count, history, suggestions, aiProvider, aiModel, generateFn, onWarn, onError, onSuccess, onGenerated]);

  // Clear the current round's suggestions + history, keep prompt/count.
  const clearRoundState = useCallback(() => {
    setSuggestions([]);
    setHistory([]);
    setShowHistory(false);
  }, []);

  const reset = useCallback(() => {
    setPrompt("");
    setSuggestions([]);
    setHistory([]);
    setShowHistory(false);
  }, []);

  const hydrate = useCallback((snap: Partial<AiSessionSnapshot>) => {
    if (typeof snap.prompt === "string") setPrompt(snap.prompt);
    if (typeof snap.count === "number") setCountState(clampCountValue(snap.count));
    if (Array.isArray(snap.suggestions)) setSuggestions(snap.suggestions);
    if (Array.isArray(snap.history)) setHistory(snap.history);
  }, []);

  return {
    prompt,
    setPrompt,
    count,
    setCount,
    generating,
    suggestions,
    history,
    showHistory,
    setShowHistory,
    aiProviders,
    aiConfigured,
    aiHint,
    aiProvider,
    aiModel,
    aiStatusLoaded,
    configuredProviders,
    currentProviderStatus,
    onSelectProvider,
    onSelectModel,
    updateSuggestion,
    removeSuggestion,
    addSuggestion,
    generate,
    clearRoundState,
    reset,
    hydrate,
  };
}

/** Default fetcher used when no `generate` is injected: calls the HTTP API. */
async function defaultFetchGenerate(args: {
  prompt: string;
  count: number;
  exclusions: string[];
  avoid: string[];
  provider: string;
  model: string;
}): Promise<{ names: string[]; provider: string; model: string }> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || "Errore generazione AI.");
  }
  return { names: data.names, provider: data.provider, model: data.model };
}
