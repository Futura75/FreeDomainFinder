import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTheme, resolveInitialDark, THEME_LS_KEY } from "./use-theme";

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

/** A controllable matchMedia: returns a MediaQueryList whose `change` listener
 * can be fired via `emit`. */
function fakeMatchMedia(initialMatches: boolean) {
  let handler: ((e: MediaQueryListEvent) => void) | null = null;
  const mql = {
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, h: EventListenerOrEventListenerObject) => {
      handler = h as (e: MediaQueryListEvent) => void;
    },
    removeEventListener: () => {
      handler = null;
    },
  } as unknown as MediaQueryList;
  return {
    matchMedia: () => mql,
    emit: (matches: boolean) => handler?.({ matches } as MediaQueryListEvent),
    get hasListener() {
      return handler !== null;
    },
  };
}

describe("resolveInitialDark", () => {
  it("an explicit saved choice wins over the system preference", () => {
    expect(resolveInitialDark("dark", false)).toBe(true);
    expect(resolveInitialDark("light", true)).toBe(false);
  });
  it("falls back to the system preference when nothing is saved", () => {
    expect(resolveInitialDark(null, true)).toBe(true);
    expect(resolveInitialDark(null, false)).toBe(false);
    expect(resolveInitialDark("garbage", true)).toBe(true);
  });
});

describe("useTheme", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memStorage();
  });

  it("follows the system preference when no choice is saved", async () => {
    const onChange = vi.fn();
    const mm = fakeMatchMedia(true);
    const { result } = renderHook(() =>
      useTheme({ storage, matchMedia: mm.matchMedia, onChange })
    );
    await waitFor(() => expect(result.current.dark).toBe(true));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("an explicit saved choice wins and no system listener is attached", async () => {
    storage.setItem(THEME_LS_KEY, "light");
    const mm = fakeMatchMedia(true);
    const { result } = renderHook(() =>
      useTheme({ storage, matchMedia: mm.matchMedia })
    );
    await waitFor(() => expect(result.current.dark).toBe(false));
    expect(mm.hasListener).toBe(false);
    act(() => mm.emit(true)); // ignored — no listener
    expect(result.current.dark).toBe(false);
  });

  it("propagates system changes while no explicit choice exists", async () => {
    const mm = fakeMatchMedia(false);
    const { result } = renderHook(() =>
      useTheme({ storage, matchMedia: mm.matchMedia })
    );
    await waitFor(() => expect(result.current.dark).toBe(false));
    act(() => mm.emit(true));
    expect(result.current.dark).toBe(true);
  });

  it("toggleTheme flips, persists, and stops following the system", async () => {
    const mm = fakeMatchMedia(false);
    const { result } = renderHook(() =>
      useTheme({ storage, matchMedia: mm.matchMedia })
    );
    await waitFor(() => expect(result.current.dark).toBe(false));
    act(() => result.current.toggleTheme());
    expect(result.current.dark).toBe(true);
    await waitFor(() => expect(storage.getItem(THEME_LS_KEY)).toBe("dark"));
    // System preference changes are now ignored.
    act(() => mm.emit(false));
    expect(result.current.dark).toBe(true);
  });

  it("works without a matchMedia (SSR-ish): defaults to light", async () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTheme({ storage, onChange }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(result.current.dark).toBe(false);
  });
});
