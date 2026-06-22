import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkDomain, pool, checkNameAcrossTlds, CheckResult } from "./check";

describe("pool", () => {
  it("runs tasks with bounded concurrency and preserves order", async () => {
    const items = [1, 2, 3, 4, 5];
    const worker = vi.fn(async (n: number) => n * 10);
    const onResult = vi.fn();
    const res = await pool(items, 2, worker, onResult);
    expect(res).toEqual([10, 20, 30, 40, 50]);
    expect(worker).toHaveBeenCalledTimes(5);
    expect(onResult).toHaveBeenCalledTimes(5);
  });

  it("honors the concurrency limit", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await pool(items, 3, async (n) => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await Promise.resolve();
      inflight--;
      return n;
    });
    expect(maxInflight).toBeLessThanOrEqual(3);
  });

  it("handles empty input", async () => {
    const res = await pool([], 4, async () => 1);
    expect(res).toEqual([]);
  });

  it("propagates worker errors", async () => {
    await expect(
      pool([1, 2], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
  });
});

describe("checkDomain", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns free on RDAP 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );
    const r = await checkDomain("freeexample", "com");
    expect(r).toMatchObject({ name: "freeexample", tld: "com", status: "free" });
    expect(r.domain).toBe("freeexample.com");
  });

  it("returns taken on RDAP 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 })
    );
    const r = await checkDomain("google", "com");
    expect(r.status).toBe("taken");
  });

  it("falls back to DoH NXDOMAIN => free", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: URL | RequestInfo) => {
        const url = String(input);
        if (url.startsWith("https://rdap.org")) {
          return new Response(null, { status: 403 });
        }
        // DoH
        return new Response(JSON.stringify({ Status: 3 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
    const r = await checkDomain("whoiswho", "xyz");
    expect(r.status).toBe("free");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("falls back to DoH with Answer => taken", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://rdap.org")) return new Response(null, { status: 500 });
      return new Response(
        JSON.stringify({ Status: 0, Answer: [{ name: "x", type: 2, TTL: 1, data: "ns" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const r = await checkDomain("registered", "com");
    expect(r.status).toBe("taken");
  });

  it("returns unknown when both RDAP and DoH fail", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const r = await checkDomain("anything", "com");
    expect(r.status).toBe("unknown");
  });

  it("returns unknown when DoH has no answer and no NXDOMAIN", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://rdap.org")) return new Response(null, { status: 403 });
      // First DoH call (NS): empty, no NXDOMAIN. Second (A): same.
      return new Response(JSON.stringify({ Status: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const r = await checkDomain("ambiguous", "com");
    expect(r.status).toBe("unknown");
  });

  it("A-record fallback: NXDOMAIN on the A query => free", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://rdap.org")) return new Response(null, { status: 403 });
      if (url.includes("type=NS")) {
        return new Response(JSON.stringify({ Status: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // A query says NXDOMAIN.
      return new Response(JSON.stringify({ Status: 3 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const r = await checkDomain("maybefree", "com");
    expect(r.status).toBe("free");
  });

  it("A-record fallback: an A answer => taken", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://rdap.org")) return new Response(null, { status: 403 });
      if (url.includes("type=NS")) {
        return new Response(JSON.stringify({ Status: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ Status: 0, Answer: [{ name: "x", type: 1, TTL: 1, data: "1.2.3.4" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const r = await checkDomain("hasaddr", "com");
    expect(r.status).toBe("taken");
  });
});

describe("checkNameAcrossTlds", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("checks one name across several TLDs and streams partials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const partials: CheckResult[] = [];
    const results = await checkNameAcrossTlds("brandable", ["com", "io", "dev"], (r) =>
      partials.push(r)
    );
    expect(results.map((r) => r.tld)).toEqual(["com", "io", "dev"]);
    expect(results.every((r) => r.status === "free")).toBe(true);
    expect(partials).toHaveLength(3);
  });
});
