import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import type { ArrConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Sonarr / Radarr widget — download queue + upcoming calendar via the shared
// authenticated /api/fetch proxy (X-Api-Key). One widget for both apps: their
// v3 API shapes are near-identical; we read whichever fields are present.
// ---------------------------------------------------------------------------

interface QueueRecord {
  title?: string;
  status?: string;
  trackedDownloadState?: string;
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  series?: { title?: string };
  movie?: { title?: string };
  episode?: { seasonNumber?: number; episodeNumber?: number; title?: string };
}
interface QueueResp {
  records?: QueueRecord[];
  totalRecords?: number;
}
interface CalItem {
  title?: string;
  airDateUtc?: string;
  inCinemas?: string;
  digitalRelease?: string;
  hasFile?: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  series?: { title?: string };
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const pad = (n?: number) => String(n ?? 0).padStart(2, "0");

function queueLabel(r: QueueRecord): string {
  if (r.series?.title) {
    const ep = r.episode ? ` S${pad(r.episode.seasonNumber)}E${pad(r.episode.episodeNumber)}` : "";
    return `${r.series.title}${ep}`;
  }
  return r.movie?.title ?? r.title ?? "Item";
}
function calLabel(c: CalItem): string {
  if (c.series?.title) return `${c.series.title} S${pad(c.seasonNumber)}E${pad(c.episodeNumber)}`;
  return c.title ?? "Item";
}
function calWhen(c: CalItem): string | undefined {
  return c.airDateUtc ?? c.digitalRelease ?? c.inCinemas;
}

function ArrComponent({ config, h }: WidgetProps<ArrConfig>) {
  const kind = config?.kind ?? "sonarr";
  const b = base(config?.baseUrl);
  const key = config?.apiKey?.trim();
  const title = config?.title?.trim() || (kind === "radarr" ? "Radarr" : "Sonarr");
  const days = config?.days ?? 7;
  const ready = !!b && !!key;

  const headers = { "X-Api-Key": key ?? "" };
  const q = useQuery({
    queryKey: ["arr-queue", b, key],
    enabled: ready,
    refetchInterval: 15_000,
    queryFn: () =>
      api.fetchJson<QueueResp>({ url: `${b}/api/v3/queue?pageSize=50&includeUnknownSeriesItems=true`, headers }),
  });
  const cal = useQuery({
    queryKey: ["arr-cal", b, key, days],
    enabled: ready,
    refetchInterval: 300_000,
    queryFn: () => {
      const start = new Date().toISOString();
      const end = new Date(Date.now() + days * 86_400_000).toISOString();
      const inc = kind === "radarr" ? "" : "&includeSeries=true";
      return api.fetchJson<CalItem[]>({ url: `${b}/api/v3/calendar?start=${start}&end=${end}${inc}`, headers });
    },
  });

  if (!ready) {
    return (
      <EmptyState
        icon={ArrIcon}
        title={`Connect ${title}`}
        hint="Set the base URL and API key (Settings → General) in this widget's config."
      />
    );
  }
  if (q.isError) return <ErrorState message={(q.error as Error)?.message ?? "Could not reach the API."} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <SkeletonLines rows={4} />;

  const records = q.data?.records ?? [];
  const upcoming = (cal.data ?? []).filter((c) => !c.hasFile).slice(0, 6);
  const showCal = h >= 3 || records.length === 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={ArrIcon}
        title={title}
        right={<span className="text-[11px] font-mono text-text-muted">{records.length} in queue</span>}
      />
      <div className="flex-1 min-h-0 overflow-auto px-2 pb-1">
       <div className="w-full">
        {records.length === 0 && (
          <div className="text-[11px] text-text-muted px-1 py-2">Queue empty.</div>
        )}
        {records.map((r, i) => {
          const total = r.size ?? 0;
          const pct = total > 0 ? ((total - (r.sizeleft ?? 0)) / total) * 100 : 0;
          const done = (r.sizeleft ?? 1) <= 0;
          return (
            <div key={i} className="py-1 border-t border-border-subtle first:border-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] text-text-secondary truncate flex-1" title={queueLabel(r)}>{queueLabel(r)}</span>
                <span className="text-[10px] font-mono tabular-nums text-text-muted shrink-0">{done ? "done" : `${pct.toFixed(0)}%`}</span>
              </div>
              <div className="mt-1"><Meter pct={pct} color={done ? "var(--color-up)" : "var(--color-accent)"} /></div>
            </div>
          );
        })}

        {showCal && upcoming.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-text-muted px-1 mb-0.5">Upcoming</div>
            {upcoming.map((c, i) => (
              <div key={i} className="flex items-baseline gap-2 py-0.5">
                <span className="text-[11px] text-text-secondary truncate flex-1" title={calLabel(c)}>{calLabel(c)}</span>
                <span className="text-[10px] font-mono text-text-muted shrink-0">{calWhen(c) ? timeAgo(calWhen(c)) : ""}</span>
              </div>
            ))}
          </div>
        )}
       </div>
      </div>
    </div>
  );
}

function ArrConfigPanel({ config, save }: WidgetConfigProps<ArrConfig>) {
  const kind = config?.kind ?? "sonarr";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Service</label>
        <div className="grid grid-cols-2 gap-1">
          {(["sonarr", "radarr"] as const).map((k) => (
            <button
              key={k}
              onClick={() => save({ kind: k })}
              className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${
                kind === k ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <Field label="Base URL">
        <input
          value={config?.baseUrl ?? ""}
          onChange={(e) => save({ baseUrl: e.target.value })}
          placeholder={kind === "radarr" ? "http://host:7878" : "http://host:8989"}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent"
        />
      </Field>
      <Field label="API key" hint="Settings → General → API Key">
        <input
          value={config?.apiKey ?? ""}
          onChange={(e) => save({ apiKey: e.target.value })}
          placeholder="••••••••"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent"
        />
      </Field>
      <Field label="Title">
        <input
          value={config?.title ?? ""}
          onChange={(e) => save({ title: e.target.value })}
          placeholder={kind === "radarr" ? "Radarr" : "Sonarr"}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        />
      </Field>
      <p className="text-[11px] text-text-muted leading-snug">Reads the download queue + upcoming calendar. The API key stays in your config.yaml.</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold flex items-center gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal text-text-muted/70 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const ArrIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const definition: WidgetDefinition<ArrConfig> = {
  type: "arr",
  title: "Sonarr / Radarr",
  icon: ArrIcon,
  category: "services",
  description: "Download queue + upcoming calendar from Sonarr or Radarr.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { kind: "sonarr" },
  Component: ArrComponent,
  ConfigPanel: ArrConfigPanel,
};

export default definition;
