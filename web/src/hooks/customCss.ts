// Global custom CSS escape hatch. Persisted in localStorage and injected into a
// managed <style> element. Browser-local; power-user feature.

const KEY = "axboard-custom-css";
const STYLE_ID = "axboard-custom-css";

export function loadCustomCss(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function applyCustomCss(css: string) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function saveCustomCss(css: string) {
  try {
    window.localStorage.setItem(KEY, css);
  } catch {
    // ignore quota / private mode
  }
  applyCustomCss(css);
}
