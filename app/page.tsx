"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SUGGESTED_TLDS,
  parseInput,
} from "@/lib/tlds";
import { DomainStatus } from "@/lib/check";
import { setNotifyTheme, toast, popup, confirm } from "@/lib/notify";
import {
  SessionFile,
  SavedResultGroup,
  downloadSession,
  gatherSession,
  isSessionFile,
  mergeConfig,
  readSessionFile,
  scatterSession,
  type SessionSlice,
} from "@/lib/session";
import { useTldConfig } from "@/lib/use-tld-config";
import {
  buildTasks,
  parseBulk,
  sortAndFilter,
  isAllFree,
  freeCount,
  useCheckRun,
  type ResultGroup,
  type SortKey,
  type CheckTask,
} from "@/lib/use-check-run";
import { useAiSession, type AiStatusResponse } from "@/lib/use-ai-session";
import { usePinned } from "@/lib/use-pinned";
import { useTheme } from "@/lib/use-theme";
import { useViewControls } from "@/lib/use-view-controls";

/* ------------------------------- Chips ---------------------------------- */

function NewSearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Nuova ricerca: cancella risultati, alternative, storico e pinned (mantiene il testo)"
      className="h-11 px-4 rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface text-sm font-medium text-ink dark:text-darkink hover:border-accent hover:text-accent transition-colors flex items-center gap-1.5"
    >
      <i className="ri-refresh-line" /> Nuova ricerca
    </button>
  );
}

interface ProviderStatusView {
  id: string;
  label: string;
  configured: boolean;
  models: { id: string; label: string }[];
  defaultModel: string;
}

function ModelSelect({
  status,
  model,
  onChange,
}: {
  status: ProviderStatusView | null;
  model: string;
  onChange: (m: string) => void;
}) {
  const options = status && status.models.length > 0 ? status.models : null;
  return (
    <>
      {options ? (
        <select
          value={model}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 px-2 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-sm"
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          {!options.some((m) => m.id === model) && model && (
            <option value={model}>{model}</option>
          )}
        </select>
      ) : (
        <input
          value={model}
          onChange={(e) => onChange(e.target.value)}
          placeholder="es. llama3.1"
          className="h-9 px-2 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-sm font-mono"
        />
      )}
    </>
  );
}

function AiNotConfigured({ notice }: { notice: string | null }) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-5 text-sm">
      <h3 className="text-base font-semibold flex items-center gap-2 mb-2">
        <i className="ri-error-warning-line text-warning" /> Generazione AI non disponibile
      </h3>
      <p className="text-ink-muted mb-3">
        {notice ?? "Nessun provider AI configurato sul server."}{" "}
        Imposta almeno una chiave API in <span className="font-mono">.env.local</span> e riavvia il server.
      </p>
      <p className="text-xs text-ink-muted">
        Provider supportati: Groq, OpenAI, Anthropic, OpenRouter, OpenCode GO,
        Together, Mistral, xAI (Grok), Ollama. Vedi <span className="font-mono">.env.local.example</span>.
      </p>
    </div>
  );
}

function ChoiceCard({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left w-full rounded-md border p-4 transition-all flex items-start gap-3 ${
        active
          ? "border-primary ring-2 ring-primary/30 bg-primary/[0.04]"
          : "border-border dark:border-darkborder bg-background dark:bg-darkbg hover:border-primary/50"
      }`}
    >
      <i className={`${icon} text-2xl ${active ? "text-primary" : "text-ink-muted"}`} />
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${active ? "text-primary" : ""}`}>
          {title}
        </span>
        <span className="block text-xs text-ink-muted mt-0.5">{desc}</span>
      </span>
    </button>
  );
}

function TldChip({
  tld,
  active,
  onClick,
}: {
  tld: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-sm text-sm font-mono transition-colors border ${
        active
          ? "bg-primary text-white border-primary"
          : "bg-surface dark:bg-darksurface text-ink dark:text-darkink border-border dark:border-darkborder hover:border-primary"
      }`}
    >
      .{tld}
    </button>
  );
}

function ExclChip({ tld, onRemove }: { tld: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-sm font-mono bg-danger/10 text-danger border border-danger/30">
      .{tld}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Rimuovi .${tld} dalle esclusioni`}
        className="hover:opacity-70"
      >
        <i className="ri-close-line" />
      </button>
    </span>
  );
}

/* --------------------------- Results display ---------------------------- */

const statusMeta: Record<
  DomainStatus,
  { label: string; cls: string; icon: string }
> = {
  free: {
    label: "Libero",
    cls: "bg-success/12 text-success border-success/40",
    icon: "ri-checkbox-circle-fill",
  },
  taken: {
    label: "Occupato",
    cls: "bg-danger/12 text-danger border-danger/40",
    icon: "ri-close-circle-fill",
  },
  unknown: {
    label: "Non verificabile",
    cls: "bg-ink/10 text-ink-muted border-border dark:border-darkborder",
    icon: "ri-question-line",
  },
};

