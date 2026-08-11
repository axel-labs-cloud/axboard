import { useEffect, useRef, useState } from "react";
import type { GrafanaConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

function hostOf(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

const hasParam = (url: string, k: string) => new RegExp(`[?&]${k}([=&]|$)`).test(url);
const addParam = (url: string, k: string, v = "") => (hasParam(url, k) ? url : `${url}${url.includes("?") ? "&" : "?"}${k}${v ? `=${v}` : ""}`);

// True when the dashboard's background is dark (so the Grafana panel can match).
function isDarkBg(): boolean {
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim();
    const m = bg.match(/\d+/g);
    let r = 10, g = 10, b = 10;
    if (bg.startsWith("#")) {
      const h = bg.length === 4 ? bg.slice(1).replace(/(.)/g, "$1$1") : bg.slice(1);
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    } else if (m && m.length >= 3) {
      [r, g, b] = m.map(Number);
    }
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Grafana panel embed — an iframe pointed at a Grafana panel share/kiosk URL.
// Grafana must allow embedding (allow_embedding = true, and anonymous access or
// a shared/public panel). Refreshes on an interval by remounting the frame.
// ---------------------------------------------------------------------------

function GrafanaComponent({ config, editing }: WidgetProps<GrafanaConfig>) {
  const url = config?.url?.trim();
  const sec = config?.refreshSec ?? 0;
  const nativeRefresh = sec > 0; // let Grafana refresh itself (no flickery remount)
  const [nonce, setNonce] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // Only remount when NOT using Grafana's built-in refresh param.
    if (!url || sec <= 0 || nativeRefresh) return;
    timer.current = window.setInterval(() => setNonce((n) => n + 1), sec * 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [url, sec, nativeRefresh]);

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        {editing ? "Open config → paste a Grafana panel URL." : "No panel configured."}
      </div>
    );
  }

  // Build the embed URL: match the dashboard theme, add kiosk for d-solo panels,
  // and use Grafana's own refresh param when set.
  let src = url;
  if (config?.matchTheme !== false) src = addParam(src, "theme", isDarkBg() ? "dark" : "light");
  if (url.includes("/d-solo/")) src = addParam(src, "kiosk");
  if (nativeRefresh) src = addParam(src, "refresh", `${sec}s`);
  else src = `${src}${src.includes("?") ? "&" : "?"}_n=${nonce}`;

  const title = config?.title?.trim();
  const hideChrome = config?.hideChrome === true;
  return (
    <div className="relative h-full w-full bg-bg flex flex-col">
      {/* Title bar with an open-in-Grafana fallback: Grafana often refuses
          embedding, leaving a blank iframe with no way out otherwise. */}
      <div className={`shrink-0 items-center gap-2 px-3 py-1.5 border-b border-border-subtle ${hideChrome ? "hidden group-hover/w:flex absolute inset-x-0 top-0 z-10 bg-bg-elevated/90 backdrop-blur-sm" : "flex"}`}>
        <span className="text-[12px] font-medium text-text-secondary truncate flex-1 font-mono">{title || hostOf(url)}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title="Open in Grafana"
          aria-label="Open in Grafana"
          className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></svg>
        </a>
      </div>
      <iframe
        key={nonce}
        src={src}
        title={title || "Grafana panel"}
        className="w-full flex-1 border-0"
        style={{ pointerEvents: editing ? "none" : undefined }}
      />
    </div>
  );
}

function GrafanaConfigPanel({ config, save }: WidgetConfigProps<GrafanaConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Panel URL</label>
        <textarea
          value={config?.url ?? ""}
          onChange={(e) => save({ url: e.target.value })}
          rows={3}
          placeholder="http://grafana.lan/d-solo/abc/board?panelId=2&kiosk"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent resize-y font-mono"
        />
        <p className="text-[11px] text-text-muted leading-snug">
          Use a panel's <span className="font-mono">Share → Embed</span> URL (d-solo/…), or a dashboard
          URL with <span className="font-mono">&kiosk</span>. Grafana needs <span className="font-mono">allow_embedding=true</span>.
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Title (optional)</label>
        <input
          value={config?.title ?? ""}
          onChange={(e) => save({ title: e.target.value })}
          placeholder="e.g. Cluster CPU"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Auto-refresh (seconds, 0 = off)</label>
        <input
          value={String(config?.refreshSec ?? 0)}
          onChange={(e) => save({ refreshSec: Math.max(0, parseInt(e.target.value) || 0) })}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        />
        <p className="text-[10px] text-text-muted">Uses Grafana's own <span className="font-mono">&refresh</span> — no reload flicker.</p>
      </div>
      <div className="flex gap-1.5">
        {(
          [
            ["matchTheme", config?.matchTheme !== false, () => save({ matchTheme: config?.matchTheme === false }), "Match theme"],
            ["hideChrome", config?.hideChrome === true, () => save({ hideChrome: !(config?.hideChrome === true) }), "Hide title bar"],
          ] as const
        ).map(([k, on, toggle, label]) => (
          <button
            key={k}
            onClick={toggle}
            className={`flex-1 px-2 py-1.5 text-[11px] rounded border transition-colors ${on ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const GrafanaIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M3 3v18h18" /><path d="M7 15l3-4 3 2 5-7" />
  </svg>
);

const definition: WidgetDefinition<GrafanaConfig> = {
  type: "grafana",
  title: "Grafana panel",
  icon: GrafanaIcon,
  category: "services",
  description: "Embed a live Grafana panel or kiosk dashboard by URL.",
  minW: 3,
  minH: 2,
  maxW: 12,
  maxH: 12,
  defaultW: 5,
  defaultH: 4,
  defaultConfig: {},
  Component: GrafanaComponent,
  ConfigPanel: GrafanaConfigPanel,
};

export default definition;
