// RDAP record fetching + summarizing for the "registry details" modal.
// Client-side, no API keys. rdap.org returns the full registration record for
// a registered domain (404 for a free/unregistered one).

const RDAP_BASE = "https://rdap.org/domain/";

export interface RdapEvent {
  action: string;
  date: string;
}

export interface RdapSummary {
  domain: string | null;
  statuses: string[];
  registrar: string | null;
  events: RdapEvent[];
  nameservers: string[];
  dnssec: boolean | null;
}

/** Fetch the full RDAP record for a domain. Returns null on 404 (free),
 * unsupported TLD, or any network/parse error. The fetch implementation is
 * injectable so the function is testable without the network. */
export async function fetchRdap(
  domain: string,
  fetchImpl: typeof fetch = fetch
): Promise<unknown | null> {
  try {
    const res = await fetchImpl(`${RDAP_BASE}${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Pull a vCard property value (e.g. "fn") out of an RDAP entity's jCard
 * array: ["vcard", [ [name, params, type, value], ... ]]. */
function vcardField(vcardArray: unknown, field: string): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return null;
  const props = vcardArray[1];
  if (!Array.isArray(props)) return null;
  for (const p of props) {
    if (Array.isArray(p) && p[0] === field && typeof p[3] === "string") return p[3];
  }
  return null;
}

/** Find the registrar entity's display name. */
function findRegistrar(entities: unknown): string | null {
  if (!Array.isArray(entities)) return null;
  for (const e of entities) {
    const roles = (e as { roles?: unknown }).roles;
    if (Array.isArray(roles) && roles.includes("registrar")) {
      const fn = vcardField((e as { vcardArray?: unknown }).vcardArray, "fn");
      if (fn) return fn;
    }
  }
  return null;
}

/** Reduce a raw RDAP record to the handful of fields worth showing. Defensive:
 * registries vary, so every field falls back to a safe empty/null value. */
export function summarizeRdap(record: unknown): RdapSummary {
  const r = (record ?? {}) as Record<string, unknown>;
  const statuses = Array.isArray(r.status) ? (r.status as unknown[]).map(String) : [];
  const events: RdapEvent[] = Array.isArray(r.events)
    ? (r.events as Record<string, unknown>[])
        .filter(
          (e) => e && typeof e.eventAction === "string" && typeof e.eventDate === "string"
        )
        .map((e) => ({ action: e.eventAction as string, date: e.eventDate as string }))
    : [];
  const nameservers = Array.isArray(r.nameservers)
    ? (r.nameservers as Record<string, unknown>[])
        .map((ns) => (typeof ns.ldhName === "string" ? ns.ldhName : null))
        .filter((n): n is string => Boolean(n))
    : [];
  const secureDNS = r.secureDNS as { delegationSigned?: unknown } | undefined;
  return {
    domain:
      (typeof r.ldhName === "string" && r.ldhName) ||
      (typeof r.unicodeName === "string" && r.unicodeName) ||
      null,
    statuses,
    registrar: findRegistrar(r.entities),
    events,
    nameservers,
    dnssec:
      secureDNS && typeof secureDNS.delegationSigned === "boolean"
        ? secureDNS.delegationSigned
        : null,
  };
}
