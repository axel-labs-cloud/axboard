import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

// Kuma-style service row: name above a history bar strip, with uptime % at the
// right. Click opens a detail popover. Rendered at a fixed height so the list
// can fit exactly to the widget.
function ServiceRow({ name, points, n, onOpen }: { name: string; points: HistoryPoint[]; n: number; onOpen?: () => void }) {
  const win = points.slice(-40);
  const pct = win.length ? Math.round((win.filter((p) => p.status === "healthy").length / win.length) * 100) : null;
  return (
    <button onClick={onOpen} className="flex items-center gap-2.5 w-full text-left rounded hover:bg-bg-hover/60 transition-colors -mx-1 px-1">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-text-secondary truncate leading-tight mb-1">{name}</div>
        <HistoryBars points={points} n={n} />
      </div>
      <span className="text-[10px] font-mono text-text-muted tabular-nums shrink-0 w-9 text-right">
        {pct != null ? `${pct}%` : "—"}
      </span>
    </button>
  );
}

// Response-time line over the history window.
function RtChart({ points }: { points: HistoryPoint[] }) {
  const vals = points.map((p) => p.response_ms).filter((v) => v >= 0);
  if (vals.length < 2) return <div className="text-[11px] text-text-muted">Not enough data yet.</div>;
  const w = 320;
  const h = 60;
  const max = Math.max(...vals, 1);
  const step = w / (vals.length - 1);
  const line = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-16 text-accent">
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Days until a cert expiry ISO string (null when absent).
function certDays(iso: string | undefined): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
}

