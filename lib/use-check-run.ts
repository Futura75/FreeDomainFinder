"use client";

import { useCallback, useState } from "react";
import { CheckResult, checkDomain as defaultCheckDomain, pool as defaultPool } from "./check";
import { isValidSld, sanitizeSld } from "./tlds";

export interface CheckTask {
  name: string;
  tld: string;
}

export interface ResultGroup {
  name: string;
  results: CheckResult[];
  expected: number;
}

export type SortKey = "alpha-asc" | "alpha-desc" | "free-desc" | "free-asc";

export interface CheckRunSnapshot {
  results: ResultGroup[];
  expectedMap: Record<string, number>;
}

export interface UseCheckRunOptions {
  /** Build the list of (name, tld) tasks for a single name, given the
   * active+excluded TLD set. Kept injectable so the module stays decoupled
   * from the TLD config module. */
  buildTasksForName: (name: string, tld: string | null) => CheckTask[];
  /** Inject the domain checker / concurrency pool (for tests). */
  checkDomain?: typeof defaultCheckDomain;
  pool?: typeof defaultPool;
  /** Inject notifications (for tests). */
  onComplete?: (checked: number, names: number) => void;
  onWarn?: (message: string) => void;
  onError?: (message: string) => void;
}

export interface CheckRun {
  results: ResultGroup[];
  expectedMap: Record<string, number>;
  checking: boolean;
  progress: { done: number; total: number } | null;
  runTasks: (tasks: CheckTask[]) => Promise<void>;
  /** Intake for pre-parsed entries (single/bulk input carrying a per-entry
   * tld). Sanitizes, validates, dedupes, builds tasks, and runs them.
   * Returns the raw names dropped as invalid so the caller can surface them. */
  checkEntries: (entries: { name: string; tld: string | null }[]) => Promise<{ invalid: string[] }>;
  /** Intake for a list of raw names sharing one tld (or all effective TLDs
   * when tld is null): suggestions, generated names, single-name rechecks. */
  checkNames: (rawNames: string[], tld?: string | null) => Promise<{ invalid: string[] }>;
  recheck: (source: "results" | "pinned", pinned: ResultGroup[]) => Promise<{ invalid: string[] }>;
  setResults: React.Dispatch<React.SetStateAction<ResultGroup[]>>;
  setExpectedMap: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  clear: () => void;
  hydrate: (snap: Partial<CheckRunSnapshot>) => void;
}

/** Count free TLDs in a result group. */
export function freeCount(g: ResultGroup): number {
  return g.results.filter((r) => r.status === "free").length;
}

/** True when the group is complete and every checked TLD is free. */
export function isAllFree(g: ResultGroup, expected: number): boolean {
  return g.results.length >= expected && g.results.every((r) => r.status === "free");
}

/** Sort + filter result groups by the active sort key and filters. */
export function sortAndFilter(
  source: ResultGroup[],
  sortKey: SortKey,
  onlyFree: boolean,
  onlyAllFree: boolean,
  expectedMap: Record<string, number>
): ResultGroup[] {
  const arr = [...source];
  switch (sortKey) {
    case "alpha-asc":
      arr.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "alpha-desc":
      arr.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "free-desc":
      arr.sort((a, b) => freeCount(b) - freeCount(a) || a.name.localeCompare(b.name));
      break;
    case "free-asc":
      arr.sort((a, b) => freeCount(a) - freeCount(b) || a.name.localeCompare(b.name));
      break;
  }
  if (onlyAllFree) {
    return arr.filter((g) => isAllFree(g, expectedMap[g.name] ?? g.expected));
  }
  if (onlyFree) {
    return arr.filter((g) => freeCount(g) > 0);
  }
  return arr;
}

/** Parse a bulk text area into per-line { name, tld|null } using a parser
 * injected (parseInput from lib/tlds). Returns parsed entries plus the
 * list of invalid raw lines. */
export function parseBulk(
  text: string,
  parse: (raw: string) => { name: string; tld: string | null }
): { parsed: { name: string; tld: string | null }[]; invalid: string[] } {
  const lines = text
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed: { name: string; tld: string | null }[] = [];
  const invalid: string[] = [];
  for (const line of lines) {
    const { name } = parse(line);
    if (!name) {
      invalid.push(line);
    } else {
      parsed.push(parse(line));
    }
  }
  return { parsed, invalid };
}

