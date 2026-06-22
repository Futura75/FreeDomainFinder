import { CheckResult } from "./check";

export const SESSION_APP = "FreeDomainFinder";
export const SESSION_VERSION = 1;

export interface SavedConfig {
  active: string[];
  exclusions: string[];
  used: string[];
}

export interface SavedResultGroup {
  name: string;
  results: CheckResult[];
  expected: number;
}

export interface SessionFile {
  app: string;
  version: number;
  savedAt: string;
  config: SavedConfig;
  mode: "check" | "generate";
  inputMode: "single" | "bulk";
  checkInput: string;
  bulkInput: string;
  prompt: string;
  count: number;
  suggestions: string[];
  history: string[][];
  pinned: SavedResultGroup[];
  results: SavedResultGroup[];
  expectedMap: Record<string, number>;
  sortKey: string;
  onlyFree: boolean;
  onlyAllFree: boolean;
}

export function isSessionFile(data: unknown): data is SessionFile {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.app === SESSION_APP &&
    typeof d.version === "number" &&
    Array.isArray((d as { results?: unknown }).results) &&
    (!d.config || typeof d.config === "object")
  );
}

/** A domain module that owns a slice of the app state and knows how to
 * serialize/hydrate its own slice. The session module gathers/scatters over
 * a list of these, so a new field touches one module, not three files. */
export interface SessionSlice {
  key: string;
  serialize: () => Record<string, unknown>;
  hydrate: (slice: Record<string, unknown>) => void;
}

/** Gather a full SessionFile from a set of slices + the TLD config slice. */
export function gatherSession(
  configSlice: SavedConfig,
  slices: SessionSlice[]
): SessionFile {
  const file: SessionFile = {
    app: SESSION_APP,
    version: SESSION_VERSION,
    savedAt: new Date().toISOString(),
    config: configSlice,
    mode: "check",
    inputMode: "single",
    checkInput: "",
    bulkInput: "",
    prompt: "",
    count: 8,
    suggestions: [],
    history: [],
    pinned: [],
    results: [],
    expectedMap: {},
    sortKey: "free-desc",
    onlyFree: false,
    onlyAllFree: false,
  };
  for (const slice of slices) {
    Object.assign(file, slice.serialize());
  }
  return file;
}

/** Scatter a loaded SessionFile back into the slices that can hydrate
 * themselves. Defensive: missing/unknown keys are ignored. */
export function scatterSession(
  file: SessionFile,
  slices: SessionSlice[]
): void {
  const raw = file as unknown as Record<string, unknown>;
  for (const slice of slices) {
    const sliceData: Record<string, unknown> = {};
    // Each slice's serialize() keys tell us which keys to read back.
    for (const key of Object.keys(slice.serialize())) {
      if (key in raw) sliceData[key] = raw[key];
    }
    slice.hydrate(sliceData);
  }
}

/** Merge a loaded config slice defensively. */
export function mergeConfig(
  raw: Partial<SavedConfig> | undefined
): SavedConfig {
  return {
    active: Array.isArray(raw?.active) ? raw!.active : [],
    exclusions: Array.isArray(raw?.exclusions) ? raw!.exclusions : [],
    used: Array.isArray(raw?.used) ? raw!.used : [],
  };
}

export function downloadSession(file: SessionFile) {
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `fdf-session-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readSessionFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
