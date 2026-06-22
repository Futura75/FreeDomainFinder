"use client";

import { useCallback, useState } from "react";
import type { SortKey } from "./use-check-run";

export type Mode = "check" | "generate";
export type InputMode = "single" | "bulk";

/** The serializable view state — mode, input mode, the two input buffers, and
 * the sort/filter selections. Transient UI state (selected name, active tab)
 * deliberately lives in the page, not here. */
export interface ViewControlsSnapshot {
  mode: Mode;
  inputMode: InputMode;
  checkInput: string;
  bulkInput: string;
  sortKey: SortKey;
  onlyFree: boolean;
  onlyAllFree: boolean;
}

export interface ViewControls extends ViewControlsSnapshot {
  setMode: (m: Mode) => void;
  setInputMode: (m: InputMode) => void;
  setCheckInput: (v: string) => void;
  setBulkInput: (v: string) => void;
  setSortKey: (k: SortKey) => void;
  setOnlyFree: (v: boolean) => void;
  setOnlyAllFree: (v: boolean) => void;
  /** Read back the current serializable snapshot (for session save).
   * Typed as a plain record so it slots directly into a session slice. */
  serialize: () => Record<string, unknown>;
  /** Apply a loaded snapshot defensively (for session load). */
  hydrate: (snap: Record<string, unknown>) => void;
  /** Clear the two filters (used by "new search" / "reset"). */
  clearFilters: () => void;
  /** Clear both input buffers (used by "reset session"). */
  clearInputs: () => void;
}

/** The view-controls module: owns the serializable view state plus its own
 * serialize/hydrate, so the session slice delegates here instead of reaching
 * into a fistful of raw setters, and a new view field touches one module. */
export function useViewControls(): ViewControls {
  const [mode, setMode] = useState<Mode>("check");
  const [inputMode, setInputMode] = useState<InputMode>("single");
  const [checkInput, setCheckInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("free-desc");
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyAllFree, setOnlyAllFree] = useState(false);

  const serialize = useCallback(
    (): Record<string, unknown> => ({
      mode,
      inputMode,
      checkInput,
      bulkInput,
      sortKey,
      onlyFree,
      onlyAllFree,
    }),
    [mode, inputMode, checkInput, bulkInput, sortKey, onlyFree, onlyAllFree]
  );

  const hydrate = useCallback((s: Record<string, unknown>) => {
    if (s.mode === "check" || s.mode === "generate") setMode(s.mode);
    if (s.inputMode === "single" || s.inputMode === "bulk") setInputMode(s.inputMode);
    if (typeof s.checkInput === "string") setCheckInput(s.checkInput);
    if (typeof s.bulkInput === "string") setBulkInput(s.bulkInput);
    if (typeof s.sortKey === "string") setSortKey(s.sortKey as SortKey);
    if (typeof s.onlyFree === "boolean") setOnlyFree(s.onlyFree);
    if (typeof s.onlyAllFree === "boolean") setOnlyAllFree(s.onlyAllFree);
  }, []);

  const clearFilters = useCallback(() => {
    setOnlyFree(false);
    setOnlyAllFree(false);
  }, []);

  const clearInputs = useCallback(() => {
    setCheckInput("");
    setBulkInput("");
  }, []);

  return {
    mode,
    inputMode,
    checkInput,
    bulkInput,
    sortKey,
    onlyFree,
    onlyAllFree,
    setMode,
    setInputMode,
    setCheckInput,
    setBulkInput,
    setSortKey,
    setOnlyFree,
    setOnlyAllFree,
    serialize,
    hydrate,
    clearFilters,
    clearInputs,
  };
}
