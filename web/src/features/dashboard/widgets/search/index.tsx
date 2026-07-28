import { useState } from "react";
import type {
  SearchConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Search widget — a prominent search box that opens a chosen engine (or a
// custom {q} URL template). Distinct from the ⌘K spotlight.
// ---------------------------------------------------------------------------

const ENGINES: Record<string, { label: string; url: string }> = {
  google: { label: "Google", url: "https://www.google.com/search?q={q}" },
  duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/?q={q}" },
  bing: { label: "Bing", url: "https://www.bing.com/search?q={q}" },
};

// Bang prefixes: type "g cats" or "!yt lofi" to jump to a specific engine.
const BANGS: Record<string, string> = {
  g: "https://www.google.com/search?q={q}",
  ddg: "https://duckduckgo.com/?q={q}",
  gh: "https://github.com/search?q={q}",
  gl: "https://gitlab.com/search?search={q}",
  yt: "https://www.youtube.com/results?search_query={q}",
  w: "https://en.wikipedia.org/wiki/Special:Search?search={q}",
  npm: "https://www.npmjs.com/search?q={q}",
  aw: "https://wiki.archlinux.org/index.php?search={q}",
  gm: "https://www.google.com/maps/search/{q}",
};

function SearchComponent({ config }: WidgetProps<SearchConfig>) {
  const [q, setQ] = useState("");
  const engine = config?.engine ?? "duckduckgo";
  const template =
    engine === "custom" ? (config?.customUrl ?? "") : (ENGINES[engine]?.url ?? ENGINES.duckduckgo.url);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = q.trim();
    if (!raw) return;
    // Bang: first token like "g" or "!yt" picks an engine, the rest is the query.
    let tpl = template;
    let query = raw;
    const m = raw.match(/^!?([a-z]+)\s+(.+)$/i);
    if (m && BANGS[m[1].toLowerCase()]) {
      tpl = BANGS[m[1].toLowerCase()];
      query = m[2];
    }
    if (!tpl.includes("{q}")) return;
    window.open(tpl.replace("{q}", encodeURIComponent(query)), "_blank", "noopener,noreferrer");
    setQ("");
  };

  return (
    <form onSubmit={submit} className="h-full flex items-center px-3">
      <div className="relative w-full">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={config?.placeholder || `Search ${engine === "custom" ? "" : (ENGINES[engine]?.label ?? "")}…`}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-card border border-border text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
    </form>
  );
}

function SearchConfigPanel({ config, save }: WidgetConfigProps<SearchConfig>) {
  const engine = config?.engine ?? "duckduckgo";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Engine
        </label>
        <select
          value={engine}
          onChange={(e) => save({ engine: e.target.value as SearchConfig["engine"] })}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        >
          <option value="duckduckgo">DuckDuckGo</option>
          <option value="google">Google</option>
          <option value="bing">Bing</option>
          <option value="custom">Custom…</option>
        </select>
      </div>
      {engine === "custom" && (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
            Custom URL (use {"{q}"})
          </label>
          <input
            value={config?.customUrl ?? ""}
            onChange={(e) => save({ customUrl: e.target.value })}
            placeholder="https://searx.lan/search?q={q}"
            className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Placeholder
        </label>
        <input
          value={config?.placeholder ?? ""}
          onChange={(e) => save({ placeholder: e.target.value })}
          placeholder="Search the web…"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

const SearchIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const definition: WidgetDefinition<SearchConfig> = {
  type: "search",
  title: "Search",
  icon: SearchIcon,
  category: "productivity",
  description: "A search box that opens your chosen engine (or a custom URL).",
  minW: 2,
  minH: 1,
  maxW: 12,
  maxH: 2,
  defaultW: 4,
  defaultH: 1,
  defaultConfig: { engine: "duckduckgo" },
  Component: SearchComponent,
  ConfigPanel: SearchConfigPanel,
};

export default definition;
