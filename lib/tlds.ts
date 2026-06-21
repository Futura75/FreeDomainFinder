export const DEFAULT_TLDS = [
  "com",
  "net",
  "org",
  "io",
  "ai",
  "app",
  "dev",
  "co",
  "eu",
  "it",
  "me",
  "xyz",
] as const;

export const SUGGESTED_TLDS = [
  "com",
  "net",
  "org",
  "io",
  "ai",
  "app",
  "dev",
  "co",
  "eu",
  "it",
  "me",
  "xyz",
  "tech",
  "design",
  "studio",
  "cloud",
  "online",
  "site",
  "pro",
  "digital",
];

/** Normalize a TLD string: lowercase, strip leading dots/spaces. */
export function normalizeTld(input: string): string {
  return input.trim().toLowerCase().replace(/^\.+/, "").replace(/\s+/g, "");
}

/** Normalize a domain/name string: lowercase, strip protocol/www/spaces. */
export function normalizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "");
}

/**
 * Split a user input into { name, tld | null }.
 * If the input contains a dot, the last segment is treated as the TLD
 * (only when it's short and alphabetic). Otherwise tld = null.
 */
export function parseInput(
  raw: string
): { name: string; tld: string | null } {
  const clean = normalizeName(raw);
  if (!clean) return { name: "", tld: null };
  const dotIndex = clean.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < clean.length - 1) {
    const last = clean.slice(dotIndex + 1);
    const rest = clean.slice(0, dotIndex);
    if (/^[a-z]{2,24}$/.test(last)) {
      return { name: rest, tld: last };
    }
  }
  return { name: clean, tld: null };
}

/** Validate a SLD (second-level domain) per RFC-ish rules. */
export function isValidSld(name: string): boolean {
  if (!name) return false;
  if (name.length > 63) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name);
}
