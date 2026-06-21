"use client";

import { useCallback, useRef, useState } from "react";
import { fetchRdap as defaultFetchRdap, summarizeRdap, type RdapSummary } from "./rdap";

export interface UseRdapOptions {
  /** Inject the RDAP fetcher (for tests). */
  fetchRdap?: typeof defaultFetchRdap;
}

export interface Rdap {
  /** The domain whose modal is open, or null when closed. */
  domain: string | null;
  loading: boolean;
  error: string | null;
  summary: RdapSummary | null;
  raw: unknown | null;
  open: (domain: string) => void;
  close: () => void;
}

/** The RDAP-details module: owns the modal target and the async
 * fetch/summarize lifecycle behind open/close, so the page only renders state.
 * A request counter discards stale responses when the user opens another
 * domain (or closes) before the previous fetch resolves. */
export function useRdap(options: UseRdapOptions = {}): Rdap {
  const fetchRdap = options.fetchRdap ?? defaultFetchRdap;
  const [domain, setDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RdapSummary | null>(null);
  const [raw, setRaw] = useState<unknown | null>(null);
  const reqRef = useRef(0);

  const open = useCallback(
    (target: string) => {
      const id = ++reqRef.current;
      setDomain(target);
      setLoading(true);
      setError(null);
      setSummary(null);
      setRaw(null);
      fetchRdap(target)
        .then((record) => {
          if (id !== reqRef.current) return; // superseded by a newer open/close
          if (record == null) {
            setError("Nessun dato RDAP disponibile per questo dominio.");
            return;
          }
          setRaw(record);
          setSummary(summarizeRdap(record));
        })
        .catch(() => {
          if (id === reqRef.current) setError("Impossibile recuperare i dati RDAP.");
        })
        .finally(() => {
          if (id === reqRef.current) setLoading(false);
        });
    },
    [fetchRdap]
  );

  const close = useCallback(() => {
    reqRef.current += 1; // invalidate any in-flight request
    setDomain(null);
    setLoading(false);
    setError(null);
    setSummary(null);
    setRaw(null);
  }, []);

  return { domain, loading, error, summary, raw, open, close };
}
