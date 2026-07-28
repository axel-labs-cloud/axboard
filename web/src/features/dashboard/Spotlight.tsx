import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Config } from "../../api/types";
import { SimpleIcon } from "./SimpleIcon";

export interface SpotlightAction {
  label: string;
  subtitle?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actions?: SpotlightAction[];
}

interface Result {
  kind: "action" | "app" | "bookmark" | "engine";
  label: string;
  subtitle?: string;
  icon?: string;
  url?: string;
  run?: () => void;
}

// Hardcoded engine list for v1. Will move to a top-level config field once
// the user has a preference for which to include.
const ENGINES: { name: string; url: string }[] = [
  { name: "Google", url: "https://www.google.com/search?q=" },
  { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  { name: "GitHub", url: "https://github.com/search?q=" },
  { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search=" },
];

// Search "bangs": `g foo`, `!yt foo`, `gh foo` → jump straight to that engine.
const BANGS: Record<string, { name: string; url: string }> = {
  g: { name: "Google", url: "https://www.google.com/search?q=" },
  ddg: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  gh: { name: "GitHub", url: "https://github.com/search?q=" },
  yt: { name: "YouTube", url: "https://www.youtube.com/results?search_query=" },
  w: { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search=" },
  npm: { name: "npm", url: "https://www.npmjs.com/search?q=" },
  mdn: { name: "MDN", url: "https://developer.mozilla.org/en-US/search?q=" },
  so: { name: "Stack Overflow", url: "https://stackoverflow.com/search?q=" },
  gm: { name: "Google Maps", url: "https://www.google.com/maps/search/" },
};

function score(haystack: string, q: string): number {
  if (!q) return 1;
  const h = haystack.toLowerCase();
  const idx = h.indexOf(q);
  if (idx === -1) return 0;
  // Prefix matches rank highest.
  return idx === 0 ? 3 : 2;
}

export function Spotlight({ open, onClose, actions = [] }: Props) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      // Focus after the modal mounts.
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const cfg = qc.getQueryData<Config>(["config"]);

  // Apps from config.yaml.
  const appResults = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const apps = cfg?.apps ?? [];
    const scored = apps
      .map((a) => {
        const s = Math.max(score(a.name, q), score(a.description ?? "", q) * 0.5);
        return { a, s };
      })
      .filter(({ s }) => s > 0)
      .sort((x, y) => y.s - x.s);
    return scored.slice(0, 8).map<Result>(({ a }) => ({
      kind: "app",
      label: a.name,
      subtitle: a.description,
      icon: a.icon,
      url: a.url,
    }));
  }, [cfg, query]);

  // Bookmarks from all dashboards (Shortcut widget configs).
  const bookmarkResults = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];
    for (const d of cfg?.dashboards ?? []) {
      for (const w of d.widgets ?? []) {
        if (w.type !== "shortcut") continue;
        const sc = (w.config as { shortcuts?: { label?: string; url?: string; icon?: string }[] })
          ?.shortcuts;
        if (!sc) continue;
        for (const s of sc) {
          const label = s.label ?? s.url ?? "";
          if (!s.url || !label) continue;
          if (score(label, q) > 0 || score(s.url, q) > 0) {
            out.push({
              kind: "bookmark",
              label,
              subtitle: s.url,
              icon: s.icon,
              url: s.url,
            });
          }
        }
      }
    }
    return out.slice(0, 8);
  }, [cfg, query]);

  // Web search engines (only when there's a query). A leading bang (`g …`,
  // `!yt …`, `gh …`) jumps straight to that engine as the top result.
  const engineResults = useMemo<Result[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const m = q.match(/^!?([a-z]+)\s+(.+)$/i);
    const bang = m ? BANGS[m[1].toLowerCase()] : undefined;
    if (bang && m) {
      const term = m[2];
      return [
        {
          kind: "engine",
          label: bang.name,
          subtitle: `Search "${term}"`,
          url: bang.url + encodeURIComponent(term),
        },
      ];
    }
    return ENGINES.map<Result>((e) => ({
      kind: "engine",
      label: e.name,
      subtitle: `Search for "${q}"`,
      url: e.url + encodeURIComponent(q),
    }));
  }, [query]);

  // Command actions (theme, add widget, jump dashboard…) — matched by label.
  const actionResults = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return actions
      .map((a) => ({ a, s: score(a.label, q) }))
      .filter(({ s }) => s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 8)
      .map<Result>(({ a }) => ({
        kind: "action",
        label: a.label,
        subtitle: a.subtitle,
        run: a.run,
      }));
  }, [actions, query]);

  const results = useMemo(() => {
    const m = query.trim().match(/^!?([a-z]+)\s+.+$/i);
    const bangActive = !!m && !!BANGS[m[1].toLowerCase()];
    // With an explicit bang, the engine jump is the intent → put it first.
    return bangActive
      ? [...engineResults, ...actionResults, ...appResults, ...bookmarkResults]
      : [...actionResults, ...appResults, ...bookmarkResults, ...engineResults];
  }, [query, actionResults, appResults, bookmarkResults, engineResults]);

  useEffect(() => setSelected(0), [query]);

  // Scroll the selected row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-row="${selected}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const launch = (r: Result) => {
    if (r.kind === "action") {
      r.run?.();
    } else if (r.url) {
      window.open(r.url, "_blank", "noopener");
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, Math.max(0, results.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[selected];
        if (r) launch(r);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, selected, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-start justify-center p-6 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-bg-elevated border border-border rounded-lg shadow-2xl ring-1 ring-white/5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 text-text-muted shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps, bookmarks, or the web…"
            className="flex-1 py-3 text-[14px] bg-transparent text-text placeholder:text-text-muted focus:outline-none"
          />
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-auto py-1">
          {results.length === 0 ? (
            <div className="text-center text-text-muted text-[12px] py-8">
              {query ? "No matches" : "Start typing to search"}
            </div>
          ) : (
            <ResultList results={results} selected={selected} onLaunch={launch} onHover={setSelected} />
          )}
        </div>

        <div className="border-t border-border-subtle px-3 py-1.5 flex items-center gap-4 text-[10px] text-text-muted">
          <KbdHint keys={["↑", "↓"]} label="navigate" />
          <KbdHint keys={["↵"]} label="open" />
          <KbdHint keys={["esc"]} label="close" />
          <span className="ml-auto text-text-muted/60">
            {results.length} {results.length === 1 ? "result" : "results"}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ResultList({
  results,
  selected,
  onLaunch,
  onHover,
}: {
  results: Result[];
  selected: number;
  onLaunch: (r: Result) => void;
  onHover: (i: number) => void;
}) {
  // Group by kind for tiny section labels.
  const groups: { kind: Result["kind"]; rows: { r: Result; i: number }[] }[] = [];
  let current: { kind: Result["kind"]; rows: { r: Result; i: number }[] } | null = null;
  results.forEach((r, i) => {
    if (!current || current.kind !== r.kind) {
      current = { kind: r.kind, rows: [] };
      groups.push(current);
    }
    current.rows.push({ r, i });
  });

  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi}>
          <div className="px-4 pt-2 pb-1 text-[9px] uppercase tracking-[0.12em] text-text-muted/70 font-semibold">
            {g.kind === "action"
              ? "Commands"
              : g.kind === "app"
                ? "Apps"
                : g.kind === "bookmark"
                  ? "Bookmarks"
                  : "Search the web"}
          </div>
          {g.rows.map(({ r, i }) => (
            <button
              key={i}
              data-row={i}
              onMouseEnter={() => onHover(i)}
              onClick={() => onLaunch(r)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left ${
                i === selected ? "bg-accent/15" : ""
              }`}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {r.icon ? (
                  <SimpleIcon slug={r.icon} fill />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5 text-text-muted"
                  >
                    {r.kind === "engine" ? (
                      <>
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </>
                    ) : (
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                    )}
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text truncate">{r.label}</div>
                {r.subtitle && (
                  <div className="text-[11px] text-text-muted truncate">{r.subtitle}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

function KbdHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="px-1 py-0.5 rounded bg-bg-card border border-border-subtle font-mono text-[9px]"
        >
          {k}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}
