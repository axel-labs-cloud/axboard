import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, GroupDef, HistoryMap } from "../../../../api/types";
import type {
  StatusSummaryConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// Aggregate uptime sparkline: index-align the tail of each app's history and,
// per sample, take the fraction of apps that were healthy. Apps check on
// similar intervals so index alignment is a good-enough homelab approximation.
function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const w = 100;
  const h = 24;
  const step = w / (series.length - 1);
  const pts = series
    .map((v, i) => `${(i * step).toFixed(1)},${(h - v * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-6 shrink-0">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status summary widget — rolls up the existing /api/apps/status map into one
// "N/M up" headline plus a proportion bar. Pure liveness (no metrics engine),
// zero new backend: it reuses the ["apps-status"] query the app tiles already
// poll. Per feedback_no_emojis_in_ui, state is shown by colored bars/dots.
// ---------------------------------------------------------------------------

const SEGMENTS = [
  { key: "healthy", label: "Up", cls: "bg-emerald-400", text: "text-emerald-400" },
  { key: "degraded", label: "Degraded", cls: "bg-amber-400", text: "text-amber-400" },
  { key: "down", label: "Down", cls: "bg-rose-500", text: "text-rose-500" },
  { key: "unknown", label: "Unknown", cls: "bg-text-muted/50", text: "text-text-muted" },
] as const;

function StatusSummaryComponent({ config, h }: WidgetProps<StatusSummaryConfig>) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[]; groups?: GroupDef[] }>(["config"]);
  const groups = cfg?.groups ?? [];
  const healthApps = useMemo(
    () => (cfg?.apps ?? []).filter((a) => a.health && a.health.type !== "none"),
    [cfg?.apps],
  );

  const { data: statuses = {} } = useQuery({
    queryKey: ["apps-status"],
    queryFn: api.getStatus,
    refetchInterval: 15_000,
    enabled: healthApps.length > 0,
  });
  const { data: history = {} as HistoryMap } = useQuery({
    queryKey: ["apps-history"],
    queryFn: api.getHistory,
    refetchInterval: 15_000,
    enabled: healthApps.length > 0,
  });

  const counts = useMemo(() => {
    const c = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
    for (const a of healthApps) {
      const s = statuses[a.id]?.status;
      if (s === "healthy") c.healthy++;
      else if (s === "degraded") c.degraded++;
      else if (s === "down") c.down++;
      else c.unknown++;
    }
    return c;
  }, [healthApps, statuses]);

  // Window uptime % + index-aligned aggregate series for the sparkline.
  const { uptimePct, series } = useMemo(() => {
    const K = 30;
    let healthyPts = 0;
    let totalPts = 0;
    const tails = healthApps
      .map((a) => (history[a.id] ?? []).slice(-K))
      .filter((t) => t.length > 0);
    for (const t of tails) {
      for (const p of t) {
        totalPts++;
        if (p.status === "healthy") healthyPts++;
      }
    }
    const maxLen = tails.reduce((m, t) => Math.max(m, t.length), 0);
    const s: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      let up = 0;
      let n = 0;
      for (const t of tails) {
        const idx = t.length - maxLen + i;
        if (idx >= 0) {
          n++;
          if (t[idx].status === "healthy") up++;
        }
      }
      if (n > 0) s.push(up / n);
    }
    return { uptimePct: totalPts > 0 ? Math.round((healthyPts / totalPts) * 100) : null, series: s };
  }, [healthApps, history]);

  // Per-group rollup (only groups that contain health-checked apps).
  const groupRows = useMemo(() => {
    if (!config?.byGroup) return [];
    const rows: { name: string; color?: string; up: number; total: number }[] = [];
    const byId = new Map(groups.map((g) => [g.id, g]));
    const seen = new Map<string, { up: number; total: number }>();
    for (const a of healthApps) {
      const key = a.group || "__ungrouped";
      const acc = seen.get(key) ?? { up: 0, total: 0 };
      acc.total++;
      if (statuses[a.id]?.status === "healthy") acc.up++;
      seen.set(key, acc);
    }
    for (const [key, acc] of seen) {
      const g = byId.get(key);
      rows.push({ name: g?.name ?? "Ungrouped", color: g?.color, ...acc });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [config?.byGroup, groups, healthApps, statuses]);

  const total = healthApps.length;
  const showLegend = config?.showLegend !== false && h > 1;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        No services with health checks
      </div>
    );
  }

  const headlineColor =
    counts.down > 0 ? "text-rose-500" : counts.degraded > 0 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="flex flex-col h-full px-3 py-2.5 gap-2">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={`text-3xl font-mono tabular-nums leading-none ${headlineColor}`}>
          {counts.healthy}
        </span>
        <span className="text-text-muted text-[13px]">/ {total} up</span>
        {uptimePct != null && (
          <span className="ml-auto text-[11px] text-text-muted font-mono" title="Uptime over recent history">
            {uptimePct}%
          </span>
        )}
      </div>

      {/* Proportion bar */}
      <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-bg-elevated shrink-0">
        {SEGMENTS.map((seg) => {
          const n = counts[seg.key];
          if (n === 0) return null;
          return (
            <div
              key={seg.key}
              className={seg.cls}
              style={{ width: `${(n / total) * 100}%` }}
              title={`${seg.label}: ${n}`}
            />
          );
        })}
      </div>

      {h > 1 && series.length > 1 && (
        <div className={headlineColor}>
          <Sparkline series={series} />
        </div>
      )}

      {config?.byGroup && h > 1 ? (
        <div className="flex-1 min-h-0 flex flex-col justify-center gap-1 overflow-auto">
          {groupRows.map((r) => (
            <div key={r.name} className="flex items-center gap-2 text-[11px]">
              {r.color && <span className="inline-block w-1 h-3 rounded-sm shrink-0" style={{ background: r.color }} />}
              <span className="text-text-muted flex-1 truncate">{r.name}</span>
              <span
                className={`font-mono tabular-nums ${r.up === r.total ? "text-emerald-400" : "text-amber-400"}`}
              >
                {r.up}/{r.total}
              </span>
            </div>
          ))}
        </div>
      ) : (
        showLegend && (
          <div className="flex-1 min-h-0 flex flex-col justify-center gap-1 overflow-hidden">
            {SEGMENTS.map((seg) => {
              const n = counts[seg.key];
              if (n === 0) return null;
              return (
                <div key={seg.key} className="flex items-center gap-2 text-[11px]">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${seg.cls}`} />
                  <span className="text-text-muted flex-1">{seg.label}</span>
                  <span className={`font-mono tabular-nums ${seg.text}`}>{n}</span>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function StatusSummaryConfigPanel({ config, save }: WidgetConfigProps<StatusSummaryConfig>) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.byGroup ?? false}
          onChange={(e) => save({ byGroup: e.target.checked })}
          className="accent-accent"
        />
        Break down by group
      </label>
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.showLegend !== false}
          onChange={(e) => save({ showLegend: e.target.checked })}
          className="accent-accent"
          disabled={config?.byGroup}
        />
        Show per-state legend
      </label>
      <p className="text-[11px] text-text-muted leading-snug">
        Counts every service that has a health check (type http or tcp). Liveness only; the
        line is recent uptime.
      </p>
    </div>
  );
}

const StatusIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const definition: WidgetDefinition<StatusSummaryConfig> = {
  type: "status",
  title: "Status summary",
  icon: StatusIcon,
  category: "infrastructure",
  description: "At-a-glance roll-up of all service health: N up, degraded, down.",
  minW: 2,
  minH: 1,
  maxW: 8,
  maxH: 6,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: { showLegend: true },
  Component: StatusSummaryComponent,
  ConfigPanel: StatusSummaryConfigPanel,
};

export default definition;
