import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "axboard-theme";

/**
 * Persists the dashboard's theme in localStorage and applies a class to the
 * document root. The light theme is opt-in; dark stays the default.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", theme === "light");
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore quota errors / private mode
    }
  }, [theme]);

  return [theme, setTheme];
}
