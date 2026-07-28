import { useEffect, useState } from "react";
import { THEME_IDS, DEFAULT_THEME, LEGACY_THEME } from "./themes";

export type Theme = string;

const STORAGE_KEY = "axboard-theme";

/**
 * Persists the selected color theme in localStorage and applies a `theme-<id>`
 * class to the document root (removing any previous one). "midnight" relies on
 * the :root defaults, so its class carries no rules.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? "";
    const migrated = LEGACY_THEME[stored] ?? stored;
    return THEME_IDS.includes(migrated) ? migrated : DEFAULT_THEME;
  });

  useEffect(() => {
    const root = document.documentElement;
    THEME_IDS.forEach((id) => root.classList.remove(`theme-${id}`));
    root.classList.remove("theme-dark", "theme-light"); // legacy classes
    root.classList.add(`theme-${theme}`);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore quota errors / private mode
    }
  }, [theme]);

  return [theme, setTheme];
}
