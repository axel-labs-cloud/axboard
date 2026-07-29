import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type {
  HostConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Host-stats widget — a glance at the machine axboard runs on, in order:
// CPU, memory, disk usage, disk R/W, network I/O, plus load + uptime. Not a
// metrics collector (point at Grafana). Size-responsive: one column when
// narrow, two when wide.
// ---------------------------------------------------------------------------

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

function fmtRate(bps: number): string {
  if (bps < 1) return "0";
  const u = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bps) / Math.log(1024)));
  return `${(bps / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function tone(pct: number): string {
  return pct > 90 ? "bg-down" : pct > 75 ? "bg-degraded" : "bg-up";
}

// A labelled percentage bar (CPU / RAM / disk usage).
function BarRow({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px] gap-2">
        <span className="text-text-muted shrink-0">{label}</span>
        <span className="font-mono tabular-nums text-text-secondary truncate">{detail}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-bg-elevated overflow-hidden">
        <div className={`h-full ${tone(pct)}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

// A throughput row with up/down arrows (disk R/W, net I/O).
function IORow({ label, down, up }: { label: string; down: string; up: string }) {
  return (
    <div className="flex items-baseline justify-between text-[11px] gap-2">
      <span className="text-text-muted shrink-0">{label}</span>
      <span className="font-mono tabular-nums text-text-secondary truncate">
        <span className="text-up">↓</span> {down} <span className="text-text-muted/40">·</span>{" "}
        <span className="text-accent">↑</span> {up}
      </span>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-[11px] gap-2">
      <span className="text-text-muted shrink-0">{label}</span>
      <span className="font-mono tabular-nums text-text-secondary truncate">{value}</span>
    </div>
  );
}

function HostComponent({ config }: WidgetProps<HostConfig>) {
  const box = useSize<HTMLDivElement>();
  const { data, isError } = useQuery({
    queryKey: ["host"],
    queryFn: api.getHost,
    refetchInterval: 5_000,
  });

  if (isError || !data) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        Host stats unavailable.
      </div>
    );
  }

  const memPct = data.mem_total > 0 ? (data.mem_used / data.mem_total) * 100 : 0;
  const diskPct = data.disk_total > 0 ? (data.disk_used / data.disk_total) * 100 : 0;
  const swapPct = data.swap_total > 0 ? (data.swap_used / data.swap_total) * 100 : 0;
  const showLoad = config?.showLoad !== false;
  const twoCol = box.w >= 340;

  const rows: React.ReactNode[] = [
    <BarRow key="cpu" label={`CPU · ${data.cpus} core`} pct={data.cpu_pct} detail={`${data.cpu_pct.toFixed(0)}%`} />,
    <BarRow key="mem" label="RAM" pct={memPct} detail={`${fmtBytes(data.mem_used)} / ${fmtBytes(data.mem_total)}`} />,
  ];
  if (data.disk_total > 0)
    rows.push(
      <BarRow key="disk" label="Disk" pct={diskPct} detail={`${fmtBytes(data.disk_used)} / ${fmtBytes(data.disk_total)}`} />,
    );
  rows.push(<IORow key="diskio" label="Disk R/W" down={fmtRate(data.disk_read_bps)} up={fmtRate(data.disk_write_bps)} />);
  rows.push(<IORow key="netio" label="Network" down={fmtRate(data.net_rx_bps)} up={fmtRate(data.net_tx_bps)} />);
  if (data.swap_total > 0)
    rows.push(<BarRow key="swap" label="Swap" pct={swapPct} detail={`${fmtBytes(data.swap_used)} / ${fmtBytes(data.swap_total)}`} />);
  if (showLoad)
    rows.push(
      <KV key="load" label="Load 1·5·15" value={`${data.load1.toFixed(2)} · ${data.load5.toFixed(2)} · ${data.load15.toFixed(2)}`} />,
    );
  rows.push(<KV key="up" label="Uptime" value={fmtUptime(data.uptime_sec)} />);

  return (
    <div ref={box.ref} className="h-full overflow-auto px-3.5 py-3">
      <div
        className="content-start"
        style={
          twoCol
            ? { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "16px", rowGap: "10px" }
            : { display: "flex", flexDirection: "column", gap: "9px" }
        }
      >
        {rows}
      </div>
    </div>
  );
}

function HostConfigPanel({ config, save }: WidgetConfigProps<HostConfig>) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.showLoad !== false}
          onChange={(e) => save({ showLoad: e.target.checked })}
          className="accent-accent"
        />
        Show load average
      </label>
      <p className="text-[11px] text-text-muted leading-snug">
        CPU / memory / disk report the host. Network I/O reflects the container's interface
        (its own traffic) unless axboard runs with host networking.
      </p>
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
  description: "CPU, memory, disk, network I/O, load and uptime of the machine axboard runs on.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { showLoad: true },
  Component: HostComponent,
  ConfigPanel: HostConfigPanel,
};

export default definition;
