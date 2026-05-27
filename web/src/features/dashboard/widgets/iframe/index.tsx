import { useEffect, useState } from "react";
import type {
  IframeConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Iframe / Embed widget. Drops any URL into the dashboard.
// Iframe blocking from X-Frame-Options or CSP is not reliably observable
// (the load event fires either way), so the widget always renders an
// "open in new tab" link in the title bar as a fallback path.
// ---------------------------------------------------------------------------

function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function IframeComponent({ config, editing }: WidgetProps<IframeConfig>) {
  const url = safeUrl(config?.url);
  const refreshSec = config?.refreshSec ?? 0;
  const hideTitleBar = config?.hideTitleBar ?? false;
  const [nonce, setNonce] = useState(0);

  // Periodic refresh — bump a nonce so the iframe key changes and React
  // remounts the element (which forces a fresh GET on the URL).
  useEffect(() => {
    if (!url || !refreshSec || refreshSec < 5) return;
    const id = window.setInterval(() => setNonce((n) => n + 1), refreshSec * 1000);
    return () => window.clearInterval(id);
  }, [url, refreshSec]);

  if (!url) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted/60 gap-1.5 p-3 text-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
        </svg>
        <span className="text-[11px] text-text-secondary font-medium">No URL configured</span>
        <span className="text-[10px] text-text-muted/70 max-w-[200px] leading-snug">
          Set one in the widget config to embed a page here.
        </span>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      {!hideTitleBar && (
        <div className="shrink-0 flex items-center gap-2 px-2.5 py-1 border-b border-border-subtle text-[10px] text-text-muted">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3 shrink-0"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
          </svg>
          <span className="font-mono truncate flex-1">{hostOf(url)}</span>
          <button
            onClick={() => setNonce((n) => n + 1)}
            title="Reload"
            className="w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-bg-hover"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            title="Open in new tab"
            className="w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-bg-hover"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      )}
      <div className="flex-1 min-h-0 relative bg-bg">
        <iframe
          key={nonce}
          src={url}
          // Disabling pointer-events on the iframe while editing keeps the
          // grid-drag responsive; without this, the iframe captures the
          // mousedown and you can't drag the widget.
          className={`absolute inset-0 w-full h-full border-0 bg-bg ${
            editing ? "pointer-events-none" : ""
          }`}
          referrerPolicy="no-referrer"
          loading="lazy"
          title={hostOf(url)}
        />
      </div>
    </div>
  );
}

function IframeConfigPanel({ config, save }: WidgetConfigProps<IframeConfig>) {
  const url = config?.url ?? "";
  const refreshSec = config?.refreshSec ?? 0;
  const hideTitleBar = config?.hideTitleBar ?? false;
  const parsedUrl = safeUrl(url);
  const urlInvalid = url.trim().length > 0 && !parsedUrl;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          URL
        </label>
        <input
          value={url}
          onChange={(e) => save({ url: e.target.value })}
          placeholder="https://grafana.example.com/d/foo"
          className={`w-full px-2.5 py-1.5 text-[12px] font-mono bg-bg-card border rounded text-text focus:outline-none ${
            urlInvalid
              ? "border-rose-500/50 focus:border-rose-500"
              : "border-border focus:border-accent/50"
          }`}
        />
        {urlInvalid && (
          <span className="text-[10px] text-rose-400">
            Needs to be an http:// or https:// URL.
          </span>
        )}
        <span className="block text-[10px] text-text-muted/70 leading-snug">
          Some sites send <span className="font-mono">X-Frame-Options</span> or a CSP{" "}
          <span className="font-mono">frame-ancestors</span> header that blocks iframing — if the
          embed comes up blank, that's why.
        </span>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Auto-reload
        </label>
        <select
          value={refreshSec}
          onChange={(e) => save({ refreshSec: Number(e.target.value) })}
          className="w-full px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
        >
          <option value={0}>Off</option>
          <option value={30}>Every 30s</option>
          <option value={60}>Every minute</option>
          <option value={300}>Every 5 minutes</option>
          <option value={900}>Every 15 minutes</option>
          <option value={3600}>Every hour</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={hideTitleBar}
          onChange={(e) => save({ hideTitleBar: e.target.checked })}
          className="accent-accent"
        />
        Hide title bar (host + reload + open-in-new-tab)
      </label>
    </div>
  );
}

const IframeIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <circle cx="6" cy="6.5" r="0.5" fill="currentColor" />
    <circle cx="8" cy="6.5" r="0.5" fill="currentColor" />
  </svg>
);

const def: WidgetDefinition<IframeConfig> = {
  type: "iframe",
  title: "Embed",
  icon: IframeIcon,
  category: "external",
  description: "Embed any web page in an iframe. Grafana panels, status pages, dashboards, etc.",
  minW: 2,
  minH: 2,
  maxW: 24,
  maxH: 24,
  defaultW: 4,
  defaultH: 4,
  defaultConfig: {},
  Component: IframeComponent,
  ConfigPanel: IframeConfigPanel,
};

export default def;
