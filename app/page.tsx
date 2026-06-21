"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_TLDS,
  SUGGESTED_TLDS,
  isValidSld,
  normalizeTld,
  parseInput,
} from "@/lib/tlds";
import {
  CheckResult,
  DomainStatus,
  checkDomain,
  pool,
} from "@/lib/check";
import { setNotifyTheme, toast, popup, confirm } from "@/lib/notify";
import {
  SessionFile,
  SavedResultGroup,
  downloadSession,
  isSessionFile,
  readSessionFile,
} from "@/lib/session";

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
  results: CheckResult[];
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

type Mode = "check" | "generate";
type InputMode = "single" | "bulk";
type SortKey = "alpha-asc" | "alpha-desc" | "free-desc" | "free-asc";

interface PersistedConfig {
  active: string[];
  exclusions: string[];
  used: string[];
}

const LS_KEY = "fdf-config-v1";

function loadConfig(): PersistedConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed.active) ||
      !Array.isArray(parsed.exclusions) ||
      !Array.isArray(parsed.used)
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

interface CheckTask {
  name: string;
  tld: string;
}

interface ResultGroup {
  name: string;
  results: CheckResult[];
  expected: number;
}

export default function Page() {
  /* ---------- theme ---------- */
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("fdf-theme");
    if (saved === "dark") setDark(true);
    else if (saved === "light") setDark(false);
    else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    )
      setDark(true);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("fdf-theme", dark ? "dark" : "light");
    setNotifyTheme(dark);
  }, [dark]);

  /* ---------- TLD config ---------- */
  const [active, setActive] = useState<string[]>([...DEFAULT_TLDS]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [used, setUsed] = useState<string[]>([...DEFAULT_TLDS]);
  const [newTld, setNewTld] = useState("");
  const [newExcl, setNewExcl] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    const c = loadConfig();
    if (c) {
      setActive(c.active);
      setExclusions(c.exclusions);
      setUsed(c.used);
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ active, exclusions, used }));
  }, [active, exclusions, used]);

  const toggleActive = (tld: string) => {
    const t = normalizeTld(tld);
    if (!t) return;
    setActive((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
    );
    setUsed((cur) => (cur.includes(t) ? cur : [...cur, t]));
  };
  const addActive = (raw: string) => {
    const t = normalizeTld(raw);
    if (!t || active.includes(t)) {
      setNewTld("");
      return;
    }
    setActive((cur) => [...cur, t]);
    setUsed((cur) => (cur.includes(t) ? cur : [...cur, t]));
    setNewTld("");
  };
  const removeActive = (tld: string) =>
    setActive((cur) => cur.filter((x) => x !== tld));

  const addExclusion = (raw: string) => {
    const t = normalizeTld(raw);
    if (!t || exclusions.includes(t)) {
      setNewExcl("");
      return;
    }
    setExclusions((cur) => [...cur, t]);
    setNewExcl("");
  };
  const removeExclusion = (tld: string) =>
    setExclusions((cur) => cur.filter((x) => x !== tld));

  const effectiveTlds = useMemo(
    () => active.filter((t) => !exclusions.includes(t)),
    [active, exclusions]
  );

  /* ---------- mode / input ---------- */
  const [mode, setMode] = useState<Mode>("check");
  const [inputMode, setInputMode] = useState<InputMode>("single");

  /* ---------- direct check ---------- */
  const [checkInput, setCheckInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [results, setResults] = useState<ResultGroup[]>([]);
  const [expectedMap, setExpectedMap] = useState<Record<string, number>>({});
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );

  /* ---------- AI generate ---------- */
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Persist requested alternatives count across sessions.
  useEffect(() => {
    const saved = localStorage.getItem("fdf-count");
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= 1 && n <= 20) setCount(n);
    }
  }, []);
  const onCountChange = useCallback((n: number) => {
    const clamped = Math.max(1, Math.min(20, n));
    setCount(clamped);
    try {
      localStorage.setItem("fdf-count", String(clamped));
    } catch {
      /* ignore */
    }
  }, []);
  // Names generated in previous rounds (most-recent-last). Used to avoid repeats.
  const [history, setHistory] = useState<string[][]>([]);
  const [showHistory, setShowHistory] = useState(false);

  /* ---------- view controls ---------- */
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("free-desc");
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyAllFree, setOnlyAllFree] = useState(false);
  const [pinned, setPinned] = useState<ResultGroup[]>([]);
  const [viewTab, setViewTab] = useState<"results" | "pinned">("results");

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- pinned persistence ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("fdf-pinned");
      if (raw) setPinned(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("fdf-pinned", JSON.stringify(pinned));
    } catch {
      /* ignore */
    }
  }, [pinned]);

  const togglePin = useCallback((group: ResultGroup) => {
    setPinned((cur) => {
      const exists = cur.some((p) => p.name === group.name);
      if (exists) return cur.filter((p) => p.name !== group.name);
      // Merge results if already present (keep freshest non-empty).
      return [
        ...cur.filter((p) => p.name !== group.name),
        { ...group, results: group.results.length > 0 ? group.results : [] },
      ];
    });
  }, []);

  const removePin = useCallback((name: string) => {
    setPinned((cur) => cur.filter((p) => p.name !== name));
  }, []);

  const pinnedSet = useMemo(() => new Set(pinned.map((p) => p.name)), [pinned]);

  /* ---------- highlight + scroll into view ---------- */
  useEffect(() => {
    if (!selectedName) return;
    const el = document.querySelector(
      `[data-result-name="${CSS.escape(selectedName)}"]`
    );
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedName, results]);

  /* ---------- check runner ---------- */
  const runTasks = useCallback(async (tasks: CheckTask[]) => {
    if (tasks.length === 0) {
      toast("warning", "Nessun dominio da verificare con i TLD attuali.");
      return;
    }
    const expected: Record<string, number> = {};
    const names: string[] = [];
    for (const t of tasks) {
      if (!expected[t.name]) {
        expected[t.name] = 0;
        names.push(t.name);
      }
      expected[t.name] += 1;
    }
    setExpectedMap(expected);
    setResults(names.map((name) => ({ name, results: [], expected: expected[name] })));
    setChecking(true);
    setProgress({ done: 0, total: tasks.length });

    let done = 0;
    try {
      await pool(tasks, 6, ({ name, tld }) => checkDomain(name, tld), (r) => {
        done += 1;
        setProgress({ done, total: tasks.length });
        setResults((cur) =>
          cur.map((g) =>
            g.name === r.name ? { ...g, results: [...g.results, r] } : g
          )
        );
      });
      popup(
        "success",
        "Verifica completata",
        `Controllati ${tasks.length} domini su ${names.length} nomi.`
      );
    } catch (e) {
      toast("error", `Errore durante la verifica: ${(e as Error).message}`);
    } finally {
      setChecking(false);
      setProgress(null);
    }
  }, []);

  const buildTasksForName = (name: string, tld: string | null): CheckTask[] => {
    if (tld) {
      if (exclusions.includes(tld)) return [];
      return [{ name, tld }];
    }
    return effectiveTlds.map((t) => ({ name, tld: t }));
  };

  const onCheckDirect = () => {
    if (inputMode === "single") {
      if (!checkInput.trim()) {
        toast("warning", "Inserisci un nome a dominio.");
        return;
      }
      const { name, tld } = parseInput(checkInput);
      if (!name || !isValidSld(name)) {
        toast("warning", "Nome non valido.");
        return;
      }
      const tasks = buildTasksForName(name, tld);
      if (tasks.length === 0) {
        toast("warning", "Il TLD richiesto è nelle esclusioni.");
        return;
      }
      runTasks(tasks);
    } else {
      const lines = bulkInput
        .split(/[\n,]+/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        toast("warning", "Inserisci almeno un dominio nella lista.");
        return;
      }
      const tasks: CheckTask[] = [];
      const invalid: string[] = [];
      for (const line of lines) {
        const { name, tld } = parseInput(line);
        if (!name || !isValidSld(name)) {
          invalid.push(line);
          continue;
        }
        tasks.push(...buildTasksForName(name, tld));
      }
      if (invalid.length > 0) {
        toast(
          "warning",
          `${invalid.length} righe ignorate come non valide: ${invalid
            .slice(0, 3)
            .join(", ")}${invalid.length > 3 ? "…" : ""}`
        );
      }
      if (tasks.length === 0) {
        toast("warning", "Nessun dominio valido da verificare.");
        return;
      }
      runTasks(tasks);
    }
  };

  const onGenerate = async () => {
    if (!prompt.trim()) {
      toast("warning", "Scrivi un breve prompt per l'AI.");
      return;
    }
    const avoid = Array.from(
      new Set(
        [...history.flat(), ...suggestions].map((n) => n.trim().toLowerCase())
      )
    ).filter(Boolean);

    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count, exclusions, avoid }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error || "Errore generazione AI.");
        return;
      }
      setHistory((cur) =>
        suggestions.length > 0 ? [...cur, suggestions] : cur
      );
      setSuggestions(data.names);
      setResults([]);
      setExpectedMap({});
      setSelectedName(null);
      setViewTab("results");
      toast(
        "success",
        `Generate ${data.names.length} alternative: verifica automatica avviata.`
      );
      // Auto-check the freshly generated names.
      onCheckSuggestions(data.names);
    } catch (e) {
      toast("error", `Errore di rete: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  const onCheckSuggestions = (names?: string[]) => {
    const source = names ?? suggestions;
    if (source.length === 0) {
      toast("warning", "Genera prima delle alternative.");
      return;
    }
    const cleaned = source
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, ""))
      .filter((s) => isValidSld(s));
    const unique = Array.from(new Set(cleaned));
    if (unique.length === 0) {
      toast("warning", "Nessun nome valido nella lista.");
      return;
    }
    const tasks: CheckTask[] = [];
    for (const name of unique) tasks.push(...buildTasksForName(name, null));
    runTasks(tasks);
  };

  const updateSuggestion = (i: number, value: string) => {
    setSuggestions((cur) => cur.map((s, idx) => (idx === i ? value : s)));
  };
  const removeSuggestion = (i: number) => {
    setSuggestions((cur) => cur.filter((_, idx) => idx !== i));
  };
  const addSuggestion = () => {
    setSuggestions((cur) => [...cur, ""]);
  };

  /* ---------- sorted / filtered results ---------- */
  const visibleGroups = useMemo(() => {
    const freeCount = (g: ResultGroup) =>
      g.results.filter((r) => r.status === "free").length;
    const arr = [...results];
    switch (sortKey) {
      case "alpha-asc":
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "alpha-desc":
        arr.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "free-desc":
        arr.sort(
          (a, b) => freeCount(b) - freeCount(a) || a.name.localeCompare(b.name)
        );
        break;
      case "free-asc":
        arr.sort(
          (a, b) => freeCount(a) - freeCount(b) || a.name.localeCompare(b.name)
        );
        break;
    }
    if (onlyAllFree) {
      return arr.filter(
        (g) =>
          g.results.length >= (expectedMap[g.name] ?? g.expected) &&
          freeCount(g) === (expectedMap[g.name] ?? g.expected)
      );
    }
    if (onlyFree) {
      return arr.filter((g) => freeCount(g) > 0);
    }
    return arr;
  }, [results, sortKey, onlyFree, onlyAllFree, expectedMap]);

  /* ---------- all-free map (for right-panel hints) ---------- */
  const allFreeSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of results) {
      const exp = expectedMap[g.name] ?? g.expected;
      if (g.results.length >= exp && g.results.every((r) => r.status === "free"))
        s.add(g.name);
    }
    return s;
  }, [results, expectedMap]);

  const totalFree = useMemo(
    () =>
      results.reduce(
        (acc, g) => acc + g.results.filter((r) => r.status === "free").length,
        0
      ),
    [results]
  );

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  /* ---------- names list (right panel) ---------- */
  const rightNames = useMemo(
    () => (mode === "generate" ? suggestions : results.map((g) => g.name)),
    [mode, suggestions, results]
  );

  /* ---------- session save / load ---------- */
  const buildSession = useCallback(
    (): SessionFile => ({
      app: "FreeDomainFinder",
      version: 1,
      savedAt: new Date().toISOString(),
      config: { active, exclusions, used },
      mode,
      inputMode,
      checkInput,
      bulkInput,
      prompt,
      count,
      suggestions,
      history,
      pinned: pinned as SavedResultGroup[],
      results: results as SavedResultGroup[],
      expectedMap,
      sortKey,
      onlyFree,
      onlyAllFree,
    }),
    [
      active,
      exclusions,
      used,
      mode,
      inputMode,
      checkInput,
      bulkInput,
      prompt,
      count,
      suggestions,
      results,
      history,
      pinned,
      expectedMap,
      sortKey,
      onlyFree,
      onlyAllFree,
    ]
  );

  const onSaveSession = () => {
    if (
      results.length === 0 &&
      !checkInput &&
      !bulkInput &&
      suggestions.length === 0
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
      if (raw.config) {
        setActive(raw.config.active);
        setExclusions(raw.config.exclusions);
        setUsed(raw.config.used);
      }
      setMode(raw.mode);
      setInputMode(raw.inputMode);
      setCheckInput(raw.checkInput);
      setBulkInput(raw.bulkInput);
      setPrompt(raw.prompt);
      setCount(raw.count);
      setPinned(Array.isArray(raw.pinned) ? (raw.pinned as ResultGroup[]) : []);
      setSuggestions(raw.suggestions);
      setHistory(Array.isArray(raw.history) ? raw.history : []);
      setResults(raw.results as ResultGroup[]);
      setExpectedMap(raw.expectedMap);
      setSortKey(raw.sortKey as SortKey);
      setOnlyFree(raw.onlyFree);
      setOnlyAllFree(Boolean(raw.onlyAllFree));
      setSelectedName(null);
      toast("success", "Sessione caricata.");
    } catch (err) {
      toast("error", `Impossibile leggere il file: ${(err as Error).message}`);
    }
  };

  const onRecheckAll = () => {
    const names = results.map((g) => g.name);
    if (names.length === 0) return;
    const tasks: CheckTask[] = [];
    for (const name of names) tasks.push(...buildTasksForName(name, null));
    runTasks(tasks);
  };

  // Clear results but keep typed text (prompt / inputs) and AI history.
  const onNewSearch = () => {
    setResults([]);
    setExpectedMap({});
    setSelectedName(null);
    setOnlyFree(false);
    setOnlyAllFree(false);
    setSuggestions([]);
    setHistory([]);
    setShowHistory(false);
    setPinned([]);
    setViewTab("results");
  };

  // Full reset: prompt, inputs, results, suggestions and AI history.
  const onResetSession = () => {
    setCheckInput("");
    setBulkInput("");
    setPrompt("");
    setSuggestions([]);
    setHistory([]);
    setShowHistory(false);
    setResults([]);
    setExpectedMap({});
    setSelectedName(null);
    setOnlyFree(false);
    setOnlyAllFree(false);
    setPinned([]);
    setViewTab("results");
    toast("info", "Sessione azzerata.");
  };

  /* ------------------------------- render -------------------------------- */
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border dark:border-darkborder bg-surface/80 dark:bg-darksurface/80 backdrop-blur sticky top-0 z-30">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded bg-primary text-white grid place-items-center shrink-0">
              <i className="ri-global-line text-xl" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight truncate">
                FreeDomainFinder
              </h1>
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
              onClick={() => setDark((d) => !d)}
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
                  onKeyDown={(e) => e.key === "Enter" && addActive(newTld)}
                  placeholder="aggiungi es. tech"
                  className="flex-1 h-9 px-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-sm font-mono"
                />
                <button
                  onClick={() => addActive(newTld)}
                  className="h-9 px-3 rounded bg-primary text-white text-sm hover:bg-primary-dark"
                >
                  <i className="ri-add-line" /> Aggiungi
                </button>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">
                Suggerite
              </p>
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
                  onKeyDown={(e) => e.key === "Enter" && addExclusion(newExcl)}
                  placeholder="escludi es. xyz"
                  className="flex-1 h-9 px-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-sm font-mono"
                />
                <button
                  onClick={() => addExclusion(newExcl)}
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

        {/* Main grid: left (input + results) | right (names list) */}
        <section className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          {/* ----- LEFT: input card + results ----- */}
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
                  onClick={() => setMode("generate")}
                  className={`px-4 h-9 rounded text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    mode === "generate"
                      ? "bg-surface dark:bg-darksurface shadow-sm"
                      : "text-ink-muted"
                  }`}
                >
                  <i className="ri-magic-line" /> Genera con AI
                </button>
              </div>

              {mode === "check" ? (
                <>
                  <div className="inline-flex rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg p-0.5 mb-3 text-xs">
                    <button
                      onClick={() => setInputMode("single")}
                      className={`px-3 h-8 rounded flex items-center gap-1 ${
                        inputMode === "single"
                          ? "bg-surface dark:bg-darksurface shadow-sm font-medium"
                          : "text-ink-muted"
                      }`}
                    >
                      <i className="ri-input-method-line" /> Singolo
                    </button>
                    <button
                      onClick={() => setInputMode("bulk")}
                      className={`px-3 h-8 rounded flex items-center gap-1 ${
                        inputMode === "bulk"
                          ? "bg-surface dark:bg-darksurface shadow-sm font-medium"
                          : "text-ink-muted"
                      }`}
                    >
                      <i className="ri-list-unordered" /> Lista (uno per riga)
                    </button>
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
                    </>
                  )}
                </>
              ) : (
                <>
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
                        onChange={(e) =>
                          onCountChange(Number(e.target.value) || 1)
                        }
                        className="w-20 h-9 px-2 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-center font-mono"
                      />
                    </label>
                    <button
                      onClick={onGenerate}
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
                {viewTab === "results" && results.length > 0 && (
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
                    <button
                      onClick={onRecheckAll}
                      disabled={checking}
                      className="h-9 px-3 rounded border border-border dark:border-darkborder hover:border-primary text-sm flex items-center gap-1.5 disabled:opacity-60"
                      title="Ricontrolla tutti i nomi"
                    >
                      <i className="ri-restart-line" /> Ricontrolla
                    </button>
                  </div>
                )}
              </div>

              {viewTab === "results" &&
                (results.length === 0 ? (
                <div className="text-center py-16 text-ink-muted rounded border border-dashed border-border dark:border-darkborder">
                  <i className="ri-global-line text-5xl block mb-3 opacity-40" />
                  <p className="text-sm">
                    Inserisci un nome per verificare la disponibilità, oppure genera
                    alternative con AI.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {visibleGroups.map((g) => (
                    <NameResultGroup
                      key={g.name}
                      name={g.name}
                      results={g.results}
                      expected={expectedMap[g.name] ?? g.expected}
                      busy={checking && g.results.length < (expectedMap[g.name] ?? g.expected)}
                      onlyFree={onlyFree}
                      allFree={allFreeSet.has(g.name)}
                      highlighted={selectedName === g.name}
                      pinned={pinnedSet.has(g.name)}
                      onTogglePin={() => togglePin(g)}
                      onSelect={() =>
                        setSelectedName((cur) => (cur === g.name ? null : g.name))
                      }
                    />
                  ))}
                  {visibleGroups.length === 0 &&
                    (onlyFree || onlyAllFree) && (
                    <div className="text-center py-10 text-ink-muted text-sm">
                      <i className="ri-emotion-sad-line text-3xl block mb-2 opacity-50" />
                      {onlyAllFree
                        ? "Nessun nome con tutti i TLD liberi."
                        : "Nessun dominio libero trovato con i filtri attuali."}
                    </div>
                  )}
                </div>
              ))}

              {viewTab === "pinned" &&
                (pinned.length === 0 ? (
                  <div className="text-center py-16 text-ink-muted rounded border border-dashed border-border dark:border-darkborder">
                    <i className="ri-pushpin-line text-5xl block mb-3 opacity-40" />
                    <p className="text-sm">
                      Pinna i risultati che ti interessano per ritrovarli qui.
                      Persistono tra i reload della pagina e nelle sessioni salvate.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {pinned.map((g) => (
                      <NameResultGroup
                        key={g.name}
                        name={g.name}
                        results={g.results}
                        expected={g.expected}
                        busy={false}
                        onlyFree={onlyFree}
                        allFree={
                          g.results.length >= g.expected &&
                          g.results.every((r) => r.status === "free")
                        }
                        highlighted={selectedName === g.name}
                        pinned={pinnedSet.has(g.name)}
                        onTogglePin={() => removePin(g.name)}
                        onSelect={() =>
                          setSelectedName((cur) => (cur === g.name ? null : g.name))
                        }
                      />
                    ))}
                  </div>
                ))}
            </div>
          </div>

          {/* ----- RIGHT: names list ----- */}
          <aside className="lg:sticky lg:top-20 self-start rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <i className="ri-list-ordered text-primary" />
                {mode === "generate" ? "Alternative generate" : "Nomi in sessione"}
              </h2>
              {mode === "generate" && suggestions.length > 0 && (
                <button
                  onClick={() => onCheckSuggestions()}
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
                    onClick={() => setShowHistory((s) => !s)}
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
                            runTasks(buildTasksForName(n, null));
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              runTasks(buildTasksForName(n, null));
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
          <span>
            Verifica via RDAP + DNS-over-HTTPS · AI via Groq (Llama 3.3 70B)
          </span>
          <span>Uso locale · configurazione e sessioni salvate nel browser</span>
        </div>
      </footer>
    </div>
  );
}
