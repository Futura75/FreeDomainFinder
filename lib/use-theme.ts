"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const THEME_LS_KEY = "fdf-theme";

export interface UseThemeOptions {
  /** Inject a storage implementation (defaults to none — caller passes
   * window.localStorage). */
  storage?: Storage;
  /** Inject a media-query matcher (defaults to none — caller passes
   * window.matchMedia). Absent means "no system preference available". */
  matchMedia?: (query: string) => MediaQueryList;
  /** Called whenever the resolved theme changes (mount, system change, or
   * toggle). The caller applies the DOM class + notify theme here, so this
   * module stays free of app-specific side effects and is testable. */
  onChange?: (dark: boolean) => void;
}

export interface Theme {
  dark: boolean;
  toggleTheme: () => void;
}

/** The theme precedence rule: an explicit saved choice wins; otherwise follow
 * the system preference. Pure, so the precedence can be tested directly. */
export function resolveInitialDark(
  saved: string | null,
  systemPrefersDark: boolean
): boolean {
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return systemPrefersDark;
}

/** The theme module: owns the dark flag, the saved-choice-vs-system
 * precedence, the system-preference listener (detached once the user makes an
 * explicit choice), and persistence — behind { dark, toggleTheme }. */
export function useTheme(options: UseThemeOptions = {}): Theme {
  const { storage, matchMedia, onChange } = options;
  const [dark, setDark] = useState(false);
  const initRef = useRef(false);
  const userChoseRef = useRef(false);
  const detachRef = useRef<(() => void) | undefined>(undefined);

  // Resolve the initial theme and, when no explicit choice is saved, follow
  // the system preference until the user toggles.
  useEffect(() => {
    const saved = storage?.getItem(THEME_LS_KEY) ?? null;
    const mq = matchMedia?.("(prefers-color-scheme: dark)");
    const initialDark = resolveInitialDark(saved, mq?.matches ?? false);

    setDark(initialDark);
    onChange?.(initialDark);
    initRef.current = true;

    if (saved !== "dark" && saved !== "light" && mq) {
      const handler = (e: MediaQueryListEvent) => {
        if (userChoseRef.current) return;
        setDark(e.matches);
        onChange?.(e.matches);
      };
      mq.addEventListener("change", handler);
      detachRef.current = () => mq.removeEventListener("change", handler);
    }
    return () => detachRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, matchMedia]);

  // Apply + persist on change (after the initial resolution).
  useEffect(() => {
    if (!initRef.current) return;
    onChange?.(dark);
    if (userChoseRef.current) {
      try {
        storage?.setItem(THEME_LS_KEY, dark ? "dark" : "light");
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  const toggleTheme = useCallback(() => {
    userChoseRef.current = true;
    detachRef.current?.();
    detachRef.current = undefined;
    setDark((d) => !d);
  }, []);

  return { dark, toggleTheme };
}
