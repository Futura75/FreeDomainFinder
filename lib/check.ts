export type DomainStatus = "free" | "taken" | "unknown";

export interface CheckResult {
  domain: string; // e.g. "example.com"
  name: string; // "example"
  tld: string; // "com"
  status: DomainStatus;
}

const RDAP_BASE = "https://rdap.org/domain/";
const DOH_URL = "https://cloudflare-dns.com/dns-query";

async function rdapCheck(domain: string): Promise<DomainStatus | null> {
  try {
    const res = await fetch(`${RDAP_BASE}${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      // cache: 'no-store' to always get fresh status
      cache: "no-store",
    });
    if (res.status === 404) return "free";
    if (res.status >= 200 && res.status < 300) return "taken";
    // 400/403/etc -> unsupported TLD or rate limit; fall back
    return null;
  } catch {
    return null;
  }
}

async function dohCheck(domain: string): Promise<DomainStatus | null> {
  try {
    // Query NS records. Registered domains have NS records.
    const res = await fetch(
      `${DOH_URL}?name=${encodeURIComponent(domain)}&type=NS`,
      { headers: { Accept: "application/dns-json" }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Cloudflare DoH returns { Status: 0, Answer?: [...] }
    // Status 3 = NXDOMAIN -> free
    if (data.Status === 3) return "free";
    if (Array.isArray(data.Answer) && data.Answer.length > 0) return "taken";
    // No answer and no NXDOMAIN: ambiguous. Try A record as a softer signal.
    const resA = await fetch(
      `${DOH_URL}?name=${encodeURIComponent(domain)}&type=A`,
      { headers: { Accept: "application/dns-json" }, cache: "no-store" }
    );
    if (resA.ok) {
      const dataA = await resA.json();
      if (dataA.Status === 3) return "free";
      if (Array.isArray(dataA.Answer) && dataA.Answer.length > 0)
        return "taken";
    }
    return "unknown";
  } catch {
    return null;
  }
}

export async function checkDomain(
  name: string,
  tld: string
): Promise<CheckResult> {
  const domain = `${name}.${tld}`;
  let status: DomainStatus | null = await rdapCheck(domain);
  if (status === null) {
    status = await dohCheck(domain);
  }
  if (status === null) status = "unknown";
  return { domain, name, tld, status };
}

/** Run an array of tasks with a concurrency limit. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onResult?: (result: R, item: T) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
      onResult?.(results[i], items[i]);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

/** Check a name across a list of TLDs with bounded concurrency. */
export async function checkNameAcrossTlds(
  name: string,
  tlds: string[],
  onPartial?: (result: CheckResult) => void
): Promise<CheckResult[]> {
  const tasks = tlds.map((tld) => ({ name, tld }));
  return pool(tasks, 6, ({ name, tld }) => checkDomain(name, tld), (r) =>
    onPartial?.(r)
  );
}
