import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewControls } from "./use-view-controls";

describe("useViewControls", () => {
  it("starts with the documented defaults", () => {
    const { result } = renderHook(() => useViewControls());
    expect(result.current.serialize()).toEqual({
      mode: "check",
      inputMode: "single",
      checkInput: "",
      bulkInput: "",
      sortKey: "free-desc",
      onlyFree: false,
      onlyAllFree: false,
    });
  });

  it("setters update the serialized snapshot", () => {
    const { result } = renderHook(() => useViewControls());
    act(() => {
      result.current.setMode("generate");
      result.current.setInputMode("bulk");
      result.current.setCheckInput("foo.com");
      result.current.setBulkInput("a\nb");
      result.current.setSortKey("alpha-asc");
      result.current.setOnlyFree(true);
      result.current.setOnlyAllFree(true);
    });
    expect(result.current.serialize()).toEqual({
      mode: "generate",
      inputMode: "bulk",
      checkInput: "foo.com",
      bulkInput: "a\nb",
      sortKey: "alpha-asc",
      onlyFree: true,
      onlyAllFree: true,
    });
  });

  it("hydrate applies a snapshot defensively, ignoring bad fields", () => {
    const { result } = renderHook(() => useViewControls());
    act(() =>
      result.current.hydrate({
        mode: "generate",
        inputMode: "bulk",
        checkInput: "x",
        bulkInput: 123, // wrong type — ignored
        sortKey: "alpha-desc",
        onlyFree: "yes", // wrong type — ignored
        onlyAllFree: true,
        garbage: "nope", // unknown — ignored
      })
    );
    const snap = result.current.serialize();
    expect(snap.mode).toBe("generate");
    expect(snap.inputMode).toBe("bulk");
    expect(snap.checkInput).toBe("x");
    expect(snap.bulkInput).toBe(""); // unchanged
    expect(snap.sortKey).toBe("alpha-desc");
    expect(snap.onlyFree).toBe(false); // unchanged
    expect(snap.onlyAllFree).toBe(true);
  });

  it("hydrate rejects out-of-domain mode / inputMode values", () => {
    const { result } = renderHook(() => useViewControls());
    act(() => result.current.hydrate({ mode: "weird", inputMode: "nope" }));
    expect(result.current.mode).toBe("check");
    expect(result.current.inputMode).toBe("single");
  });

  it("clearFilters resets only the filters", () => {
    const { result } = renderHook(() => useViewControls());
    act(() => {
      result.current.setOnlyFree(true);
      result.current.setOnlyAllFree(true);
      result.current.setCheckInput("keep");
    });
    act(() => result.current.clearFilters());
    expect(result.current.onlyFree).toBe(false);
    expect(result.current.onlyAllFree).toBe(false);
    expect(result.current.checkInput).toBe("keep");
  });

  it("clearInputs resets only the input buffers", () => {
    const { result } = renderHook(() => useViewControls());
    act(() => {
      result.current.setCheckInput("foo");
      result.current.setBulkInput("bar");
      result.current.setOnlyFree(true);
    });
    act(() => result.current.clearInputs());
    expect(result.current.checkInput).toBe("");
    expect(result.current.bulkInput).toBe("");
    expect(result.current.onlyFree).toBe(true);
  });
});
