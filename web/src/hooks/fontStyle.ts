// Global UI font. Sets --font-ui on the document root (body/theme rules read it,
// see index.css). Browser-local (localStorage), like the theme selection.
// "" = default (let the theme decide: sans normally, mono for square themes).

export interface FontOption {
  id: string;
  label: string;
  stack: string; // "" for the theme default
}

export const FONT_OPTIONS: FontOption[] = [
  { id: "default", label: "System", stack: "" },
  {
    id: "grotesk",
    label: "Grotesk",
    stack: `"Inter", "Segoe UI", "Helvetica Neue", system-ui, sans-serif`,
  },
  {
    id: "rounded",
    label: "Rounded",
    stack: `ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Quicksand", "Varela Round", system-ui, sans-serif`,
  },
  {
    id: "humanist",
    label: "Humanist",
    stack: `"Segoe UI", Candara, Optima, "Trebuchet MS", system-ui, sans-serif`,
  },
  {
    id: "serif",
    label: "Serif",
    stack: `"Iowan Old Style", "Palatino Linotype", Georgia, Cambria, "Times New Roman", serif`,
  },
  {
    id: "mono",
    label: "Mono",
    stack: `ui-monospace, "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace`,
  },
];

const KEY = "axboard-font";

export function loadFont(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "default";
  } catch {
    return "default";
  }
}

export function applyFont(id: string) {
  const opt = FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0];
  const st = document.documentElement.style;
  if (opt.stack) st.setProperty("--font-ui", opt.stack);
  else st.removeProperty("--font-ui");
}

export function saveFont(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // ignore quota / private mode
  }
  applyFont(id);
}
