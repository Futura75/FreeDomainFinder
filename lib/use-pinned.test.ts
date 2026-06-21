import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePinned, parsePinnedSnapshot, PINNED_LS_KEY } from "./use-pinned";
import type { ResultGroup } from "./use-check-run";

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

const grp = (name: string): ResultGroup => ({ name, expected: 1, results: [] });

describe("parsePinnedSnapshot", () => {
  it("parses a valid array", () => {
    expect(parsePinnedSnapshot(JSON.stringify([grp("foo")]))).toEqual([grp("foo")]);
  });
  it("returns null for malformed json or non-arrays", () => {
    expect(parsePinnedSnapshot(null)).toBeNull();
    expect(parsePinnedSnapshot("not json")).toBeNull();
    expect(parsePinnedSnapshot(JSON.stringify({ name: "x" }))).toBeNull();
  });
});

describe("usePinned", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memStorage();
  });

  it("starts empty", () => {
    const { result } = renderHook(() => usePinned({ storage }));
    expect(result.current.pinned).toEqual([]);
    expect(result.current.pinnedSet.size).toBe(0);
  });

  it("togglePin adds when absent, removes when present (keyed by name)", () => {
    const { result } = renderHook(() => usePinned({ storage }));
    act(() => result.current.togglePin(grp("foo")));
    expect(result.current.pinned.map((p) => p.name)).toEqual(["foo"]);
    expect(result.current.pinnedSet.has("foo")).toBe(true);
    act(() => result.current.togglePin(grp("foo")));
    expect(result.current.pinned).toEqual([]);
  });

  it("never pins the same name twice", () => {
    const { result } = renderHook(() => usePinned({ storage }));
    act(() => result.current.togglePin({ ...grp("foo"), expected: 2 }));
    act(() => result.current.setPinned((cur) => [...cur])); // no-op re-render
    // Toggling a same-named group with different content removes it (toggle semantics).
    act(() => result.current.togglePin({ ...grp("foo"), expected: 5 }));
    expect(result.current.pinned).toEqual([]);
  });

  it("removePin drops the named group", () => {
    const { result } = renderHook(() => usePinned({ storage }));
    act(() => result.current.togglePin(grp("foo")));
    act(() => result.current.togglePin(grp("bar")));
    act(() => result.current.removePin("foo"));
    expect(result.current.pinned.map((p) => p.name)).toEqual(["bar"]);
  });

  it("clear empties the list", () => {
    const { result } = renderHook(() => usePinned({ storage }));
    act(() => result.current.togglePin(grp("foo")));
    act(() => result.current.clear());
    expect(result.current.pinned).toEqual([]);
  });

  it("persists to storage on change", () => {
    const { result } = renderHook(() => usePinned({ storage }));
    act(() => result.current.togglePin(grp("foo")));
    expect(JSON.parse(storage.getItem(PINNED_LS_KEY)!)).toEqual([grp("foo")]);
  });

  it("hydrates from storage on mount", () => {
    storage.setItem(PINNED_LS_KEY, JSON.stringify([grp("net"), grp("io")]));
    const { result } = renderHook(() => usePinned({ storage }));
    expect(result.current.pinned.map((p) => p.name)).toEqual(["net", "io"]);
  });
});
