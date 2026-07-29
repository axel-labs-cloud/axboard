import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import { ColorControls, scaleColor, type ColorConfig } from "../colorScale";
import { WindowChips, windowPoints, maxBuffer, type TimeWindow } from "../timeWindow";
import type { GaugeConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";
import type { HostStats } from "../../../../api/types";

// ---------------------------------------------------------------------------
// Resource gauge — one host metric (CPU / RAM / disk / swap) as a ring, chunky
// bar, or live sparkline. Adapts to size: a short-and-wide tile falls back to a
// bar, and a tiny square shows a compact ring with the metric's icon. Colour
// from the shared scale; optional glow.
// ---------------------------------------------------------------------------

const OPTS = { lo: 0, hi: 100, warn: 75, crit: 90 };
const POLL_MS = 5000;

const METRIC_ICONS: Record<string, React.ReactNode> = {
  cpu: <><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="10" y="10" width="4" height="4" /></>,
  ram: <><rect x="3" y="8" width="18" height="8" rx="1" /><path d="M8 8v8M12 8v8M16 8v8" /></>,
  disk: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /></>,
  swap: <><path d="M8 4v13M8 4 5 7M8 4l3 3" /><path d="M16 20V7M16 20l-3-3M16 20l3-3" /></>,
};

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

type Metric = { pct: number; big: string; sub: string; name: string };

function readMetric(d: HostStats, metric: string): Metric {
  const pctOf = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);
  switch (metric) {
    case "ram":
      return { pct: pctOf(d.mem_used, d.mem_total), big: `${Math.round(pctOf(d.mem_used, d.mem_total))}%`, sub: `${fmtBytes(d.mem_used)} / ${fmtBytes(d.mem_total)}`, name: "RAM" };
    case "disk":
      return { pct: pctOf(d.disk_used, d.disk_total), big: `${Math.round(pctOf(d.disk_used, d.disk_total))}%`, sub: `${fmtBytes(d.disk_used)} / ${fmtBytes(d.disk_total)}`, name: "Disk" };
    case "swap":
      return { pct: pctOf(d.swap_used, d.swap_total), big: `${Math.round(pctOf(d.swap_used, d.swap_total))}%`, sub: d.swap_total > 0 ? `${fmtBytes(d.swap_used)} / ${fmtBytes(d.swap_total)}` : "no swap", name: "Swap" };
    default:
      return { pct: d.cpu_pct, big: `${Math.round(d.cpu_pct)}%`, sub: `${d.cpus} cores`, name: "CPU" };
  }
}

