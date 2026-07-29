import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, AppStatusValue, GroupDef, HistoryMap, HistoryPoint } from "../../../../api/types";
import { useSize } from "../useSize";
import type {
  StatusSummaryConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// Uptime-Kuma-style history strip: one bar per recent check, coloured by state.
function barTone(s: AppStatusValue | undefined): string {
  return s === "healthy" ? "bg-up" : s === "degraded" ? "bg-degraded" : s === "down" ? "bg-down" : "bg-unknown/30";
}
function HistoryBars({ points, n }: { points: HistoryPoint[]; n: number }) {
  const tail = points.slice(-n);
  const pad = Math.max(0, n - tail.length);
  return (
    <div className="flex items-stretch gap-[2px] h-3.5">
      {Array.from({ length: pad }).map((_, i) => (
        <div key={`p${i}`} className="flex-1 rounded-[1px] bg-unknown/15" />
      ))}
      {tail.map((p, i) => (
        <div
          key={i}
          className={`flex-1 rounded-[1px] ${barTone(p.status)}`}
          title={`${p.status}${p.at ? ` · ${new Date(p.at).toLocaleTimeString()}` : ""}`}
        />
      ))}
    </div>
  );
}

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
  { key: "healthy", label: "Up", cls: "bg-up", text: "text-up" },
  { key: "degraded", label: "Degraded", cls: "bg-degraded", text: "text-degraded" },
  { key: "down", label: "Down", cls: "bg-down", text: "text-down" },
  { key: "unknown", label: "Unknown", cls: "bg-unknown/60", text: "text-text-muted" },
] as const;

function ServiceRow({ name, points, n }: { name: string; points: HistoryPoint[]; n: number }) {
  const win = points.slice(-40);
  const pct = win.length ? Math.round((win.filter((p) => p.status === "healthy").length / win.length) * 100) : null;
  return (
    <div className="flex items-center gap-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-text-secondary truncate leading-tight mb-1">{name}</div>
        <HistoryBars points={points} n={n} />
      </div>
      <span className="text-[10px] font-mono text-text-muted tabular-nums shrink-0 w-9 text-right">
        {pct != null ? `${pct}%` : "—"}
      </span>
    </div>
  );
}

function StatusSummaryComponent({ config, h }: WidgetProps<StatusSummaryConfig>) {
  const box = useSize<HTMLDivElement>();
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[]; groups?: GroupDef[] }>(["config"]);
  const groups = cfg?.groups ?? [];
  const healthApps = useMemo(() => {
    const sel = config?.groups;
    return (cfg?.apps ?? []).filter(
      (a) =>
        a.health &&
        a.health.type !== "none" &&
        (!sel || sel.length === 0 || sel.includes(a.group || "__ungrouped")),
    );
  }, [cfg?.apps, config?.groups]);

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

  // Filtered apps grouped for the by-group view.
  const appGroups = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    const map = new Map<string, { g?: GroupDef; apps: AppDef[] }>();
    for (const a of healthApps) {
      const key = a.group || "__ungrouped";
      if (!map.has(key)) map.set(key, { g: byId.get(key), apps: [] });
      map.get(key)!.apps.push(a);
    }
    return [...map.values()].sort((x, y) => (x.g?.name ?? "Ungrouped").localeCompare(y.g?.name ?? "Ungrouped"));
  }, [healthApps, groups]);

  const total = healthApps.length;
  const showLegend = config?.showLegend !== false && h > 1;
  // Per-service history bars (Kuma-style) — default on, when there's room.
  const showBars = config?.bars !== false && h > 1;
  const barCount = box.w > 0 ? Math.max(10, Math.min(80, Math.floor((box.w - 150) / 4))) : 24;

  if (total === 0) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        No services with health checks
      </div>
    );
  }

  const headlineColor =
    counts.down > 0 ? "text-down" : counts.degraded > 0 ? "text-degraded" : "text-up";

  return (
    <div ref={box.ref} className="flex flex-col h-full px-3 py-2.5 gap-2">
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

      {!showBars && h > 1 && series.length > 1 && (
        <div className={headlineColor}>
          <Sparkline series={series} />
        </div>
      )}

      {showBars ? (
        <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-3 mt-0.5 pr-0.5">
          {config?.byGroup
            ? appGroups.map((grp) => {
                const upN = grp.apps.filter((a) => statuses[a.id]?.status === "healthy").length;
                return (
                  <div key={grp.g?.id ?? "__ung"} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.06em] text-text-muted">
                      {grp.g?.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: grp.g.color }} />}
                      <span className="truncate">{grp.g?.name ?? "Ungrouped"}</span>
                      <span className="ml-auto font-mono tabular-nums">{upN}/{grp.apps.length}</span>
                    </div>
                    {grp.apps.map((a) => (
                      <ServiceRow key={a.id} name={a.name} points={history[a.id] ?? []} n={barCount} />
                    ))}
                  </div>
                );
              })
            : healthApps.map((a) => (
                <ServiceRow key={a.id} name={a.name} points={history[a.id] ?? []} n={barCount} />
              ))}
        </div>
      ) : config?.byGroup && h > 1 ? (
        <div className="flex-1 min-h-0 flex flex-col justify-center gap-1 overflow-auto">
          {groupRows.map((r) => (
            <div key={r.name} className="flex items-center gap-2 text-[11px]">
              {r.color && <span className="inline-block w-1 h-3 rounded-sm shrink-0" style={{ background: r.color }} />}
              <span className="text-text-muted flex-1 truncate">{r.name}</span>
              <span
                className={`font-mono tabular-nums ${r.up === r.total ? "text-up" : "text-degraded"}`}
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
  const qc = useQueryClient();
  const groups = qc.getQueryData<{ groups?: GroupDef[] }>(["config"])?.groups ?? [];
  const sel = config?.groups ?? [];
  const toggleGroup = (id: string) =>
    save({ groups: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.bars !== false}
          onChange={(e) => save({ bars: e.target.checked })}
          className="accent-accent"
        />
        Uptime history bars
      </label>
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
      {groups.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
            Filter to groups (none = all)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const on = sel.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => toggleGroup(g.id)}
                  className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                    on ? "bg-accent/15 border-accent text-accent" : "bg-bg-card border-border text-text-muted hover:text-text"
                  }`}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[11px] text-text-muted leading-snug">
        Counts every service that has a health check (type http or tcp). Liveness only; bars show
        recent per-service uptime.
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
  maxW: 12,
  maxH: 14,
  defaultW: 5,
  defaultH: 4,
  defaultConfig: { showLegend: true, bars: true },
  Component: StatusSummaryComponent,
  ConfigPanel: StatusSummaryConfigPanel,
};

export default definition;
