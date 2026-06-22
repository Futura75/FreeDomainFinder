import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SESSION_APP,
  SESSION_VERSION,
  isSessionFile,
  gatherSession,
  scatterSession,
  mergeConfig,
  downloadSession,
  readSessionFile,
  SessionFile,
  SessionSlice,
} from "./session";

const validFile: SessionFile = {
  app: SESSION_APP,
  version: SESSION_VERSION,
  savedAt: "2026-01-01T00:00:00.000Z",
  config: { active: ["com"], exclusions: [], used: ["com"] },
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

describe("isSessionFile", () => {
  it("accepts a well-formed file", () => {
    expect(isSessionFile(validFile)).toBe(true);
  });
  it("rejects wrong app / missing version / missing results", () => {
    expect(isSessionFile(null)).toBe(false);
    expect(isSessionFile({ ...validFile, app: "Other" })).toBe(false);
    expect(isSessionFile({ ...validFile, version: "1" })).toBe(false);
    expect(isSessionFile({ ...validFile, results: undefined })).toBe(false);
  });
  it("tolerates a missing config", () => {
    const f = { ...validFile, config: undefined } as unknown;
    expect(isSessionFile(f)).toBe(true);
  });
});

describe("gatherSession / scatterSession", () => {
  it("gather produces a full SessionFile with slice keys merged in", () => {
    const view: SessionSlice = {
      key: "view",
      serialize: () => ({ mode: "generate", prompt: "hi" }),
      hydrate: () => {},
    };
    const file = gatherSession({ active: ["com"], exclusions: [], used: ["com"] }, [view]);
    expect(file.app).toBe(SESSION_APP);
    expect(file.config.active).toEqual(["com"]);
    expect(file.mode).toBe("generate");
    expect(file.prompt).toBe("hi");
  });

  it("scatter hydrates slices with the matching keys", () => {
    let got: Record<string, unknown> = {};
    const view: SessionSlice = {
      key: "view",
      serialize: () => ({ mode: "check", prompt: "" }),
      hydrate: (s) => {
        got = s;
      },
    };
    scatterSession({ ...validFile, mode: "generate", prompt: "hello" }, [view]);
    expect(got).toMatchObject({ mode: "generate", prompt: "hello" });
  });

  it("scatter ignores keys that are absent in the file", () => {
    let got: Record<string, unknown> = {};
    const slice: SessionSlice = {
      key: "ai",
      serialize: () => ({ prompt: "", count: 8, suggestions: [] }),
      hydrate: (s) => {
        got = s;
      },
    };
    const file = { ...validFile } as SessionFile;
    // Remove suggestions from the file to exercise the "missing key" branch.
    delete (file as unknown as Record<string, unknown>).suggestions;
    scatterSession(file, [slice]);
    expect(got).toMatchObject({ prompt: "", count: 8 });
    expect("suggestions" in got).toBe(false);
  });
});

describe("mergeConfig", () => {
  it("fills defaults for missing arrays", () => {
    expect(mergeConfig(undefined)).toEqual({ active: [], exclusions: [], used: [] });
    expect(mergeConfig({ active: ["com"] })).toEqual({
      active: ["com"],
      exclusions: [],
      used: [],
    });
  });
  it("passes through complete configs", () => {
    expect(
      mergeConfig({ active: ["com"], exclusions: ["xyz"], used: ["com", "tech"] })
    ).toEqual({ active: ["com"], exclusions: ["xyz"], used: ["com", "tech"] });
  });
});

describe("downloadSession", () => {
  const origCreate = (URL as { createObjectURL?: unknown }).createObjectURL;
  const origRevoke = (URL as { revokeObjectURL?: unknown }).revokeObjectURL;

  afterEach(() => {
    (URL as { createObjectURL?: unknown }).createObjectURL = origCreate;
    (URL as { revokeObjectURL?: unknown }).revokeObjectURL = origRevoke;
    vi.restoreAllMocks();
  });

  it("builds a blob URL, clicks a download anchor, and revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    (URL as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadSession(validFile);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    // The anchor is appended and removed again — nothing left in the body.
    expect(document.querySelector("a[download]")).toBeNull();
  });
});

describe("readSessionFile", () => {
  it("resolves the parsed JSON content of the file", async () => {
    const file = new File([JSON.stringify({ hello: "world" })], "s.json", {
      type: "application/json",
    });
    await expect(readSessionFile(file)).resolves.toEqual({ hello: "world" });
  });

  it("rejects when the file is not valid JSON", async () => {
    const file = new File(["not json"], "s.json", { type: "application/json" });
    await expect(readSessionFile(file)).rejects.toBeInstanceOf(Error);
  });
});