/** The check-run module: owns results/expected/progress/checking and the
 * bounded-concurrency execution. buildTasksForName is injected so this
 * module knows nothing about TLD config. */
export function useCheckRun(options: UseCheckRunOptions): CheckRun {
  const {
    buildTasksForName,
    checkDomain = defaultCheckDomain,
    pool = defaultPool,
    onComplete,
    onWarn,
    onError,
  } = options;

  const [results, setResults] = useState<ResultGroup[]>([]);
  const [expectedMap, setExpectedMap] = useState<Record<string, number>>({});
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const runTasks = useCallback(
    async (tasks: CheckTask[]) => {
      if (tasks.length === 0) {
        onWarn?.("Nessun dominio da verificare con i TLD attuali.");
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
        onComplete?.(tasks.length, names.length);
      } catch (e) {
        onError?.(`Errore durante la verifica: ${(e as Error).message}`);
      } finally {
        setChecking(false);
        setProgress(null);
      }
    },
    [checkDomain, pool, onComplete, onWarn, onError]
  );

  const checkEntries = useCallback(
    async (entries: { name: string; tld: string | null }[]) => {
      const { tasks, invalid } = prepareTasks(entries, buildTasksForName);
      await runTasks(tasks);
      return { invalid };
    },
    [buildTasksForName, runTasks]
  );

  const checkNames = useCallback(
    (rawNames: string[], tld: string | null = null) =>
      checkEntries(rawNames.map((name) => ({ name, tld }))),
    [checkEntries]
  );

  const recheck = useCallback(
    async (source: "results" | "pinned", pinned: ResultGroup[]) => {
      const base = source === "pinned" ? pinned : results;
      const names = base.map((g) => g.name);
      if (names.length === 0) return { invalid: [] };
      return checkNames(names, null);
    },
    [results, checkNames]
  );

  const clear = useCallback(() => {
    setResults([]);
    setExpectedMap({});
  }, []);

  const hydrate = useCallback((snap: Partial<CheckRunSnapshot>) => {
    if (snap.results) setResults(snap.results);
    if (snap.expectedMap) setExpectedMap(snap.expectedMap);
  }, []);

  // Expose setResults/setExpectedMap for external sync (e.g. clearing on
  // new search, or merging loaded sessions).
  return {
    results,
    expectedMap,
    checking,
    progress,
    runTasks,
    checkEntries,
    checkNames,
    recheck,
    setResults,
    setExpectedMap,
    clear,
    hydrate,
  };
}

/** THE name-intake invariant. Sanitize + validate each raw entry's name
 * (reusing lib/tlds, never re-deriving it), expand into (name, tld) tasks via
 * the injected builder, and dedupe tasks by domain. Returns the tasks plus the
 * raw names dropped as invalid. Every check path funnels through here, so the
 * sanitization rule lives in exactly one place and can't drift per-caller. */
export function prepareTasks(
  entries: { name: string; tld: string | null }[],
  buildTasksForName: (name: string, tld: string | null) => CheckTask[]
): { tasks: CheckTask[]; invalid: string[] } {
  const seen = new Set<string>();
  const tasks: CheckTask[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    const name = sanitizeSld(entry.name);
    if (!name || !isValidSld(name)) {
      invalid.push(entry.name);
      continue;
    }
    for (const task of buildTasksForName(name, entry.tld)) {
      const key = `${task.name}.${task.tld}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tasks.push(task);
    }
  }
  return { tasks, invalid };
}

/** Build the (name, tld) tasks for a name given the effective TLD list and
 * the exclusion set. Standalone (not a hook) so it can be unit-tested and
 * reused without React. */
export function buildTasks(
  name: string,
  tld: string | null,
  effectiveTlds: string[],
  exclusions: string[]
): CheckTask[] {
  if (tld) {
    if (exclusions.includes(tld)) return [];
    return [{ name, tld }];
  }
  return effectiveTlds.map((t) => ({ name, tld: t }));
}
