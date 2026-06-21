import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useTldConfig,
  parseTldConfigSnapshot,
  TLDS_LS_KEY,
} from "./use-tld-config";

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

describe("parseTldConfigSnapshot", () => {
  it("parses a valid snapshot", () => {
    expect(
      parseTldConfigSnapshot(JSON.stringify({ active: ["com"], exclusions: ["xyz"], used: ["com"] }))
    ).toEqual({ active: ["com"], exclusions: ["xyz"], used: ["com"] });
  });
  it("returns null for malformed json or missing arrays", () => {
    expect(parseTldConfigSnapshot(null)).toBeNull();
    expect(parseTldConfigSnapshot("not json")).toBeNull();
    expect(parseTldConfigSnapshot(JSON.stringify({ active: ["com"] }))).toBeNull();
  });
});

describe("useTldConfig", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memStorage();
  });

  it("starts from defaults", () => {
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com", "it"] }));
    expect(result.current.active).toEqual(["com", "it"]);
    expect(result.current.exclusions).toEqual([]);
    expect(result.current.effectiveTlds).toEqual(["com", "it"]);
  });

  it("toggleActive removes when present, adds when absent, and records used", () => {
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com"] }));
    act(() => result.current.toggleActive("it"));
    expect(result.current.active).toEqual(["com", "it"]);
    expect(result.current.used).toContain("it");
    act(() => result.current.toggleActive("com"));
    expect(result.current.active).toEqual(["it"]);
  });

  it("toggleActive ignores garbage", () => {
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com"] }));
    act(() => result.current.toggleActive("   "));
    expect(result.current.active).toEqual(["com"]);
  });

  it("addActive returns false on duplicates / garbage, true on new", () => {
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com"] }));
    let ok = false;
    act(() => (ok = result.current.addActive("com")));
    expect(ok).toBe(false);
    act(() => (ok = result.current.addActive(".tech")));
    expect(ok).toBe(true);
    expect(result.current.active).toContain("tech");
    act(() => (ok = result.current.addActive("")));
    expect(ok).toBe(false);
  });

  it("removeActive removes the tld", () => {
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com", "it"] }));
    act(() => result.current.removeActive("com"));
    expect(result.current.active).toEqual(["it"]);
  });

  it("addExclusion / removeExclusion + effectiveTlds excludes", () => {
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com", "xyz"] }));
    let ok = false;
    act(() => (ok = result.current.addExclusion("xyz")));
    expect(ok).toBe(true);
    expect(result.current.effectiveTlds).toEqual(["com"]);
    act(() => result.current.addExclusion("xyz")); // dup => false
    act(() => result.current.removeExclusion("xyz"));
    expect(result.current.effectiveTlds).toEqual(["com", "xyz"]);
  });

  it("persists to storage on change", () => {
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com"] }));
    act(() => result.current.addActive("tech"));
    const stored = JSON.parse(storage.getItem(TLDS_LS_KEY)!);
    expect(stored.active).toContain("tech");
  });

  it("hydrates from storage on mount", () => {
    storage.setItem(
      TLDS_LS_KEY,
      JSON.stringify({ active: ["net"], exclusions: ["xyz"], used: ["net", "xyz"] })
    );
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com"] }));
    expect(result.current.active).toEqual(["net"]);
    expect(result.current.exclusions).toEqual(["xyz"]);
  });

  it("hydrate() and reset()", () => {
    const { result } = renderHook(() => useTldConfig({ storage, defaults: ["com"] }));
    act(() => result.current.hydrate({ active: ["io"], exclusions: ["xyz"], used: ["io"] }));
    expect(result.current.active).toEqual(["io"]);
    act(() => result.current.reset());
    expect(result.current.active).toEqual(["com"]);
    expect(result.current.exclusions).toEqual([]);
  });
});
