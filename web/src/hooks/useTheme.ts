import { useEffect, useState } from "react";
import { DEFAULT_THEME, LEGACY_THEME } from "./themes";
import { injectCustomThemes } from "./customThemes";
import { applyWidgetStyle, loadWidgetStyle } from "./widgetStyle";
import { applyFont, loadFont } from "./fontStyle";

export type Theme = string;

const STORAGE_KEY = "axboard-theme";

/**
 * Persists the selected color theme in localStorage and applies a `theme-<id>`
 * class to the document root (removing any previous one). Custom themes use the
 * same mechanism (their `.theme-<id>` rules are injected by customThemes), so
 * we don't restrict the stored id to the built-in set. "midnight" relies on the
 * :root defaults, so its class carries no rules.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    // Make sure any saved custom-theme rules + widget style exist before paint.
    injectCustomThemes();
    applyWidgetStyle(loadWidgetStyle());
    applyFont(loadFont());
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? "";
    const migrated = LEGACY_THEME[stored] ?? stored;
    return migrated || DEFAULT_THEME;
  });

  useEffect(() => {
    const root = document.documentElement;
    // Strip any previously-applied theme class (built-in OR custom).
    Array.from(root.classList).forEach((c) => {
      if (c.startsWith("theme-")) root.classList.remove(c);
    });
    root.classList.add(`theme-${theme}`);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore quota errors / private mode
    }
  }, [theme]);

  return [theme, setTheme];
}
