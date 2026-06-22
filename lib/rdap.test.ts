import { describe, it, expect, vi } from "vitest";
import { fetchRdap, summarizeRdap } from "./rdap";

// A representative RDAP record (trimmed to the fields we read).
const record = {
  ldhName: "example.com",
  status: ["client transfer prohibited", "server delete prohibited"],
  events: [
    { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
    { eventAction: "expiration", eventDate: "2026-08-13T04:00:00Z" },
    { eventAction: "last changed", eventDate: "2024-08-14T07:01:34Z" },
    { eventAction: "ignored-without-date" }, // dropped (no eventDate)
  ],
  entities: [
    {
      roles: ["registrar"],
      vcardArray: [
        "vcard",
        [
          ["version", {}, "text", "4.0"],
          ["fn", {}, "text", "RESERVED-Internet Assigned Numbers Authority"],
        ],
      ],
    },
    { roles: ["abuse"], vcardArray: ["vcard", [["fn", {}, "text", "Abuse Dept"]]] },
  ],
  nameservers: [{ ldhName: "A.IANA-SERVERS.NET" }, { ldhName: "B.IANA-SERVERS.NET" }, {}],
  secureDNS: { delegationSigned: true },
};

describe("summarizeRdap", () => {
  it("extracts the useful fields from a full record", () => {
    const s = summarizeRdap(record);
    expect(s.domain).toBe("example.com");
    expect(s.statuses).toEqual([
      "client transfer prohibited",
      "server delete prohibited",
    ]);
    expect(s.registrar).toBe("RESERVED-Internet Assigned Numbers Authority");
    expect(s.events).toEqual([
      { action: "registration", date: "1995-08-14T04:00:00Z" },
      { action: "expiration", date: "2026-08-13T04:00:00Z" },
      { action: "last changed", date: "2024-08-14T07:01:34Z" },
    ]);
    expect(s.nameservers).toEqual(["A.IANA-SERVERS.NET", "B.IANA-SERVERS.NET"]);
    expect(s.dnssec).toBe(true);
  });

  it("falls back to unicodeName when ldhName is absent", () => {
    expect(summarizeRdap({ unicodeName: "münchen.de" }).domain).toBe("münchen.de");
  });

  it("returns safe empty defaults for an empty / garbage record", () => {
    const s = summarizeRdap(null);
    expect(s).toEqual({
      domain: null,
      statuses: [],
      registrar: null,
      events: [],
      nameservers: [],
      dnssec: null,
    });
    expect(summarizeRdap({ status: "nope", events: 5, entities: {} }).statuses).toEqual([]);
  });

  it("returns no registrar when no entity has the registrar role", () => {
    expect(summarizeRdap({ entities: [{ roles: ["abuse"] }] }).registrar).toBeNull();
  });
});

describe("fetchRdap", () => {
  it("returns the parsed record on a 200 response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(record), {
        status: 200,
        headers: { "content-type": "application/rdap+json" },
      })
    ) as unknown as typeof fetch;
    const out = await fetchRdap("example.com", fetchImpl);
    expect((out as { ldhName: string }).ldhName).toBe("example.com");
  });

  it("returns null on a 404 (free / unregistered)", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    expect(await fetchRdap("free-domain.com", fetchImpl)).toBeNull();
  });

  it("returns null when the request throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await fetchRdap("x.com", fetchImpl)).toBeNull();
  });
});
