import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type CheckResult } from "./check";
import {
  useCheckRun,
  buildTasks,
  prepareTasks,
  parseBulk,
  sortAndFilter,
  isAllFree,
  freeCount,
  type ResultGroup,
  type CheckTask,
} from "./use-check-run";

function mkResult(name: string, tld: string, status: CheckResult["status"]): CheckResult {
  return { domain: `${name}.${tld}`, name, tld, status };
}

describe("buildTasks", () => {
  it("single tld when provided", () => {
    expect(buildTasks("foo", "it", ["com", "it"], [])).toEqual([{ name: "foo", tld: "it" }]);
  });
  it("empty when the tld is excluded", () => {
    expect(buildTasks("foo", "xyz", ["com"], ["xyz"])).toEqual([]);
  });
  it("all effective tlds when tld is null", () => {
    expect(buildTasks("foo", null, ["com", "it"], ["io"])).toEqual([
      { name: "foo", tld: "com" },
      { name: "foo", tld: "it" },
    ]);
  });
});

describe("prepareTasks", () => {
  const build = (name: string, tld: string | null): CheckTask[] =>
    buildTasks(name, tld, ["com", "it"], []);

  it("sanitizes raw names via the canonical rule (no per-caller cleaning)", () => {
    const { tasks, invalid } = prepareTasks([{ name: "  My Site ", tld: "com" }], build);
    expect(tasks).toEqual([{ name: "mysite", tld: "com" }]);
    expect(invalid).toEqual([]);
  });

  it("drops entries that fail validation and reports the raw input", () => {
    const { tasks, invalid } = prepareTasks(
      [{ name: "-bad", tld: null }, { name: "", tld: null }, { name: "good", tld: "com" }],
      build
    );
    expect(tasks).toEqual([{ name: "good", tld: "com" }]);
    expect(invalid).toEqual(["-bad", ""]);
  });

  it("dedupes by domain (name+tld), keeping distinct tlds for the same name", () => {
    const { tasks } = prepareTasks(
      [{ name: "foo", tld: "com" }, { name: "foo", tld: "it" }, { name: "foo", tld: "com" }],
      build
    );
    expect(tasks).toEqual([
      { name: "foo", tld: "com" },
      { name: "foo", tld: "it" },
    ]);
  });

  it("expands a null tld across the effective TLDs and dedupes the union", () => {
    const { tasks } = prepareTasks([{ name: "foo", tld: null }, { name: "foo", tld: null }], build);
    expect(tasks).toEqual([
      { name: "foo", tld: "com" },
      { name: "foo", tld: "it" },
    ]);
  });
});

describe("parseBulk", () => {
  const parse = (raw: string) => {
    // mirror lib/tlds parseInput for the test
    const clean = raw.trim().toLowerCase();
    const dot = clean.lastIndexOf(".");
    if (dot > 0 && dot < clean.length - 1 && /^[a-z]{2,24}$/.test(clean.slice(dot + 1))) {
      return { name: clean.slice(0, dot), tld: clean.slice(dot + 1) };
    }
    return { name: clean, tld: null };
  };
  it("splits lines and separates invalid", () => {
    const { parsed, invalid } = parseBulk("foo.com\n  \nbad_one\nbar", parse);
    expect(parsed).toEqual([
      { name: "foo", tld: "com" },
      { name: "bad_one", tld: null },
      { name: "bar", tld: null },
    ]);
    expect(invalid).toEqual([]);
  });
  it("returns empty for blank text", () => {
    expect(parseBulk("   ", parse)).toEqual({ parsed: [], invalid: [] });
  });
});

describe("freeCount / isAllFree", () => {
  const g: ResultGroup = {
    name: "foo",
    expected: 3,
    results: [
      mkResult("foo", "com", "free"),
      mkResult("foo", "it", "free"),
      mkResult("foo", "io", "taken"),
    ],
  };

  it("freeCount counts free results", () => {
    expect(freeCount(g)).toBe(2);
  });

  it("isAllFree requires all results to be free and complete", () => {
    expect(isAllFree(g, 3)).toBe(false);
    expect(isAllFree({ ...g, results: g.results.map((r) => ({ ...r, status: "free" as const })) }, 3)).toBe(true);
    expect(isAllFree(g, 5)).toBe(false);
  });
});

describe("sortAndFilter", () => {
  const groups: ResultGroup[] = [
    { name: "b", expected: 2, results: [mkResult("b", "com", "free"), mkResult("b", "it", "taken")] },
    { name: "a", expected: 2, results: [mkResult("a", "com", "free"), mkResult("a", "it", "free")] },
    { name: "c", expected: 1, results: [mkResult("c", "com", "taken")] },
  ];
  const expectedMap = { a: 2, b: 2, c: 1 };

  it("alpha-asc sorts by name", () => {
    expect(sortAndFilter(groups, "alpha-asc", false, false, expectedMap).map((g) => g.name)).toEqual(["a", "b", "c"]);
  });
  it("alpha-desc", () => {
    expect(sortAndFilter(groups, "alpha-desc", false, false, expectedMap).map((g) => g.name)).toEqual(["c", "b", "a"]);
  });
  it("free-desc puts most-free first", () => {
    expect(sortAndFilter(groups, "free-desc", false, false, expectedMap).map((g) => g.name)).toEqual(["a", "b", "c"]);
  });
  it("free-asc puts least-free first", () => {
    expect(sortAndFilter(groups, "free-asc", false, false, expectedMap).map((g) => g.name)).toEqual(["c", "b", "a"]);
  });
  it("onlyFree keeps groups with at least one free", () => {
    expect(sortAndFilter(groups, "alpha-asc", true, false, expectedMap).map((g) => g.name)).toEqual(["a", "b"]);
  });
  it("onlyAllFree keeps complete all-free groups", () => {
    expect(sortAndFilter(groups, "alpha-asc", false, true, expectedMap).map((g) => g.name)).toEqual(["a"]);
  });
});

