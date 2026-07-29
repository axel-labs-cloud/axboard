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

function toneText(pct: number): string {
  return pct > 90 ? "text-down" : pct > 75 ? "text-degraded" : "text-up";
}

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
    {d}
  </svg>
);
const ICON: Record<string, React.ReactNode> = {
  cpu: svg(<><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="10" y="10" width="4" height="4" /></>),
  ram: svg(<><rect x="3" y="8" width="18" height="8" rx="1" /><path d="M8 8v8M12 8v8M16 8v8" /></>),
  disk: svg(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /></>),
  swap: svg(<><path d="M8 4v13M8 4 5 7M8 4l3 3" /><path d="M16 20V7M16 20l-3-3M16 20l3-3" /></>),
  diskio: svg(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14a8 3 0 0 0 16 0V5" /></>),
  net: svg(<><path d="M5 12.5a9 9 0 0 1 14 0M8.5 15.5a4.5 4.5 0 0 1 7 0" /><circle cx="12" cy="18.5" r="0.6" fill="currentColor" /></>),
  load: svg(<><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 12l4-3" /></>),
  clock: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
};

// A labelled percentage bar (CPU / RAM / disk usage).
function BarRow({ icon, label, pct, detail }: { icon: React.ReactNode; label: string; pct: number; detail: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center text-[11px] gap-1.5">
        <span className="text-text-muted/70 shrink-0">{icon}</span>
        <span className="text-text-muted shrink-0">{label}</span>
        <span className="ml-auto font-mono tabular-nums text-[10px] text-text-muted truncate">{detail}</span>
        <span className={`font-mono tabular-nums font-semibold shrink-0 ${toneText(pct)}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-bg-elevated overflow-hidden">
        <div className={`h-full rounded-full ${tone(pct)}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%`, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// A throughput row with up/down arrows (disk R/W, net I/O).
function IORow({ icon, label, down, up }: { icon: React.ReactNode; label: string; down: string; up: string }) {
  return (
    <div className="flex items-center text-[11px] gap-1.5">
      <span className="text-text-muted/70 shrink-0">{icon}</span>
      <span className="text-text-muted shrink-0">{label}</span>
      <span className="ml-auto font-mono tabular-nums text-text-secondary truncate">
        <span className="text-up">↓</span> {down} <span className="text-text-muted/40">·</span>{" "}
        <span className="text-accent">↑</span> {up}
      </span>
    </div>
  );
}

function KV({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center text-[11px] gap-1.5">
      <span className="text-text-muted/70 shrink-0">{icon}</span>
      <span className="text-text-muted shrink-0">{label}</span>
      <span className="ml-auto font-mono tabular-nums text-text-secondary truncate">{value}</span>
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
    <BarRow key="cpu" icon={ICON.cpu} label={`CPU · ${data.cpus}c`} pct={data.cpu_pct} detail="" />,
    <BarRow key="mem" icon={ICON.ram} label="RAM" pct={memPct} detail={`${fmtBytes(data.mem_used)} / ${fmtBytes(data.mem_total)}`} />,
  ];
  if (data.disk_total > 0)
    rows.push(
      <BarRow key="disk" icon={ICON.disk} label="Disk" pct={diskPct} detail={`${fmtBytes(data.disk_used)} / ${fmtBytes(data.disk_total)}`} />,
    );
  rows.push(<IORow key="diskio" icon={ICON.diskio} label="Disk R/W" down={fmtRate(data.disk_read_bps)} up={fmtRate(data.disk_write_bps)} />);
  rows.push(<IORow key="netio" icon={ICON.net} label="Network" down={fmtRate(data.net_rx_bps)} up={fmtRate(data.net_tx_bps)} />);
  if (data.swap_total > 0)
    rows.push(<BarRow key="swap" icon={ICON.swap} label="Swap" pct={swapPct} detail={`${fmtBytes(data.swap_used)} / ${fmtBytes(data.swap_total)}`} />);
  if (showLoad)
    rows.push(
      <KV key="load" icon={ICON.load} label="Load" value={`${data.load1.toFixed(2)} · ${data.load5.toFixed(2)} · ${data.load15.toFixed(2)}`} />,
    );
  rows.push(<KV key="up" icon={ICON.clock} label="Uptime" value={fmtUptime(data.uptime_sec)} />);

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
        Reports the host directly. Network I/O needs host networking
        (<span className="font-mono">network_mode: host</span> in compose.yaml) — without it
        the container only sees its own interface.
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
