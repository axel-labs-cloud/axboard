import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SkeletonLines } from "../../../../components/Skeleton";
import { useSize } from "../useSize";
import { timeAgo, isRecent } from "../../../../lib/time";
import type {
  ReleasesConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Release-watch — latest release/tag of GitHub or GitLab repos, so you know
// when a self-hosted app has an update. Repos: "gh:owner/repo" (default) or
// "gl:group/project". Fetched through the server proxy.
// ---------------------------------------------------------------------------

interface Rel {
  repo: string;
  tag?: string;
  date?: string;
  url?: string;
  error?: boolean;
}

async function fetchOne(spec: string): Promise<Rel> {
  const gl = spec.startsWith("gl:");
  const path = spec.replace(/^(gh|gl):/, "");
  try {
    if (gl) {
      const api = `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}/releases?per_page=1`;
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(api)}`);
      const arr = await r.json();
      const rel = Array.isArray(arr) ? arr[0] : null;
      if (!rel) return { repo: path, error: true };
      return { repo: path, tag: rel.tag_name, date: rel.released_at, url: rel._links?.self };
    }
    const api = `https://api.github.com/repos/${path}/releases/latest`;
    const r = await fetch(`/api/proxy?url=${encodeURIComponent(api)}`);
    if (!r.ok) return { repo: path, error: true };
    const rel = await r.json();
    return { repo: path, tag: rel.tag_name, date: rel.published_at, url: rel.html_url };
  } catch {
    return { repo: path, error: true };
  }
}

function ReleasesComponent({ config, editing }: WidgetProps<ReleasesConfig>) {
  const repos = config?.repos ?? [];
  const box = useSize<HTMLDivElement>();
  const { data, isLoading } = useQuery({
    queryKey: ["releases", repos.join("|")],
    enabled: repos.length > 0,
    refetchInterval: 60 * 60_000,
    queryFn: () => Promise.all(repos.map(fetchOne)),
  });

  if (repos.length === 0) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Add repos (gh:owner/repo or gl:group/project) in config.
      </div>
    );
  }
  if (isLoading) {
    return (
      <div ref={box.ref} className="h-full">
        <SkeletonLines rows={Math.min(repos.length, 4)} />
      </div>
    );
  }

  const showDate = box.w >= 190; // secondary date line only when there's room

  return (
    <div ref={box.ref} className="h-full overflow-auto p-2 divide-y divide-border-subtle">
      {(data ?? []).map((rel) => {
        const inner = (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-text-secondary truncate">{rel.repo}</div>
              {showDate && rel.date && (
                <div className="text-[10px] text-text-muted">
                  {timeAgo(rel.date)}
                </div>
              )}
            </div>
            <span
              className={`text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                rel.error ? "text-text-muted" : isRecent(rel.date, 7) ? "bg-accent text-white" : "bg-accent/10 text-accent"
              }`}
            >
              {rel.error ? "—" : rel.tag}
            </span>
          </>
        );
        const cls = "flex items-center gap-2 px-1.5 py-1.5 rounded";
        return editing || !rel.url ? (
          <div key={rel.repo} className={cls}>{inner}</div>
        ) : (
          <a key={rel.repo} href={rel.url} target="_blank" rel="noreferrer noopener" className={`${cls} hover:bg-bg-hover`}>{inner}</a>
        );
      })}
    </div>
  );
}

function ReleasesConfigPanel({ config, save }: WidgetConfigProps<ReleasesConfig>) {
  const repos = config?.repos ?? [];
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ full_name: string; stargazers_count: number; description?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(term)}&per_page=6&sort=stars`;
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      const d = await r.json();
      setHits(d.items ?? []);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };
  const add = (full: string) => {
    const spec = `gh:${full}`;
    if (!repos.includes(spec)) save({ repos: [...repos, spec] });
    setQ("");
    setHits([]);
  };
  const stars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Find a GitHub repo
        </label>
        <div className="flex gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
            placeholder="jellyfin, immich, gitea…"
            className="flex-1 min-w-0 px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button onClick={search} disabled={busy || !q.trim()} className="px-3 py-1.5 text-[11px] rounded border border-border text-text-secondary hover:text-text disabled:opacity-40">
            {busy ? "…" : "Search"}
          </button>
        </div>
        {(busy || hits.length > 0) && q.trim() && (
          <div className="rounded border border-border-subtle bg-bg-card/40 max-h-44 overflow-auto divide-y divide-border-subtle">
            {busy && hits.length === 0 && <div className="px-2 py-2 text-[11px] text-text-muted">Searching…</div>}
            {hits.map((h) => {
              const already = repos.includes(`gh:${h.full_name}`);
              return (
                <button
                  key={h.full_name}
                  onClick={() => add(h.full_name)}
                  disabled={already}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-bg-hover disabled:opacity-40"
                >
                  <span className="text-[12px] text-text truncate flex-1">{h.full_name}</span>
                  <span className="text-[10px] font-mono text-text-muted shrink-0">★ {stars(h.stargazers_count)}</span>
                  {already && <span className="text-[10px] text-up shrink-0">added</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Repos (one per line)
        </label>
        <textarea
          value={repos.join("\n")}
          onChange={(e) => save({ repos: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          rows={5}
          placeholder={"gh:gethomepage/homepage\ngl:gitlab-org/gitlab\ngh:jellyfin/jellyfin"}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono resize-y"
        />
        <p className="text-[11px] text-text-muted">Search adds GitHub repos; edit here or prefix gl: for GitLab.</p>
      </div>
    </div>
  );
}

const ReleasesIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const definition: WidgetDefinition<ReleasesConfig> = {
  type: "releases",
  title: "Releases",
  icon: ReleasesIcon,
  category: "external",
  description: "Latest GitHub/GitLab releases for repos you watch.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 10,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: { repos: [] },
  Component: ReleasesComponent,
  ConfigPanel: ReleasesConfigPanel,
};

export default definition;