// Detail popover for one service — uptime %, response-time chart, last incident.
function ServiceDetail({ name, points, certExpiry, certIssuer, certNotBefore, windows, onClose }: { name: string; points: HistoryPoint[]; certExpiry?: string; certIssuer?: string; certNotBefore?: string; windows?: { "24h": number; "7d": number; "30d": number }; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = points.length;
  const up = points.filter((p) => p.status === "healthy").length;
  const uptimePct = total ? Math.round((up / total) * 100) : null;
  const rts = points.map((p) => p.response_ms).filter((v) => v >= 0);
  const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
  const last = points[points.length - 1];
  const lastDown = [...points].reverse().find((p) => p.status !== "healthy");

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${name} status`} className="w-[min(420px,92vw)] rounded-xl bg-bg-elevated border border-border shadow-2xl ring-1 ring-border-subtle p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-text truncate">{name}</span>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text inline-flex items-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "Status", v: last?.status ?? "unknown", cls: last?.status === "healthy" ? "text-up" : last ? "text-down" : "text-text-muted" },
            { k: "Uptime", v: uptimePct != null ? `${uptimePct}%` : "—", cls: "text-text" },
            { k: "Avg RT", v: avg != null ? `${avg} ms` : "—", cls: "text-text" },
          ].map((s) => (
            <div key={s.k} className="rounded-lg bg-bg-card/50 border border-border-subtle/50 px-2.5 py-2">
              <div className="text-[9px] uppercase tracking-wide text-text-muted">{s.k}</div>
              <div className={`text-[15px] font-mono tabular-nums font-semibold ${s.cls}`}>{s.v}</div>
            </div>
          ))}
        </div>
        {windows && (
          <div className="grid grid-cols-3 gap-2">
            {(["24h", "7d", "30d"] as const).map((k) => (
              <div key={k} className="rounded-lg bg-bg-card/50 border border-border-subtle/50 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-text-muted">{k} uptime</div>
                <div className={`text-[15px] font-mono tabular-nums font-semibold ${windows[k] < 0 ? "text-text-muted" : windows[k] >= 99 ? "text-up" : windows[k] >= 90 ? "text-degraded" : "text-down"}`}>
                  {windows[k] < 0 ? "—" : `${windows[k]}%`}
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Response time · last {points.length} checks</div>
          <RtChart points={points} />
        </div>
        <div className="text-[11px] text-text-muted">
          Last incident:{" "}
          {lastDown ? (
            <span className="text-text-secondary">{lastDown.status}{lastDown.at ? ` · ${new Date(lastDown.at).toLocaleString()}` : ""}</span>
          ) : (
            <span className="text-up">none in window</span>
          )}
        </div>
        {certDays(certExpiry) != null && (
          <div className="text-[11px] text-text-muted space-y-0.5">
            <div>
              Certificate:{" "}
              <span className={certDays(certExpiry)! <= 14 ? "text-down" : certDays(certExpiry)! <= 30 ? "text-degraded" : "text-up"}>
                {certDays(certExpiry)! < 0 ? "expired" : `expires in ${certDays(certExpiry)} day${certDays(certExpiry) === 1 ? "" : "s"}`}
                {certExpiry ? ` · ${new Date(certExpiry).toLocaleDateString()}` : ""}
              </span>
            </div>
            {(certIssuer || certNotBefore) && (
              <div className="text-text-muted/80">
                {certIssuer ? `Issued by ${certIssuer}` : ""}
                {certIssuer && certNotBefore ? " · " : ""}
                {certNotBefore ? `valid from ${new Date(certNotBefore).toLocaleDateString()}` : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function StatusSummaryComponent({ config, h }: WidgetProps<StatusSummaryConfig>) {
  const box = useSize<HTMLDivElement>();
  const qc = useQueryClient();
  const [detail, setDetail] = useState<{ name: string; points: HistoryPoint[]; certExpiry?: string; certIssuer?: string; certNotBefore?: string; windows?: { "24h": number; "7d": number; "30d": number } } | null>(null);
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
  const { data: uptime = {} } = useQuery({
    queryKey: ["apps-uptime"],
    queryFn: api.getUptime,
    refetchInterval: 60_000,
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

  // Fit-to-height: build the ordered rows (group headers + services) and keep
  // only as many as fit the measured height, so the list never scrolls or
  // leaves big blank space — each extra row of height shows more services.
  type Row = { header?: { name: string; color?: string; up: number; total: number }; app?: AppDef };
  const rows: Row[] = [];
  if (config?.byGroup) {
    for (const grp of appGroups) {
      const upN = grp.apps.filter((a) => statuses[a.id]?.status === "healthy").length;
      rows.push({ header: { name: grp.g?.name ?? "Ungrouped", color: grp.g?.color, up: upN, total: grp.apps.length } });
      for (const a of grp.apps) rows.push({ app: a });
    }
  } else {
    for (const a of healthApps) rows.push({ app: a });
  }
  const TOP_H = 46; // headline + proportion bar
  const HEADER_H = 22;
  const SVC_H = 40; // name line + bar strip + spacing
  let budget = box.h - TOP_H - 8;
  const shownRows: Row[] = [];
  for (const r of rows) {
    const hh = r.header ? HEADER_H : SVC_H;
    if (budget - hh < -8) break;
    budget -= hh;
    shownRows.push(r);
  }

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
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-between mt-0.5">
          {shownRows.map((r, i) =>
            r.header ? (
              <div key={`h${i}`} className="flex items-center gap-2 text-[10px] uppercase tracking-[0.06em] text-text-muted shrink-0">
                {r.header.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.header.color }} />}
                <span className="truncate">{r.header.name}</span>
                <span className="ml-auto font-mono tabular-nums">{r.header.up}/{r.header.total}</span>
              </div>
            ) : (
              <ServiceRow key={r.app!.id} name={r.app!.name} points={history[r.app!.id] ?? []} n={barCount} onOpen={() => setDetail({ name: r.app!.name, points: history[r.app!.id] ?? [], certExpiry: statuses[r.app!.id]?.cert_expiry, certIssuer: statuses[r.app!.id]?.cert_issuer, certNotBefore: statuses[r.app!.id]?.cert_not_before, windows: uptime[r.app!.id] })} />
            ),
          )}
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
      {detail && <ServiceDetail name={detail.name} points={detail.points} certExpiry={detail.certExpiry} certIssuer={detail.certIssuer} certNotBefore={detail.certNotBefore} windows={detail.windows} onClose={() => setDetail(null)} />}
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
