import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRdap } from "./use-rdap";

const record = {
  ldhName: "example.com",
  status: ["active"],
  events: [{ eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" }],
  nameservers: [{ ldhName: "A.IANA-SERVERS.NET" }],
};

describe("useRdap", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useRdap({ fetchRdap: vi.fn() }));
    expect(result.current.domain).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("open() loads and populates summary + raw on success", async () => {
    const fetchRdap = vi.fn(async () => record);
    const { result } = renderHook(() => useRdap({ fetchRdap }));
    act(() => result.current.open("example.com"));
    expect(result.current.domain).toBe("example.com");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchRdap).toHaveBeenCalledWith("example.com");
    expect(result.current.summary?.domain).toBe("example.com");
    expect(result.current.summary?.nameservers).toEqual(["A.IANA-SERVERS.NET"]);
    expect(result.current.raw).toEqual(record);
    expect(result.current.error).toBeNull();
  });

  it("open() sets an error when no record is returned (null)", async () => {
    const fetchRdap = vi.fn(async () => null);
    const { result } = renderHook(() => useRdap({ fetchRdap }));
    act(() => result.current.open("free.com"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/Nessun dato RDAP/);
    expect(result.current.summary).toBeNull();
  });

  it("open() sets an error when the fetch rejects", async () => {
    const fetchRdap = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useRdap({ fetchRdap }));
    act(() => result.current.open("x.com"));
    await waitFor(() => expect(result.current.error).toMatch(/Impossibile recuperare/));
    expect(result.current.loading).toBe(false);
  });

  it("close() resets all state", async () => {
    const fetchRdap = vi.fn(async () => record);
    const { result } = renderHook(() => useRdap({ fetchRdap }));
    act(() => result.current.open("example.com"));
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    act(() => result.current.close());
    expect(result.current.domain).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("discards a stale response when a newer open() supersedes it", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const fetchRdap = vi
      .fn()
      .mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)))
      .mockImplementationOnce(async () => ({ ...record, ldhName: "second.com" }));
    const { result } = renderHook(() => useRdap({ fetchRdap }));
    act(() => result.current.open("first.com"));
    act(() => result.current.open("second.com"));
    await waitFor(() => expect(result.current.summary?.domain).toBe("second.com"));
    // The first (slow) request resolves late — it must not overwrite the second.
    act(() => resolveFirst({ ...record, ldhName: "first.com" }));
    expect(result.current.summary?.domain).toBe("second.com");
  });
});