function Ring({ pct, size, big, name, cfg }: { pct: number; size: number; big: string; name: string; cfg: GaugeConfig }) {
  const cur = scaleColor(pct, cfg as ColorConfig, OPTS);
  const glow = cfg.glow !== false;
  const showTrack = cfg.track !== false;
  const stroke = Math.max(5, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {showTrack && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-bg-elevated, #1e2130)" strokeWidth={stroke} />}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={cur}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease", filter: glow ? `drop-shadow(0 0 ${stroke * 0.7}px ${cur})` : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono tabular-nums font-semibold leading-none" style={{ fontSize: size * 0.24, color: cur }}>{big}</span>
        <span className="text-text-muted uppercase tracking-wide" style={{ fontSize: Math.max(8, size * 0.1) }}>{name}</span>
      </div>
    </div>
  );
}

// Compact ring for tiny (≈1×1) tiles: the metric's icon sits in the centre.
function RingIcon({ pct, size, metric, cfg }: { pct: number; size: number; metric: string; cfg: GaugeConfig }) {
  const cur = scaleColor(pct, cfg as ColorConfig, OPTS);
  const stroke = Math.max(3, Math.round(size * 0.08));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const iconSize = size * 0.44;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} title={`${metric.toUpperCase()} ${Math.round(pct)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        {cfg.track !== false && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-bg-elevated, #1e2130)" strokeWidth={stroke} />}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={cur} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }} />
      </svg>
      <svg viewBox="0 0 24 24" width={iconSize} height={iconSize} fill="none" stroke={cur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute">
        {METRIC_ICONS[metric] ?? METRIC_ICONS.cpu}
      </svg>
    </div>
  );
}

// Compact icon + bar for short-and-wide tiles: no text, just the metric icon
// and a fill bar.
function BarIcon({ pct, w, h, metric, cfg }: { pct: number; w: number; h: number; metric: string; cfg: GaugeConfig }) {
  const cur = scaleColor(pct, cfg as ColorConfig, OPTS);
  const glow = cfg.glow !== false;
  const icon = Math.max(14, Math.min(h - 10, 26));
  const barH = Math.max(6, Math.min(h - 12, 12));
  return (
    <div className="w-full h-full flex items-center gap-2.5 px-3" style={{ width: w }} title={`${metric.toUpperCase()} ${Math.round(pct)}%`}>
      <svg viewBox="0 0 24 24" width={icon} height={icon} fill="none" stroke={cur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        {METRIC_ICONS[metric] ?? METRIC_ICONS.cpu}
      </svg>
      <div className={`flex-1 rounded-full overflow-hidden ${cfg.track !== false ? "bg-bg-elevated" : ""}`} style={{ height: barH }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: cur, transition: "width 0.6s ease, background 0.4s ease", boxShadow: glow ? `0 0 8px ${cur}` : undefined }} />
      </div>
    </div>
  );
}

function BarStyle({ pct, big, sub, name, cfg }: { pct: number; big: string; sub: string; name: string; cfg: GaugeConfig }) {
  const cur = scaleColor(pct, cfg as ColorConfig, OPTS);
  const glow = cfg.glow !== false;
  const showTrack = cfg.track !== false;
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full px-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] text-text-muted uppercase tracking-wide">{name}</span>
        <span className="font-mono tabular-nums text-[22px] font-semibold leading-none" style={{ color: cur }}>{big}</span>
      </div>
      <div className={`w-full h-5 rounded-[3px] overflow-hidden ${showTrack ? "bg-bg-elevated" : ""}`}>
        <div className="h-full rounded-[2px]" style={{ width: `${p}%`, background: cur, transition: "width 0.6s ease, background 0.4s ease", boxShadow: glow ? `0 0 8px ${cur}` : undefined }} />
      </div>
      <div className="mt-1.5 text-[11px] font-mono text-text-muted whitespace-nowrap truncate">{sub}</div>
    </div>
  );
}

function Spark({ hist, big, sub, name, w, cfg }: { hist: number[]; big: string; sub: string; name: string; w: number; cfg: GaugeConfig }) {
  const width = Math.max(80, w - 32);
  const height = 46;
  const pts = hist.length ? hist : [0];
  const cur = pts[pts.length - 1] ?? 0;
  const color = scaleColor(cur, cfg as ColorConfig, OPTS);
  const glow = cfg.glow !== false;
  const step = pts.length > 1 ? width / (pts.length - 1) : width;
  const coords = pts.map((v, i) => `${i * step},${height - (Math.min(100, v) / 100) * height}`);
  const line = `M ${coords.join(" L ")}`;
  const area = `${line} L ${(pts.length - 1) * step},${height} L 0,${height} Z`;
  const fillId = "gauge-spark-fill";
  return (
    <div className="w-full px-4">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] text-text-muted uppercase tracking-wide">{name}</span>
        <span className="font-mono tabular-nums text-[22px] font-semibold leading-none" style={{ color }}>{big}</span>
      </div>
      <svg width={width} height={height} className="w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fillId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ filter: glow ? `drop-shadow(0 0 3px ${color})` : undefined }} />
      </svg>
      <div className="mt-1 text-[11px] font-mono text-text-muted whitespace-nowrap truncate">{sub}</div>
    </div>
  );
}

function GaugeComponent({ config }: WidgetProps<GaugeConfig>) {
  const box = useSize<HTMLDivElement>();
  const cfg = config ?? {};
  const metric = cfg.metric ?? "cpu";
  const hist = useRef<number[]>([]);
  const [, tick] = useState(0);

  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: POLL_MS });

  useEffect(() => {
    if (!data) return;
    const m = readMetric(data, metric);
    hist.current = [...hist.current, m.pct].slice(-maxBuffer(POLL_MS));
    tick((n) => n + 1);
  }, [data, metric]);

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }

  const m = readMetric(data, metric);
  const name = cfg.label || m.name;

  // Adapt to size: a short tile can't hold a full ring + number. A short-wide
  // tile falls back to a bar; a short square becomes a compact ring with the
  // metric's icon in the centre (this wins over the configured style, since
  // that's all that fits).
  let style: "ring" | "bar" | "spark" | "ringicon" | "baricon" = cfg.style ?? "ring";
  // Compact = the text-free icon ring/bar. Forced by the config toggle, or
  // triggered automatically when the tile is small.
  const short = cfg.compact === true || (box.h > 0 && box.h < 110);
  const wide = box.w > box.h * 1.4;
  if (short) style = wide ? "baricon" : "ringicon";

  let body: React.ReactNode;
  if (style === "ringicon") {
    const size = Math.max(24, Math.min(box.w - 8, box.h - 8, 120));
    body = <RingIcon pct={m.pct} size={size} metric={metric} cfg={cfg} />;
  } else if (style === "baricon") {
    body = <BarIcon pct={m.pct} w={box.w} h={box.h} metric={metric} cfg={cfg} />;
  } else if (style === "bar") {
    body = <BarStyle pct={m.pct} big={m.big} sub={m.sub} name={name} cfg={cfg} />;
  } else if (style === "spark") {
    const win = (cfg.window ?? "5m") as TimeWindow;
    const view = hist.current.slice(-windowPoints(win, POLL_MS));
    body = <Spark hist={view} big={m.big} sub={m.sub} name={name} w={box.w} cfg={cfg} />;
  } else {
    const size = Math.max(60, Math.min(box.w - 24, box.h - 24, 200)) || 96;
    body = <Ring pct={m.pct} size={size} big={m.big} name={name} cfg={cfg} />;
  }

  return <div ref={box.ref} className="h-full flex flex-col items-center justify-center">{body}</div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${active ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"}`}>
      {children}
    </button>
  );
}

