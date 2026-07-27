import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef } from "../../../../api/types";
import type {
  StatusSummaryConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

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
  const cfg = qc.getQueryData<{ apps?: AppDef[] }>(["config"]);
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

      {showLegend && (
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
          checked={config?.showLegend !== false}
          onChange={(e) => save({ showLegend: e.target.checked })}
          className="accent-accent"
        />
        Show per-state legend
      </label>
      <p className="text-[11px] text-text-muted leading-snug">
        Counts every service that has a health check (type http or tcp). Liveness only.
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
