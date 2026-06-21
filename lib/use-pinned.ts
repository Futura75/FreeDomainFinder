"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResultGroup } from "./use-check-run";

export const PINNED_LS_KEY = "fdf-pinned";

export interface UsePinnedOptions {
  /** Inject a storage implementation (defaults to none — caller passes
   * window.localStorage). Kept injectable so the hook is testable. */
  storage?: Storage;
}

export interface Pinned {
  pinned: ResultGroup[];
  /** Name-keyed membership set, memoized for cheap "is this pinned?" checks. */
  pinnedSet: Set<string>;
  /** Pin a group if absent, unpin it if already present (keyed by name). */
  togglePin: (group: ResultGroup) => void;
  removePin: (name: string) => void;
  setPinned: React.Dispatch<React.SetStateAction<ResultGroup[]>>;
  clear: () => void;
}

/** Parse the stored pinned array defensively; returns null when malformed. */
export function parsePinnedSnapshot(raw: string | null): ResultGroup[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ResultGroup[]) : null;
  } catch {
    return null;
  }
}

/** The pinned-results module: owns the pinned list, its localStorage
 * persistence, and the name-keyed no-duplicates invariant behind one
 * interface — so no caller can pin the same name twice or bypass persistence. */
export function usePinned(options: UsePinnedOptions = {}): Pinned {
  const storage = options.storage;
  const [pinned, setPinned] = useState<ResultGroup[]>([]);

  // Hydrate from storage on mount.
  useEffect(() => {
    if (!storage) return;
    const snap = parsePinnedSnapshot(storage.getItem(PINNED_LS_KEY));
    if (snap) setPinned(snap);
  }, [storage]);

  // Persist on change.
  useEffect(() => {
    try {
      storage?.setItem(PINNED_LS_KEY, JSON.stringify(pinned));
    } catch {
      /* ignore */
    }
  }, [pinned, storage]);

  const togglePin = useCallback((group: ResultGroup) => {
    setPinned((cur) => {
      if (cur.some((p) => p.name === group.name)) {
        return cur.filter((p) => p.name !== group.name);
      }
      return [...cur.filter((p) => p.name !== group.name), { ...group }];
    });
  }, []);

  const removePin = useCallback((name: string) => {
    setPinned((cur) => cur.filter((p) => p.name !== name));
  }, []);

  const pinnedSet = useMemo(() => new Set(pinned.map((p) => p.name)), [pinned]);

  const clear = useCallback(() => setPinned([]), []);

  return { pinned, pinnedSet, togglePin, removePin, setPinned, clear };
}
