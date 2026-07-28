// Available color themes. The actual palettes live as `.theme-<id>` CSS classes
// in index.css; this list drives the picker (label + a few swatch colors) and
// validates the stored value. "midnight" is the default (the :root defaults),
// so it needs no CSS class of its own.

export interface ThemeMeta {
  id: string;
  label: string;
  dark: boolean;
  /** swatch colors for the picker */
  bg: string;
  surface: string;
  accent: string;
}

export const THEMES: ThemeMeta[] = [
  { id: "midnight", label: "Midnight", dark: true, bg: "#09090b", surface: "#18181c", accent: "#818cf8" },
  { id: "light", label: "Light", dark: false, bg: "#fafafa", surface: "#ffffff", accent: "#6366f1" },
  { id: "nord", label: "Nord", dark: true, bg: "#2e3440", surface: "#434c5e", accent: "#88c0d0" },
  { id: "dracula", label: "Dracula", dark: true, bg: "#282a36", surface: "#343746", accent: "#bd93f9" },
  { id: "catppuccin", label: "Catppuccin", dark: true, bg: "#1e1e2e", surface: "#313244", accent: "#cba6f7" },
  { id: "gruvbox", label: "Gruvbox", dark: true, bg: "#1d2021", surface: "#3c3836", accent: "#fabd2f" },
  { id: "rosepine", label: "Rosé Pine", dark: true, bg: "#191724", surface: "#26233a", accent: "#c4a7e7" },
  { id: "solarized", label: "Solarized", dark: true, bg: "#002b36", surface: "#073642", accent: "#268bd2" },
  { id: "cyber", label: "Cyber", dark: true, bg: "#05060d", surface: "#0a0e1a", accent: "#00e5ff" },
  { id: "paper", label: "Paper", dark: false, bg: "#f5f3ee", surface: "#fffdf8", accent: "#b45309" },
  // Square-cornered / structurally distinct styles (also switch to a mono UI font).
  { id: "terminal", label: "Terminal", dark: true, bg: "#08120a", surface: "#122415", accent: "#22c55e" },
  { id: "mono", label: "Mono", dark: true, bg: "#0a0a0a", surface: "#1c1c1c", accent: "#a3a3a3" },
  { id: "brutalist", label: "Brutalist", dark: true, bg: "#0a0a0a", surface: "#161616", accent: "#facc15" },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = "midnight";

// Migrate the old two-value setting.
export const LEGACY_THEME: Record<string, string> = { dark: "midnight", light: "light" };
