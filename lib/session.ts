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