function GaugeConfigPanel({ config, save }: WidgetConfigProps<GaugeConfig>) {
  const metric = config?.metric ?? "cpu";
  const style = config?.style ?? "ring";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Metric</label>
        <div className="grid grid-cols-4 gap-1">
          {(["cpu", "ram", "disk", "swap"] as const).map((mt) => (
            <Chip key={mt} active={metric === mt} onClick={() => save({ metric: mt })}>{mt}</Chip>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Style</label>
        <div className="grid grid-cols-3 gap-1">
          {(["ring", "bar", "spark"] as const).map((st) => (
            <Chip key={st} active={style === st} onClick={() => save({ style: st })}>{st}</Chip>
          ))}
        </div>
      </div>

      {style === "spark" && (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Time window</label>
          <WindowChips value={(config?.window ?? "5m") as TimeWindow} onChange={(w) => save({ window: w })} />
        </div>
      )}

      <ColorControls cfg={config} save={save} opts={OPTS} unit="%" />

      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input type="checkbox" checked={config?.compact === true} onChange={(e) => save({ compact: e.target.checked })} className="accent-accent" />
        Compact — icon only, no text
      </label>

      <div className="flex items-center gap-4 pt-0.5">
        <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
          <input type="checkbox" checked={config?.glow !== false} onChange={(e) => save({ glow: e.target.checked })} className="accent-accent" />
          Glow
        </label>
        <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
          <input type="checkbox" checked={config?.track !== false} onChange={(e) => save({ track: e.target.checked })} className="accent-accent" />
          Track
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Label (optional)</label>
        <input
          value={config?.label ?? ""}
          onChange={(e) => save({ label: e.target.value })}
          placeholder={metric.toUpperCase()}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

const GaugeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 2a10 10 0 1 0 10 10" />
    <path d="M12 12l4-4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const definition: WidgetDefinition<GaugeConfig> = {
  type: "gauge",
  title: "Resource gauge",
  icon: GaugeIcon,
  category: "infrastructure",
  description: "One host metric (CPU/RAM/disk/swap) as a ring, bar or live sparkline — configurable colours + glow. Adapts to size.",
  minW: 1,
  minH: 1,
  maxW: 6,
  maxH: 6,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: { metric: "cpu", style: "ring", colorScale: "threshold", glow: true, track: true },
  Component: GaugeComponent,
  ConfigPanel: GaugeConfigPanel,
};

export default definition;