describe("useCheckRun", () => {
  it("starts empty and not checking", () => {
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName: () => [] })
    );
    expect(result.current.results).toEqual([]);
    expect(result.current.checking).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it("runTasks warns and does nothing when tasks are empty", async () => {
    const onWarn = vi.fn();
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName: () => [], onWarn })
    );
    await act(async () => {
      await result.current.runTasks([]);
    });
    expect(onWarn).toHaveBeenCalled();
    expect(result.current.checking).toBe(false);
  });

  it("runs tasks, streams partials, calls onComplete, sets results", async () => {
    const onComplete = vi.fn();
    const fakeCheck: typeof import("./check").checkDomain = vi.fn(async (name, tld) =>
      mkResult(name, tld, "free")
    );
    const { result } = renderHook(() =>
      useCheckRun({
        buildTasksForName: (name) => [
          { name, tld: "com" },
          { name, tld: "it" },
        ],
        checkDomain: fakeCheck,
        onComplete,
      })
    );
    await act(async () => {
      await result.current.runTasks([{ name: "foo", tld: "com" }, { name: "foo", tld: "it" }]);
    });
    expect(onComplete).toHaveBeenCalledWith(2, 1);
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].results).toHaveLength(2);
    expect(result.current.expectedMap).toEqual({ foo: 2 });
    expect(result.current.checking).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it("checkNames sanitizes, builds tasks via buildTasksForName, and runs them", async () => {
    const fakeCheck: typeof import("./check").checkDomain = vi.fn(async (name, tld) =>
      mkResult(name, tld, "taken")
    );
    const buildTasksForName = vi.fn((name: string) => [{ name, tld: "com" }]);
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName, checkDomain: fakeCheck })
    );
    let invalid: string[] = [];
    await act(async () => {
      ({ invalid } = await result.current.checkNames(["foo", "bar"], null));
    });
    expect(buildTasksForName).toHaveBeenCalledTimes(2);
    expect(result.current.results).toHaveLength(2);
    expect(invalid).toEqual([]);
  });

  it("checkNames reports invalid names instead of building tasks for them", async () => {
    const fakeCheck: typeof import("./check").checkDomain = vi.fn(async (name, tld) =>
      mkResult(name, tld, "free")
    );
    const buildTasksForName = vi.fn((name: string) => [{ name, tld: "com" }]);
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName, checkDomain: fakeCheck })
    );
    let invalid: string[] = [];
    await act(async () => {
      ({ invalid } = await result.current.checkNames(["good", "-bad"], null));
    });
    expect(buildTasksForName).toHaveBeenCalledTimes(1);
    expect(invalid).toEqual(["-bad"]);
    expect(result.current.results.map((g) => g.name)).toEqual(["good"]);
  });

  it("checkEntries runs pre-parsed entries with per-entry tlds", async () => {
    const fakeCheck: typeof import("./check").checkDomain = vi.fn(async (name, tld) =>
      mkResult(name, tld, "free")
    );
    const buildTasksForName = (name: string, tld: string | null): CheckTask[] =>
      tld ? [{ name, tld }] : [{ name, tld: "com" }];
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName, checkDomain: fakeCheck })
    );
    await act(async () => {
      await result.current.checkEntries([
        { name: "foo", tld: "com" },
        { name: "bar", tld: "it" },
      ]);
    });
    expect(result.current.results.map((g) => g.name)).toEqual(["foo", "bar"]);
    expect(result.current.expectedMap).toEqual({ foo: 1, bar: 1 });
  });

  it("recheck runs the names of the given source", async () => {
    const fakeCheck: typeof import("./check").checkDomain = vi.fn(async (name, tld) =>
      mkResult(name, tld, "free")
    );
    const buildTasksForName = (name: string): CheckTask[] => [{ name, tld: "com" }];
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName, checkDomain: fakeCheck })
    );
    const pinned: ResultGroup[] = [{ name: "p1", expected: 1, results: [] }];
    await act(async () => {
      await result.current.recheck("pinned", pinned);
    });
    expect(result.current.results.map((g) => g.name)).toEqual(["p1"]);
  });

  it("recheck does nothing when the source list is empty", async () => {
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName: () => [] })
    );
    await act(async () => {
      await result.current.recheck("results", []);
    });
    expect(result.current.results).toEqual([]);
  });

  it("onError fires when a worker throws", async () => {
    const onError = vi.fn();
    const fakeCheck: typeof import("./check").checkDomain = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName: (n) => [{ name: n, tld: "com" }], checkDomain: fakeCheck, onError })
    );
    await act(async () => {
      await result.current.runTasks([{ name: "foo", tld: "com" }]);
    });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.checking).toBe(false);
  });

  it("clear and hydrate", () => {
    const { result } = renderHook(() =>
      useCheckRun({ buildTasksForName: () => [] })
    );
    act(() =>
      result.current.hydrate({
        results: [{ name: "x", expected: 1, results: [] }],
        expectedMap: { x: 1 },
      })
    );
    expect(result.current.results.map((g) => g.name)).toEqual(["x"]);
    act(() => result.current.clear());
    expect(result.current.results).toEqual([]);
    expect(result.current.expectedMap).toEqual({});
  });
});
