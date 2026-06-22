"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_TLDS, normalizeTld } from "./tlds";

/** Shape persisted in localStorage under LS_KEY. */
export interface TldConfigSnapshot {
  active: string[];
  exclusions: string[];
  used: string[];
}

export const TLDS_LS_KEY = "fdf-config-v1";

export interface UseTldConfigOptions {
  /** Inject a storage implementation (defaults to window.localStorage). */
  storage?: Storage;
  /** Inject the default active/used sets (defaults to DEFAULT_TLDS). */
  defaults?: string[];
}

export interface TldConfig {
  active: string[];
  exclusions: string[];
  used: string[];
  effectiveTlds: string[];
  toggleActive: (tld: string) => void;
  addActive: (raw: string) => boolean;
  removeActive: (tld: string) => void;
  addExclusion: (raw: string) => boolean;
  removeExclusion: (tld: string) => void;
  hydrate: (snap: Partial<TldConfigSnapshot>) => void;
  reset: () => void;
}

/** Parse a stored JSON config defensively; returns null when malformed. */
export function parseTldConfigSnapshot(raw: string | null): TldConfigSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed.active) ||
      !Array.isArray(parsed.exclusions) ||
      !Array.isArray(parsed.used)
    )
      return null;
    return parsed as TldConfigSnapshot;
  } catch {
    return null;
  }
}

/** The TLD configuration module: owns active/exclusions/used state, the
 * persistence effect, and the normalization rules behind one interface. */
export function useTldConfig(
  options: UseTldConfigOptions = {}
): TldConfig {
  const storage = options.storage;
  const defaults = options.defaults ?? [...DEFAULT_TLDS];

  const [active, setActive] = useState<string[]>([...defaults]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [used, setUsed] = useState<string[]>([...defaults]);

  // Hydrate from storage on mount.
  useEffect(() => {
    if (!storage) return;
    const snap = parseTldConfigSnapshot(storage.getItem(TLDS_LS_KEY));
    if (snap) {
      setActive(snap.active);
      setExclusions(snap.exclusions);
      setUsed(snap.used);
    }
  }, [storage]);

  // Persist on change.
  useEffect(() => {
    storage?.setItem(
      TLDS_LS_KEY,
      JSON.stringify({ active, exclusions, used })
    );
  }, [active, exclusions, used, storage]);

  const toggleActive = useCallback((tld: string) => {
    const t = normalizeTld(tld);
    if (!t) return;
    setActive((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
    setUsed((cur) => (cur.includes(t) ? cur : [...cur, t]));
  }, []);

  /** Returns true when a new TLD was actually added. */
  const addActive = useCallback((raw: string): boolean => {
    const t = normalizeTld(raw);
    if (!t) return false;
    let added = false;
    setActive((cur) => {
      if (cur.includes(t)) return cur;
      added = true;
      return [...cur, t];
    });
    setUsed((cur) => (cur.includes(t) ? cur : [...cur, t]));
    return added;
  }, []);

  const removeActive = useCallback((tld: string) => {
    setActive((cur) => cur.filter((x) => x !== tld));
  }, []);

  /** Returns true when a new exclusion was actually added. */
  const addExclusion = useCallback((raw: string): boolean => {
    const t = normalizeTld(raw);
    if (!t) return false;
    let added = false;
    setExclusions((cur) => {
      if (cur.includes(t)) return cur;
      added = true;
      return [...cur, t];
    });
    return added;
  }, []);

  const removeExclusion = useCallback((tld: string) => {
    setExclusions((cur) => cur.filter((x) => x !== tld));
  }, []);

  const effectiveTlds = useMemo(
    () => active.filter((t) => !exclusions.includes(t)),
    [active, exclusions]
  );

  const hydrate = useCallback((snap: Partial<TldConfigSnapshot>) => {
    if (snap.active) setActive(snap.active);
    if (snap.exclusions) setExclusions(snap.exclusions);
    if (snap.used) setUsed(snap.used);
  }, []);

  const reset = useCallback(() => {
    setActive([...defaults]);
    setExclusions([]);
    setUsed([...defaults]);
  }, [defaults]);

  return {
    active,
    exclusions,
    used,
    effectiveTlds,
    toggleActive,
    addActive,
    removeActive,
    addExclusion,
    removeExclusion,
    hydrate,
    reset,
  };
}