function NameResultGroup({
  name,
  results,
  expected,
  busy,
  onlyFree,
  highlighted,
  allFree,
  pinned,
  onSelect,
  onTogglePin,
}: {
  name: string;
  results: ResultGroup["results"];
  expected: number;
  busy: boolean;
  onlyFree: boolean;
  highlighted: boolean;
  allFree: boolean;
  pinned: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const free = results.filter((r) => r.status === "free");
  const shown = (onlyFree ? free : results)
    .slice()
    .sort((a, b) => a.tld.localeCompare(b.tld));
  const fullyFree = allFree && !busy && results.length >= expected;
  return (
    <div
      data-result-name={name}
      onClick={onSelect}
      className={`relative rounded border bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-4 animate-fadeIn cursor-pointer transition-all ${
        fullyFree
          ? "border-success ring-2 ring-success/40 bg-success/[0.06]"
          : highlighted
          ? "border-primary ring-2 ring-primary/40 bg-primary/[0.03]"
          : "border-border dark:border-darkborder hover:border-primary/50"
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-lg font-semibold font-mono break-all flex items-center gap-2">
          {name}
          {fullyFree && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-sans font-semibold bg-success text-white animate-fadeIn">
              <i className="ri-trophy-line" /> TUTTI LIBERI
            </span>
          )}
          {busy && (
            <span className="text-sm font-sans font-normal text-ink-muted animate-pulseSoft">
              verificando…
            </span>
          )}
        </h3>
        <span className="text-sm text-ink-muted">
          {free.length > 0
            ? `${free.length} liberi su ${expected}`
            : `${results.length}/${expected} verificati`}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          aria-label={pinned ? "Rimuovi dai pinnati" : "Pin risultato"}
          title={pinned ? "Rimuovi dai pinnati" : "Pin risultato"}
          className={`inline-flex items-center justify-center w-8 h-8 rounded border text-base transition-colors ${
            pinned
              ? "bg-accent/15 border-accent text-accent"
              : "border-border dark:border-darkborder text-ink-muted hover:border-accent hover:text-accent bg-surface dark:bg-darksurface"
          }`
          }
        >
          <i className={pinned ? "ri-pushpin-fill" : "ri-pushpin-line"} />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
        {shown.map((r) => {
          const meta = statusMeta[r.status];
          const isFree = r.status === "free";
          return (
            <div
              key={r.domain}
              className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded border ${meta.cls}`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <i className={`${meta.icon} text-base shrink-0`} />
                <span className="font-mono text-sm truncate">.{r.tld}</span>
              </div>
              {isFree ? (
                <a
                  href={`https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(
                    r.domain
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-medium underline hover:no-underline whitespace-nowrap"
                  title="Acquista su Namecheap"
                >
                  Acquista
                </a>
              ) : (
                <span className="flex items-center gap-1.5 text-xs">
                  {meta.label}
                  {r.status === "taken" && (
                    <span className="flex items-center gap-1.5">
                      <a
                        href={`https://who.is/whois/${encodeURIComponent(r.domain)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-ink-muted hover:text-primary"
                        title={`Cerca WHOIS di ${r.domain}`}
                        aria-label={`Cerca WHOIS di ${r.domain}`}
                      >
                        <i className="ri-information-line text-sm" />
                      </a>
                      <a
                        href={`https://${encodeURIComponent(r.domain)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-ink-muted hover:text-primary"
                        title={`Apri ${r.domain} in una nuova tab`}
                        aria-label={`Apri ${r.domain} in una nuova tab`}
                      >
                        <i className="ri-external-link-line text-sm" />
                      </a>
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
        {shown.length === 0 && (
          <span className="text-sm text-ink-muted col-span-full">
            Nessun TLD libero per questo nome.
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Page ----------------------------------- */

type ViewTab = "results" | "pinned";

/** Fetch the server's AI provider/model configuration. Module-level so its
 * identity is stable across renders (the session hook re-runs its status
 * effect when this changes). */
async function fetchAiStatus(): Promise<AiStatusResponse> {
  const res = await fetch("/api/ai/status");
  if (!res.ok) throw new Error("Impossibile verificare la configurazione AI.");
  return res.json();
}

export default function Page() {
  /* ---------- theme (module) ---------- */
  const { dark, toggleTheme } = useTheme({
    storage: typeof window !== "undefined" ? localStorage : undefined,
    matchMedia:
      typeof window !== "undefined" ? (q) => window.matchMedia(q) : undefined,
    onChange: (d) => {
      document.documentElement.classList.toggle("dark", d);
      setNotifyTheme(d);
    },
  });

  /* ---------- TLD config (module) ---------- */
  const tldConfig = useTldConfig({ storage: typeof window !== "undefined" ? localStorage : undefined });
  const {
    active,
    exclusions,
    used,
    effectiveTlds,
    toggleActive,
    addActive,
    removeActive,
    addExclusion,
    removeExclusion,
    hydrate: hydrateTld,
  } = tldConfig;

  const [newTld, setNewTld] = useState("");
  const [newExcl, setNewExcl] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  const onAddActive = (raw: string) => {
    addActive(raw);
    setNewTld("");
  };
  const onAddExclusion = (raw: string) => {
    addExclusion(raw);
    setNewExcl("");
  };

  /* ---------- view controls (module) ---------- */
  const view = useViewControls();
  const {
    mode,
    setMode,
    inputMode,
    setInputMode,
    checkInput,
    setCheckInput,
    bulkInput,
    setBulkInput,
    sortKey,
    setSortKey,
    onlyFree,
    setOnlyFree,
    onlyAllFree,
    setOnlyAllFree,
  } = view;

  /* ---------- check run (module) ---------- */
  const buildTasksForName = useCallback(
    (name: string, tld: string | null): CheckTask[] =>
      buildTasks(name, tld, effectiveTlds, exclusions),
    [effectiveTlds, exclusions]
  );

  const checkRun = useCheckRun({
    buildTasksForName,
    onComplete: (_c, n) => popup("success", "Verifica completata", `Controllati domini su ${n} nomi.`),
    onWarn: (m) => toast("warning", m),
    onError: (m) => toast("error", m),
  });
  const {
    results,
    expectedMap,
    checking,
    progress,
    checkEntries,
    checkNames,
    setResults,
    setExpectedMap,
    clear: clearResults,
    hydrate: hydrateCheckRun,
  } = checkRun;

  /* ---------- pinned (module) ---------- */
  const {
    pinned,
    pinnedSet,
    togglePin,
    removePin,
    setPinned,
    clear: clearPinned,
  } = usePinned({ storage: typeof window !== "undefined" ? localStorage : undefined });

  /* ---------- AI session (module) ---------- */
  const ai = useAiSession({
    storage: typeof window !== "undefined" ? localStorage : undefined,
    fetchStatus: fetchAiStatus,
    onWarn: (m) => toast("warning", m),
    onError: (m) => toast("error", m),
    onSuccess: (m) => toast("success", m),
    onGenerated: (names) => {
      // Auto-check the freshly generated names.
      void checkNames(names, null);
      setSelectedName(null);
    },
  });
  const {
    prompt,
    setPrompt,
    count,
    setCount,
    generating,
    suggestions,
    history,
    showHistory,
    setShowHistory,
    aiConfigured,
    aiHint,
    aiProvider,
    aiModel,
    configuredProviders,
    currentProviderStatus,
    onSelectProvider,
    onSelectModel,
    updateSuggestion,
    removeSuggestion,
    addSuggestion,
    generate,
    clearRoundState,
    reset: resetAi,
    hydrate: hydrateAi,
  } = ai;

  /* ---------- transient view state (not persisted in sessions) ---------- */
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("results");

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- highlight + scroll into view ---------- */
  useEffect(() => {
    if (!selectedName) return;
    const el = document.querySelector(
      `[data-result-name="${CSS.escape(selectedName)}"]`
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedName, results]);

  /* ---------- derived ---------- */
  const visibleGroups = useMemo(
    () =>
      sortAndFilter(
        viewTab === "pinned" ? pinned : results,
        sortKey,
        onlyFree,
        onlyAllFree,
        expectedMap
      ),
    [results, pinned, viewTab, sortKey, onlyFree, onlyAllFree, expectedMap]
  );

  const allFreeSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of results) if (isAllFree(g, expectedMap[g.name] ?? g.expected)) s.add(g.name);
    for (const g of pinned) if (isAllFree(g, g.expected)) s.add(g.name);
    return s;
  }, [results, expectedMap, pinned]);

  const totalFree = useMemo(
    () => results.reduce((acc, g) => acc + freeCount(g), 0),
    [results]
  );

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  const rightNames = useMemo(
    () =>
      mode === "generate"
        ? suggestions
        : Array.from(
            new Set([...results.map((g) => g.name), ...pinned.map((g) => g.name)])
          ),
    [mode, suggestions, results, pinned]
  );

  /* ---------- direct check handler ---------- */
  // Surface the names the intake dropped as invalid (≤3 shown).
  const warnInvalid = (invalid: string[]) => {
    if (invalid.length === 0) return;
    toast(
      "warning",
      `${invalid.length} righe ignorate come non valide: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`
    );
  };

  const onCheckDirect = async () => {
    if (inputMode === "single") {
      if (!checkInput.trim()) {
        toast("warning", "Inserisci un nome a dominio.");
        return;
      }
      const { invalid } = await checkEntries([parseInput(checkInput)]);
      if (invalid.length > 0) toast("warning", "Nome non valido.");
    } else {
      const { parsed, invalid } = parseBulk(bulkInput, parseInput);
      if (parsed.length === 0 && invalid.length === 0) {
        toast("warning", "Inserisci almeno un dominio nella lista.");
        return;
      }
      const { invalid: rejected } = await checkEntries(parsed);
      warnInvalid([...invalid, ...rejected]);
    }
  };

  const onCheckSuggestions = () => {
    void checkNames(suggestions, null).then(({ invalid }) => warnInvalid(invalid));
  };

  const onRecheck = (source: ViewTab) => {
    const base = source === "pinned" ? pinned : results;
    const names = base.map((g) => g.name);
    if (names.length === 0) return;
    void checkNames(names, null);
  };

  /* ---------- new search / reset ---------- */
  const onNewSearch = () => {
    clearResults();
    clearRoundState();
    setSelectedName(null);
    view.clearFilters();
    clearPinned();
    setViewTab("results");
  };

  const onResetSession = () => {
    view.clearInputs();
    resetAi();
    clearResults();
    setSelectedName(null);
    view.clearFilters();
    clearPinned();
    setViewTab("results");
    toast("info", "Sessione azzerata.");
  };

  /* ---------- session save / load (gather/scatter over slices) ---------- */
  const viewSlice: SessionSlice = useMemo(
    () => ({
      key: "view",
      serialize: view.serialize,
      hydrate: view.hydrate,
    }),
    [view.serialize, view.hydrate]
  );

  const aiSlice: SessionSlice = useMemo(
    () => ({
      key: "ai",
      serialize: () => ({
        prompt,
        count,
        suggestions,
        history,
      }),
      hydrate: (s) =>
        hydrateAi({
          prompt: typeof s.prompt === "string" ? s.prompt : undefined,
          count: typeof s.count === "number" ? s.count : undefined,
          suggestions: Array.isArray(s.suggestions) ? s.suggestions : undefined,
          history: Array.isArray(s.history) ? (s.history as string[][]) : undefined,
        }),
    }),
    [prompt, count, suggestions, history, hydrateAi]
  );

  const checkSlice: SessionSlice = useMemo(
    () => ({
      key: "check",
      serialize: () => ({
        results: results as SavedResultGroup[],
        expectedMap,
        pinned: pinned as SavedResultGroup[],
      }),
      hydrate: (s) => {
        if (Array.isArray(s.results)) setResults(s.results as ResultGroup[]);
        if (s.expectedMap && typeof s.expectedMap === "object")
          setExpectedMap(s.expectedMap as Record<string, number>);
        if (Array.isArray(s.pinned)) setPinned(s.pinned as ResultGroup[]);
      },
    }),
    [results, expectedMap, pinned, setResults, setExpectedMap]
  );

  const buildSession = useCallback((): SessionFile => {
    return gatherSession(
      { active, exclusions, used },
      [viewSlice, aiSlice, checkSlice]
    );
  }, [active, exclusions, used, viewSlice, aiSlice, checkSlice]);

  const onSaveSession = () => {
    if (
      results.length === 0 &&
      !checkInput &&
      !bulkInput &&
      suggestions.length === 0 &&
      pinned.length === 0
    ) {
      toast("warning", "Niente da salvare: esegui prima una ricerca.");
      return;
    }
    downloadSession(buildSession());
    toast("success", "Sessione salvata come file JSON.");
  };

  const onLoadSession = () => fileInputRef.current?.click();

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const raw = await readSessionFile(file);
      if (!isSessionFile(raw)) {
        toast("error", "File non valido: non è una sessione FreeDomainFinder.");
        return;
      }
      const ok = await confirm(
        "Carica sessione?",
        `Saranno ripristinati ${raw.results.length} nomi, la configurazione TLD e gli input. Vuoi continuare?`,
        { confirmText: "Carica", cancelText: "Annulla" }
      );
      if (!ok) return;
      if (raw.config) hydrateTld(mergeConfig(raw.config));
      scatterSession(raw, [viewSlice, aiSlice, checkSlice]);
      setSelectedName(null);
      toast("success", "Sessione caricata.");
    } catch (err) {
      toast("error", `Impossibile leggere il file: ${(err as Error).message}`);
    }
  };

  /* ------------------------------- render -------------------------------- */
  return (
    <div className="min-h-screen">
      <header className="border-b border-border dark:border-darkborder bg-surface/80 dark:bg-darksurface/80 backdrop-blur sticky top-0 z-30">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded bg-primary text-white grid place-items-center shrink-0">
              <i className="ri-global-line text-xl" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight truncate">FreeDomainFinder</h1>
              <p className="text-xs text-ink-muted leading-tight truncate hidden sm:block">
                Verifica disponibilità + alternative AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetSession}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded border border-border dark:border-darkborder hover:border-danger text-sm"
              title="Azzera prompt, risultati e nomi già generati"
            >
              <i className="ri-restart-line" />
              <span className="hidden sm:inline">Azzera</span>
            </button>
            <button
              type="button"
              onClick={onSaveSession}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded border border-border dark:border-darkborder hover:border-primary text-sm"
              title="Salva sessione su file JSON"
            >
              <i className="ri-save-line" />
              <span className="hidden sm:inline">Salva</span>
            </button>
            <button
              type="button"
              onClick={onLoadSession}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded border border-border dark:border-darkborder hover:border-primary text-sm"
              title="Carica sessione da file JSON"
            >
              <i className="ri-folder-open-line" />
              <span className="hidden sm:inline">Carica</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={onFilePicked}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setShowConfig((s) => !s)}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded border border-border dark:border-darkborder hover:border-primary text-sm"
            >
              <i className="ri-settings-3-line" />
              <span className="hidden sm:inline">TLD</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Cambia tema"
              className="w-9 h-9 grid place-items-center rounded border border-border dark:border-darkborder hover:border-primary"
            >
              <i className={dark ? "ri-sun-line" : "ri-moon-line"} />
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* TLD config panel */}
        <section
          className={`mb-6 rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark overflow-hidden transition-[max-height,opacity] ${
            showConfig ? "max-h-[1400px] opacity-100" : "max-h-0 opacity-0 border-0"
          }`}
        >
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <i className="ri-list-check-2 text-primary" />
                Estensioni di dominio
              </h2>
              <button
                onClick={() => setShowConfig(false)}
                aria-label="Chiudi"
                className="text-ink-muted hover:text-ink"
              >
                <i className="ri-close-line text-lg" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">
                Attive ({active.length})
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {active.map((t) => (
                  <TldChip key={t} tld={t} active onClick={() => removeActive(t)} />
                ))}
                {active.length === 0 && (
                  <span className="text-sm text-ink-muted">
                    Nessun TLD attivo. Aggiungine almeno uno.
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTld}
                  onChange={(e) => setNewTld(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onAddActive(newTld)}
                  placeholder="aggiungi es. tech"
                  className="flex-1 h-9 px-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-sm font-mono"
                />
                <button
                  onClick={() => onAddActive(newTld)}
                  className="h-9 px-3 rounded bg-primary text-white text-sm hover:bg-primary-dark"
                >
                  <i className="ri-add-line" /> Aggiungi
                </button>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">Suggerite</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_TLDS.filter((t) => !active.includes(t)).map((t) => (
                  <TldChip key={t} tld={t} active={false} onClick={() => toggleActive(t)} />
                ))}
              </div>
            </div>

            {used.filter((t) => !active.includes(t) && !SUGGESTED_TLDS.includes(t)).length > 0 && (
              <div className="mb-4">
                <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">
                  Usati di recente
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {used
                    .filter((t) => !active.includes(t) && !SUGGESTED_TLDS.includes(t))
                    .map((t) => (
                      <TldChip key={t} tld={t} active={false} onClick={() => toggleActive(t)} />
                    ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">
                Escluse (mai mostrate)
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                {exclusions.map((t) => (
                  <ExclChip key={t} tld={t} onRemove={() => removeExclusion(t)} />
                ))}
                {exclusions.length === 0 && (
                  <span className="text-sm text-ink-muted">Nessuna esclusione.</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={newExcl}
                  onChange={(e) => setNewExcl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onAddExclusion(newExcl)}
                  placeholder="escludi es. xyz"
                  className="flex-1 h-9 px-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-sm font-mono"
                />
                <button
                  onClick={() => onAddExclusion(newExcl)}
                  className="h-9 px-3 rounded border border-danger/50 text-danger text-sm hover:bg-danger/10"
                >
                  <i className="ri-forbid-line" /> Escludi
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs text-ink-muted">
              Configurazione salvata nel browser. TLD attivi ({effectiveTlds.length} dopo esclusioni) usati quando inserisci solo il nome.
            </p>
          </div>
        </section>

        {/* Main grid */}
        <section className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="min-w-0 flex flex-col gap-6">
            {/* input card */}
            <div className="rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-4 sm:p-6">
              <div className="inline-flex rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg p-1 mb-4">
                <button
                  onClick={() => setMode("check")}
                  className={`px-4 h-9 rounded text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    mode === "check"
                      ? "bg-surface dark:bg-darksurface shadow-sm"
                      : "text-ink-muted"
                  }`}
                >
                  <i className="ri-search-line" /> Verifica diretta
                </button>
                <button
                  onClick={() => aiConfigured && setMode("generate")}
                  disabled={!aiConfigured}
                  title={aiConfigured ? "" : aiHint ?? "AI non configurata"}
                  className={`px-4 h-9 rounded text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    mode === "generate"
                      ? "bg-surface dark:bg-darksurface shadow-sm"
                      : aiConfigured
                      ? "text-ink-muted"
                      : "text-ink-muted opacity-50 cursor-not-allowed"
                  }`}
                >
                  <i className="ri-magic-line" /> Genera con AI
                </button>
              </div>

              {mode === "check" ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    <ChoiceCard
                      active={inputMode === "single"}
                      icon="ri-input-method-line"
                      title="Singolo dominio"
                      desc="Verifica un nome alla volta, con o senza estensione."
                      onClick={() => setInputMode("single")}
                    />
                    <ChoiceCard
                      active={inputMode === "bulk"}
                      icon="ri-list-unordered"
                      title="Lista di domini"
                      desc="Uno per riga, anche con estensioni diverse."
                      onClick={() => setInputMode("bulk")}
                    />
                  </div>

                  {inputMode === "single" ? (
                    <>
                      <label htmlFor="check-input" className="block text-sm font-medium mb-2">
                        Nome a dominio
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          id="check-input"
                          value={checkInput}
                          onChange={(e) => setCheckInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && onCheckDirect()}
                          placeholder="es. mieodomini  oppure  mieodomini.it"
                          className="flex-1 h-11 px-4 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono"
                        />
                        <button
                          onClick={onCheckDirect}
                          disabled={checking}
                          className="h-11 px-5 rounded bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                          {checking ? (
                            <>
                              <i className="ri-loader-4-line animate-spin" /> Verifica…
                            </>
                          ) : (
                            <>
                              <i className="ri-search-line" /> Controlla
                            </>
                          )}
                        </button>
                        <NewSearchButton onClick={onNewSearch} />
                      </div>
                      <p className="mt-2 text-xs text-ink-muted">
                        Senza estensione verifica su tutti i {effectiveTlds.length} TLD attivi.
                        Con estensione (es. <span className="font-mono">.it</span>) verifica solo quel TLD.
                      </p>
                    </>
                  ) : (
                    <>
                      <label htmlFor="bulk-input" className="block text-sm font-medium mb-2">
                        Lista di domini — uno per riga
                      </label>
                      <textarea
                        id="bulk-input"
                        value={bulkInput}
                        onChange={(e) => setBulkInput(e.target.value)}
                        rows={8}
                        placeholder={"es.\nmieodomini\nmieodomini.it\naltrosito\nprogetto.app"}
                        className="w-full px-4 py-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono resize-y"
                      />
                      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                        <p className="text-xs text-ink-muted">
                          Righe con estensione → solo quel TLD; righe senza → tutti i {effectiveTlds.length} TLD attivi.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={onCheckDirect}
                            disabled={checking}
                            className="h-11 px-5 rounded bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60 flex items-center gap-2"
                          >
                            {checking ? (
                              <>
                                <i className="ri-loader-4-line animate-spin" /> Verifica…
                              </>
                            ) : (
                              <>
                                <i className="ri-search-line" /> Controlla lista
                              </>
                            )}
                          </button>
                          <NewSearchButton onClick={onNewSearch} />
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : aiConfigured ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium flex items-center gap-1.5">
                        <i className="ri-cpu-line text-primary" /> Provider
                      </span>
                      <select
                        value={aiProvider}
                        onChange={(e) => onSelectProvider(e.target.value)}
                        className="h-9 px-2 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-sm"
                      >
                        {configuredProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium flex items-center gap-1.5">
                        <i className="ri-stack-line text-primary" /> Modello
                      </span>
                      <ModelSelect
                        status={currentProviderStatus}
                        model={aiModel}
                        onChange={onSelectModel}
                      />
                    </label>
                  </div>
                  <label htmlFor="prompt-input" className="block text-sm font-medium mb-2">
                    Descrivi l'idea in poche parole
                  </label>
                  <textarea
                    id="prompt-input"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="es. startup che usa AI per gestire le spese condivise tra coinquilini, tono friendly e moderno"
                    rows={3}
                    className="w-full px-4 py-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base resize-y"
                  />
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <label className="text-sm flex items-center gap-2">
                      N. alternative
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value) || 1)}
                        className="w-20 h-9 px-2 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-center font-mono"
                      />
                    </label>
                    <button
                      onClick={() => void generate()}
                      disabled={generating}
                      className="h-11 px-5 rounded bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60 flex items-center gap-2"
                    >
                      {generating ? (
                        <>
                          <i className="ri-loader-4-line animate-spin" /> Genero…
                        </>
                      ) : suggestions.length > 0 || history.flat().length > 0 ? (
                        <>
                          <i className="ri-magic-line" /> Genera un'altra lista
                        </>
                      ) : (
                        <>
                          <i className="ri-magic-line" /> Genera alternative
                        </>
                      )}
                    </button>
                    <NewSearchButton onClick={onNewSearch} />
                  </div>
                </>
              ) : (
                <AiNotConfigured notice={aiHint} />
              )}
            </div>

            {/* progress bar */}
            {progress && (
              <div className="rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-3 animate-fadeIn">
                <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <i className="ri-loader-4-line animate-spin text-primary" />
                    Verifica in corso…
                  </span>
                  <span className="font-mono">
                    {progress.done}/{progress.total} ({progressPct}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-background dark:bg-darkbg overflow-hidden border border-border dark:border-darkborder">
                  <div
                    className="h-full bg-primary transition-[width] duration-200 ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* results / pinned */}
            <div>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface p-1">
                    <button
                      onClick={() => setViewTab("results")}
                      className={`px-3 h-8 rounded text-sm font-medium flex items-center gap-1.5 ${
                        viewTab === "results"
                          ? "bg-primary text-white"
                          : "text-ink dark:text-darkink hover:bg-background dark:hover:bg-darkbg"
                      }`}
                    >
                      <i className="ri-list-results" /> Risultati
                      {results.length > 0 && (
                        <span className="font-mono text-xs opacity-90">{results.length}</span>
                      )}
                    </button>
                    <button
                      onClick={() => setViewTab("pinned")}
                      className={`px-3 h-8 rounded text-sm font-medium flex items-center gap-1.5 ${
                        viewTab === "pinned"
                          ? "bg-accent text-white"
                          : "text-ink dark:text-darkink hover:bg-background dark:hover:bg-darkbg"
                      }`}
                    >
                      <i className="ri-pushpin-fill" /> Pinned
                      {pinned.length > 0 && (
                        <span className="font-mono text-xs opacity-90">{pinned.length}</span>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={onlyFree}
                      onChange={(e) => setOnlyFree(e.target.checked)}
                      className="accent-primary"
                    />
                    Solo liberi
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={onlyAllFree}
                      onChange={(e) => setOnlyAllFree(e.target.checked)}
                      className="accent-success"
                    />
                    Solo tutti liberi
                    {allFreeSet.size > 0 && (
                      <span className="text-xs font-mono text-success">
                        ({allFreeSet.size})
                      </span>
                    )}
                  </label>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="h-9 px-2 rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface text-sm"
                    aria-label="Ordina risultati"
                  >
                    <option value="alpha-asc">Alfabetico A→Z</option>
                    <option value="alpha-desc">Alfabetico Z→A</option>
                    <option value="free-desc">Disponibilità (più liberi prima)</option>
                    <option value="free-asc">Disponibilità (meno liberi prima)</option>
                  </select>
                </div>
                <button
                  onClick={() => onRecheck(viewTab)}
                  disabled={checking || (viewTab === "results" ? results.length === 0 : pinned.length === 0)}
                  className="h-9 px-3 rounded border border-border dark:border-darkborder hover:border-primary text-sm flex items-center gap-1.5 disabled:opacity-60"
                  title={viewTab === "pinned" ? "Ricontrolla tutti i nomi pinnati" : "Ricontrolla tutti i nomi"}
                >
                  <i className="ri-restart-line" /> Ricontrolla
                </button>
              </div>

              {(() => {
                const activeEmpty =
                  viewTab === "pinned" ? pinned.length === 0 : results.length === 0;
                if (activeEmpty) {
                  return (
                    <div className="text-center py-16 text-ink-muted rounded border border-dashed border-border dark:border-darkborder">
                      <i
                        className={`text-5xl block mb-3 opacity-40 ${
                          viewTab === "pinned" ? "ri-pushpin-line" : "ri-global-line"
                        }`}
                      />
                      <p className="text-sm">
                        {viewTab === "pinned"
                          ? "Pinna i risultati che ti interessano per ritrovarli qui. Persistono tra i reload della pagina e nelle sessioni salvate."
                          : "Inserisci un nome per verificare la disponibilità, oppure genera alternative con AI."}
                      </p>
                    </div>
                  );
                }
                if (visibleGroups.length === 0 && (onlyFree || onlyAllFree)) {
                  return (
                    <div className="text-center py-10 text-ink-muted text-sm">
                      <i className="ri-emotion-sad-line text-3xl block mb-2 opacity-50" />
                      {onlyAllFree
                        ? "Nessun nome con tutti i TLD liberi."
                        : "Nessun dominio libero trovato con i filtri attuali."}
                    </div>
                  );
                }
                return (
                  <div className="grid gap-3">
                    {visibleGroups.map((g) => (
                      <NameResultGroup
                        key={g.name}
                        name={g.name}
                        results={g.results}
                        expected={expectedMap[g.name] ?? g.expected}
                        busy={
                          viewTab === "results"
                            ? checking &&
                              g.results.length < (expectedMap[g.name] ?? g.expected)
                            : false
                        }
                        onlyFree={onlyFree}
                        allFree={allFreeSet.has(g.name)}
                        highlighted={selectedName === g.name}
                        pinned={pinnedSet.has(g.name)}
                        onTogglePin={() =>
                          viewTab === "pinned" ? removePin(g.name) : togglePin(g)
                        }
                        onSelect={() =>
                          setSelectedName((cur) => (cur === g.name ? null : g.name))
                        }
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* RIGHT: names list */}
          <aside className="lg:sticky lg:top-20 self-start rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <i className="ri-list-ordered text-primary" />
                {mode === "generate" ? "Alternative generate" : "Nomi in sessione"}
              </h2>
              {mode === "generate" && suggestions.length > 0 && (
                <button
                  onClick={onCheckSuggestions}
                  disabled={checking}
                  className="h-8 px-3 rounded bg-success text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-1 shrink-0"
                >
                  {checking ? (
                    <>
                      <i className="ri-loader-4-line animate-spin" /> Verifica…
                    </>
                  ) : (
                    <>
                      <i className="ri-check-double-line" /> Controlla tutti
                    </>
                  )}
                </button>
              )}
            </div>

            {mode === "generate" ? (
              <>
                {suggestions.length === 0 ? (
                  <p className="text-sm text-ink-muted py-6 text-center">
                    Genera alternative per popolare questa lista.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {suggestions.map((s, i) => {
                      const hasResult = results.some((g) => g.name === s.trim().toLowerCase());
                      const isSelected = selectedName === s.trim().toLowerCase();
                      return (
                        <li key={i} className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const n = s.trim().toLowerCase();
                              setSelectedName((cur) => (cur === n ? null : n));
                            }}
                            disabled={!hasResult}
                            className={`flex-1 h-9 px-3 rounded border text-sm font-mono text-left truncate flex items-center gap-1.5 transition-colors ${
                              isSelected
                                ? "border-primary ring-2 ring-primary/40 bg-primary/[0.05]"
                                : hasResult
                                ? "border-border dark:border-darkborder bg-background dark:bg-darkbg hover:border-primary/60"
                                : "border-border dark:border-darkborder bg-background dark:bg-darkbg opacity-60"
                            }`}
                            title={hasResult ? "Evidenzia il risultato" : "Non ancora verificato"}
                          >
                            {hasResult && (
                              <i className="ri-arrow-right-line text-primary text-xs shrink-0" />
                            )}
                            <span className="truncate">{s || "(vuoto)"}</span>
                          </button>
                          <input
                            value={s}
                            onChange={(e) => updateSuggestion(i, e.target.value)}
                            className="sr-only"
                            aria-label={`Modifica nome ${i + 1}`}
                          />
                          <button
                            onClick={() => removeSuggestion(i)}
                            aria-label="Rimuovi"
                            className="w-9 h-9 grid place-items-center rounded border border-border dark:border-darkborder text-danger hover:bg-danger/10 shrink-0"
                          >
                            <i className="ri-delete-bin-line" />
                          </button>
                        </li>
                      );
                    })}
                    <li>
                      <button
                        onClick={addSuggestion}
                        className="w-full h-9 rounded border border-dashed border-border dark:border-darkborder text-sm text-ink-muted hover:border-primary hover:text-primary flex items-center justify-center gap-1"
                      >
                        <i className="ri-add-line" /> Aggiungi riga
                      </button>
                    </li>
                  </ul>
                )}
                {history.flat().length > 0 && (
                  <div className="mt-4 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowHistory(!showHistory)}
                      className="w-full flex items-center justify-between gap-2 px-3 h-10 text-sm font-medium hover:bg-surface dark:hover:bg-darksurface"
                      aria-expanded={showHistory}
                    >
                      <span className="flex items-center gap-1.5 text-ink-muted">
                        <i className="ri-history-line" />
                        Round precedenti ({history.flat().length} nomi)
                      </span>
                      <i
                        className={`ri-arrow-down-s-line text-lg transition-transform ${
                          showHistory ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {showHistory && (
                      <div className="px-3 pb-3 pt-1 flex flex-wrap gap-1.5 animate-fadeIn">
                        {history.flat().map((n, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-sm text-xs font-mono bg-surface dark:bg-darksurface border border-border dark:border-darkborder text-ink-muted"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : rightNames.length === 0 ? (
              <p className="text-sm text-ink-muted py-6 text-center">
                I nomi verificati appariranno qui. Clicca un nome per evidenziarne il risultato.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {rightNames.map((n) => {
                  const isSelected = selectedName === n;
                  const isPinned = pinnedSet.has(n);
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedName((cur) => (cur === n ? null : n))
                        }
                        className={`w-full flex items-center justify-between gap-2 px-3 h-9 rounded border text-sm transition-colors ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/40 bg-primary/[0.05]"
                            : "border-border dark:border-darkborder bg-background dark:bg-darkbg hover:border-primary/60"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <i className="ri-arrow-right-line text-primary text-xs shrink-0" />
                          <span className="font-mono truncate">{n}</span>
                          {isPinned && (
                            <i className="ri-pushpin-fill text-accent shrink-0" title="Pinnato" />
                          )}
                          {allFreeSet.has(n) && (
                            <i
                              className="ri-trophy-line text-success shrink-0"
                              title="Tutti i TLD liberi"
                            />
                          )}
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            void checkNames([n], null);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              void checkNames([n], null);
                            }
                          }}
                          className="text-xs text-primary hover:underline shrink-0"
                        >
                          ricontrolla
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-xs text-ink-muted">
              Clicca un nome per evidenziare la sua card nei risultati.
            </p>
          </aside>
        </section>
      </main>

      <footer className="border-t border-border dark:border-darkborder mt-10">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-5 text-xs text-ink-muted flex flex-wrap items-center justify-between gap-2">
          <span>Verifica via RDAP + DNS-over-HTTPS · AI multi-provider</span>
          <span>Uso locale · configurazione e sessioni salvate nel browser</span>
        </div>
      </footer>
    </div>
  );
}
