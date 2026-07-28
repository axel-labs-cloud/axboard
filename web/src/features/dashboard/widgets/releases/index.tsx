import { useQuery } from "@tanstack/react-query";
import { SkeletonLines } from "../../../../components/Skeleton";
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

function ReleasesComponent({ config }: WidgetProps<ReleasesConfig>) {
  const repos = config?.repos ?? [];
  const { data, isLoading } = useQuery({
    queryKey: ["releases", repos.join("|")],
    enabled: repos.length > 0,
    refetchInterval: 60 * 60_000,
    queryFn: () => Promise.all(repos.map(fetchOne)),
  });

  if (repos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Add repos (gh:owner/repo or gl:group/project) in config.
      </div>
    );
  }
  if (isLoading) return <SkeletonLines rows={Math.min(repos.length, 4)} />;

  return (
    <div className="h-full overflow-auto p-2 divide-y divide-border-subtle">
      {(data ?? []).map((rel) => (
        <a
          key={rel.repo}
          href={rel.url || undefined}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2 px-1.5 py-1.5 hover:bg-bg-hover rounded"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-text-secondary truncate">{rel.repo}</div>
            {rel.date && (
              <div className="text-[10px] text-text-muted">
                {new Date(rel.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
          <span
            className={`text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
              rel.error ? "text-text-muted" : "bg-accent/10 text-accent"
            }`}
          >
            {rel.error ? "—" : rel.tag}
          </span>
        </a>
      ))}
    </div>
  );
}

function ReleasesConfigPanel({ config, save }: WidgetConfigProps<ReleasesConfig>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
        Repos (one per line)
      </label>
      <textarea
        value={(config?.repos ?? []).join("\n")}
        onChange={(e) => save({ repos: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
        rows={5}
        placeholder={"gh:gethomepage/homepage\ngl:gitlab-org/gitlab\ngh:jellyfin/jellyfin"}
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono resize-y"
      />
      <p className="text-[11px] text-text-muted">Prefix gl: for GitLab; default is GitHub.</p>
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
