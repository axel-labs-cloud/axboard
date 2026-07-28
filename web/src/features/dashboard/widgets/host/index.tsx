import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { HostConfig, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Host-stats widget — a shallow glance at the machine axboard runs on:
// memory, load average, uptime. Not a metrics collector (point at Grafana).
// ---------------------------------------------------------------------------

function fmtBytes(n: number): string {
  if (n <= 0) return "0";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-bg-elevated overflow-hidden">
      <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function HostComponent({ config, h }: WidgetProps<HostConfig>) {
  const { data, isError } = useQuery({
    queryKey: ["host"],
    queryFn: api.getHost,
    refetchInterval: 10_000,
  });

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        Host stats unavailable.
      </div>
    );
  }

  const memPct = data.mem_total > 0 ? (data.mem_used / data.mem_total) * 100 : 0;
  const memTone = memPct > 90 ? "bg-down" : memPct > 75 ? "bg-degraded" : "bg-up";
  // Load relative to core count as a rough saturation gauge.
  const loadPct = data.cpus > 0 ? (data.load1 / data.cpus) * 100 : 0;
  const loadTone = loadPct > 100 ? "bg-down" : loadPct > 70 ? "bg-degraded" : "bg-up";
  const showLoad = config?.showLoad !== false;

  return (
    <div className="h-full flex flex-col justify-center gap-2.5 px-3.5 py-3">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-text-muted">Memory</span>
          <span className="font-mono tabular-nums text-text-secondary">
            {fmtBytes(data.mem_used)} / {fmtBytes(data.mem_total)}
          </span>
        </div>
        <Bar pct={memPct} tone={memTone} />
      </div>

      {showLoad && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-text-muted">Load ({data.cpus} cpu)</span>
            <span className="font-mono tabular-nums text-text-secondary">
              {data.load1.toFixed(2)} · {data.load5.toFixed(2)} · {data.load15.toFixed(2)}
            </span>
          </div>
          <Bar pct={loadPct} tone={loadTone} />
        </div>
      )}

      {h > 2 && (
        <div className="flex items-baseline justify-between text-[11px] pt-0.5">
          <span className="text-text-muted">Uptime</span>
          <span className="font-mono tabular-nums text-text-secondary">{fmtUptime(data.uptime_sec)}</span>
        </div>
      )}
    </div>
  );
}

const HostIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="4" width="18" height="8" rx="1" />
    <rect x="3" y="14" width="18" height="6" rx="1" />
    <line x1="7" y1="8" x2="7" y2="8" />
    <line x1="7" y1="17" x2="7" y2="17" />
  </svg>
);

const definition: WidgetDefinition<HostConfig> = {
  type: "host",
  title: "Host stats",
  icon: HostIcon,
  category: "infrastructure",
  description: "Memory, load average and uptime of the machine axboard runs on.",
  minW: 2,
  minH: 2,
  maxW: 5,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: { showLoad: true },
  Component: HostComponent,
};

export default definition;
