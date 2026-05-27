import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SimpleIcon } from "../../SimpleIcon";

interface Props {
  open: boolean;
  current?: string;
  onClose: () => void;
  onSelect: (slug: string) => void;
}

type Tab = "selfhst" | "url" | "none";

// Fetch the selfh.st icon list via GitHub's tree API. ~6800 icons, returned
// in one request. Cached for a day.
async function fetchSelfhstIcons(): Promise<string[]> {
  const r = await fetch(
    "https://api.github.com/repos/selfhst/icons/git/trees/main?recursive=1",
  );
  if (!r.ok) throw new Error(`GitHub tree API: ${r.status}`);
  const data = (await r.json()) as { tree: { path: string; type: string }[] };
  return data.tree
    .filter((t) => t.type === "blob" && t.path.startsWith("svg/") && t.path.endsWith(".svg"))
    .map((t) => t.path.slice(4, -4))
    // Hide -dark / -light variants from the default browse — the bare slug
    // covers them; user can still type the variant in by hand.
    .filter((s) => !s.endsWith("-dark") && !s.endsWith("-light"))
    .sort();
}

export function IconPicker({ open, current, onClose, onSelect }: Props) {
  const initialTab: Tab = current?.startsWith("http") ? "url" : current === "" ? "none" : "selfhst";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  const [urlInput, setUrlInput] = useState(current?.startsWith("http") ? current : "");
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: icons = [], isLoading, error } = useQuery({
    queryKey: ["selfhst-icons"],
    queryFn: fetchSelfhstIcons,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: open,
  });

  // Reset & focus search when opening.
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setSearch("");
      setUrlInput(current?.startsWith("http") ? current : "");
      // Focus the search box after the modal renders.
      const t = window.setTimeout(() => searchRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return icons.slice(0, 60);
    // Prefix matches first, then substring.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const s of icons) {
      const lower = s.toLowerCase();
      if (lower.startsWith(q)) starts.push(s);
      else if (lower.includes(q)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, 80);
  }, [icons, search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div className="text-[13px] font-semibold text-text">Choose icon</div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text w-6 h-6 flex items-center justify-center"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex border-b border-border-subtle">
          {(["selfhst", "url", "none"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 py-2 text-[12px] font-medium transition-colors ${
                tab === t ? "text-text" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab === t && <span className="absolute bottom-0 left-0 right-0 h-px bg-accent" />}
              {t === "selfhst" ? "selfh.st" : t === "url" ? "Custom URL" : "None"}
            </button>
          ))}
        </div>

        {tab === "selfhst" && (
          <>
            <div className="px-4 py-3 border-b border-border-subtle">
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search icons..."
                className="w-full px-3 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text placeholder-text-muted focus:outline-none focus:border-accent/50"
              />
              <div className="mt-1.5 text-[10px] text-text-muted">
                {isLoading
                  ? "Loading…"
                  : error
                    ? `Failed to fetch icon list: ${(error as Error).message}`
                    : `${icons.length.toLocaleString()} icons · showing ${filtered.length}`}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {filtered.length === 0 ? (
                <div className="text-center text-text-muted text-[12px] py-8">
                  No matches{search ? ` for "${search}"` : ""}.
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
                  {filtered.map((slug) => {
                    const value = `sh:${slug}`;
                    const active = current === value;
                    return (
                      <button
                        key={slug}
                        onClick={() => {
                          onSelect(value);
                          onClose();
                        }}
                        className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded border transition-colors ${
                          active
                            ? "border-accent/50 bg-accent/15"
                            : "border-transparent hover:border-border hover:bg-bg-card/60"
                        }`}
                        title={slug}
                      >
                        <div className="w-7 h-7 flex items-center justify-center">
                          <SimpleIcon slug={value} fill />
                        </div>
                        <span className="text-[9px] text-text-muted truncate w-full text-center">
                          {slug}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {tab === "url" && (
          <div className="flex-1 p-4 space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
              Custom icon URL
            </label>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/icon.svg"
              className="w-full px-3 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
            />
            {urlInput && (
              <div className="flex items-center gap-3 p-3 bg-bg-card/60 border border-border-subtle rounded">
                <div className="w-10 h-10 flex items-center justify-center">
                  <SimpleIcon slug={urlInput} fill />
                </div>
                <span className="text-[11px] text-text-muted truncate">{urlInput}</span>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  onSelect(urlInput);
                  onClose();
                }}
                disabled={!urlInput.trim()}
                className="px-3 py-1.5 text-[12px] rounded border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Use URL
              </button>
            </div>
          </div>
        )}

        {tab === "none" && (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-10 h-10 rounded-md bg-purple-900/40 flex items-center justify-center text-[11px] font-semibold text-text">
              IN
            </div>
            <div className="text-[12px] text-text">Initials chip</div>
            <div className="text-[11px] text-text-muted max-w-xs">
              No icon — render a colored chip with the first two letters of the service name.
            </div>
            <button
              onClick={() => {
                onSelect("");
                onClose();
              }}
              className="mt-2 px-3 py-1.5 text-[12px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted"
            >
              Use initials
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
