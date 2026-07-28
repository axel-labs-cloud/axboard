// User-defined color themes. Persisted in localStorage (like the built-in
// theme selection) and applied by injecting a `.theme-<id>` rule into a single
// managed <style> element, so a custom theme works through the exact same
// `theme-<id>` document class the built-ins use.

export interface CustomTheme {
  id: string; // always prefixed "custom-"
  label: string;
  vars: Record<string, string>; // CSS custom prop → value
}

const KEY = "axboard-custom-themes";
const STYLE_ID = "axboard-custom-theme-styles";

// The editable palette, in editor order. Values are the CSS variables index.css
// reads. Defaults below approximate the Midnight theme as a starting point.
export const CUSTOM_VARS: { key: string; label: string }[] = [
  { key: "--color-bg", label: "Background" },
  { key: "--color-bg-card", label: "Card" },
  { key: "--color-bg-elevated", label: "Elevated" },
  { key: "--color-bg-hover", label: "Hover" },
  { key: "--color-border", label: "Border" },
  { key: "--color-border-subtle", label: "Border subtle" },
  { key: "--color-text", label: "Text" },
  { key: "--color-text-secondary", label: "Text 2nd" },
  { key: "--color-text-muted", label: "Text muted" },
  { key: "--color-accent", label: "Accent" },
  { key: "--color-danger", label: "Danger" },
  { key: "--color-up", label: "Up" },
  { key: "--color-degraded", label: "Degraded" },
  { key: "--color-down", label: "Down" },
];

export const DEFAULT_CUSTOM_VARS: Record<string, string> = {
  "--color-bg": "#09090b",
  "--color-bg-card": "#18181c",
  "--color-bg-elevated": "#232329",
  "--color-bg-hover": "#2a2a31",
  "--color-border": "#2e2e35",
  "--color-border-subtle": "#232329",
  "--color-text": "#ededf0",
  "--color-text-secondary": "#c4c4cc",
  "--color-text-muted": "#8b8b93",
  "--color-accent": "#818cf8",
  "--color-danger": "#ef4444",
  "--color-up": "#22c55e",
  "--color-degraded": "#eab308",
  "--color-down": "#ef4444",
};

export function loadCustomThemes(): CustomTheme[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as CustomTheme[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomThemes(list: CustomTheme[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore quota / private mode
  }
  injectCustomThemes(list);
}

/** (Re)write the managed <style> so every custom theme has a `.theme-<id>` rule.
 * `--color-unknown` mirrors text-muted since the editor doesn't expose it. */
export function injectCustomThemes(list?: CustomTheme[]) {
  const themes = list ?? loadCustomThemes();
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = themes
    .map((t) => {
      const vars = { ...t.vars };
      if (!vars["--color-unknown"]) vars["--color-unknown"] = vars["--color-text-muted"] ?? "#8b8b93";
      const body = Object.entries(vars)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join("\n");
      return `.theme-${t.id} {\n${body}\n}`;
    })
    .join("\n\n");
}
