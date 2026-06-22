import { describe, it, expect } from "vitest";
import {
  DEFAULT_TLDS,
  SUGGESTED_TLDS,
  normalizeTld,
  normalizeName,
  parseInput,
  isValidSld,
  sanitizeSld,
} from "./tlds";

describe("normalizeTld", () => {
  it("strips leading dots and lowercases", () => {
    expect(normalizeTld(".IT")).toBe("it");
    expect(normalizeTld("  Com ")).toBe("com");
    expect(normalizeTld("...tech")).toBe("tech");
  });
  it("returns empty for blank input", () => {
    expect(normalizeTld("   ")).toBe("");
    expect(normalizeTld("")).toBe("");
  });
});

describe("normalizeName", () => {
  it("strips protocol, www, trailing path, lowercases", () => {
    expect(normalizeName("https://WWW.Example.com/path")).toBe("example.com");
    expect(normalizeName("Example.IT")).toBe("example.it");
  });
  it("returns empty for blank input", () => {
    expect(normalizeName("")).toBe("");
  });
});

describe("parseInput", () => {
  it("splits name and tld when a short alphabetic tail is present", () => {
    expect(parseInput("mieodomini.it")).toEqual({ name: "mieodomini", tld: "it" });
    expect(parseInput("foo.com")).toEqual({ name: "foo", tld: "com" });
  });
  it("returns tld null when there is no dot or the tail is not alphabetic", () => {
    expect(parseInput("mieodomini")).toEqual({ name: "mieodomini", tld: null });
    expect(parseInput("foo.123")).toEqual({ name: "foo.123", tld: null });
  });
  it("returns empty name for blank input", () => {
    expect(parseInput("")).toEqual({ name: "", tld: null });
  });
});

describe("isValidSld", () => {
  it("accepts valid SLDs", () => {
    expect(isValidSld("example")).toBe(true);
    expect(isValidSld("my-site")).toBe(true);
    expect(isValidSld("a1b2")).toBe(true);
  });
  it("rejects empty, too long, bad chars, leading/trailing hyphen", () => {
    expect(isValidSld("")).toBe(false);
    expect(isValidSld("x".repeat(64))).toBe(false);
    expect(isValidSld("bad_char")).toBe(false);
    expect(isValidSld("-bad")).toBe(false);
    expect(isValidSld("bad-")).toBe(false);
  });
});

describe("sanitizeSld", () => {
  it("lowercases, strips leading dot, spaces, non [a-z0-9-]", () => {
    expect(sanitizeSld("  Foo.Bar ")).toBe("foo.bar".replace(".", ""));
    expect(sanitizeSld("Café")).toBe("caf");
    expect(sanitizeSld(".tech")).toBe("tech");
    expect(sanitizeSld("my site")).toBe("mysite");
  });
  it("returns empty for blank/garbage input", () => {
    expect(sanitizeSld("")).toBe("");
    expect(sanitizeSld("   .   ")).toBe("");
  });
});

describe("constants", () => {
  it("exports non-empty default and suggested lists", () => {
    expect(DEFAULT_TLDS.length).toBeGreaterThan(0);
    expect(SUGGESTED_TLDS.length).toBeGreaterThanOrEqual(DEFAULT_TLDS.length);
    expect(SUGGESTED_TLDS).toContain("com");
  });
});
