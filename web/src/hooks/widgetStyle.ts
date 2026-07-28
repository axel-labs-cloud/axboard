// Global widget-surface style — transparency, backdrop blur, corner radius and
// border. Applied by setting --widget-* custom props on the document root (the
// .widget-card rule in index.css reads them). Browser-local (localStorage),
// like the theme selection, so it layers over any theme.

export interface WidgetStyle {
  opacity: number; // 0-100 (%)
  blur: number; // px
  radius: number; // px
  border: boolean;
}

const KEY = "axboard-widget-style";

export const DEFAULT_WIDGET_STYLE: WidgetStyle = { opacity: 100, blur: 0, radius: 8, border: true };

export function loadWidgetStyle(): WidgetStyle {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_WIDGET_STYLE };
    return { ...DEFAULT_WIDGET_STYLE, ...(JSON.parse(raw) as Partial<WidgetStyle>) };
  } catch {
    return { ...DEFAULT_WIDGET_STYLE };
  }
}

export function applyWidgetStyle(s: WidgetStyle) {
  const st = document.documentElement.style;
  st.setProperty("--widget-opacity", `${s.opacity}%`);
  st.setProperty("--widget-blur", `${s.blur}px`);
  st.setProperty("--widget-radius", `${s.radius}px`);
  st.setProperty("--widget-border-width", s.border ? "1px" : "0px");
}

export function saveWidgetStyle(s: WidgetStyle) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore quota / private mode
  }
  applyWidgetStyle(s);
}
