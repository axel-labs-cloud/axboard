import { useEffect, useId, useRef, useState } from "react";
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
      <svg viewBox="0 0 24 24" width={iconSize} height={iconSize} fill="none" stroke="var(--color-text, #fff)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute">
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
      <svg viewBox="0 0 24 24" width={icon} height={icon} fill="none" stroke="var(--color-text, #fff)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        {METRIC_ICONS[metric] ?? METRIC_ICONS.cpu}
      </svg>
      <div className={`flex-1 rounded-full overflow-hidden ${cfg.track !== false ? "bg-bg-elevated" : ""}`} style={{ height: barH }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: cur, transition: "width 0.6s ease, background 0.4s ease", boxShadow: glow ? `0 0 8px ${cur}` : undefined }} />
      </div>
    </div>
  );
}

function BarStyle({ pct, big, sub, name, h, cfg }: { pct: number; big: string; sub: string; name: string; h: number; cfg: GaugeConfig }) {
  const cur = scaleColor(pct, cfg as ColorConfig, OPTS);
  const glow = cfg.glow !== false;
  const showTrack = cfg.track !== false;
  const showSub = h === 0 || h >= 78; // drop the used/total line when short
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full px-4">
      <div className="flex items-center justify-between gap-2 mb-1.5 leading-none">
        <span className="text-[12px] text-text-muted uppercase tracking-wide">{name}</span>
        <span className="font-mono tabular-nums text-[20px] font-semibold" style={{ color: cur }}>{big}</span>
      </div>
      <div className={`w-full h-5 rounded-[3px] overflow-hidden ${showTrack ? "bg-bg-elevated" : ""}`}>
        <div className="h-full rounded-[2px]" style={{ width: `${p}%`, background: cur, transition: "width 0.6s ease, background 0.4s ease", boxShadow: glow ? `0 0 8px ${cur}` : undefined }} />
      </div>
      {showSub && <div className="mt-1.5 text-[11px] font-mono text-text-muted whitespace-nowrap truncate">{sub}</div>}
    </div>
  );
}

// Catmull-Rom → cubic-bezier smoothing so the sparkline reads as a smooth
// trend, not a jagged zig-zag.
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) return `M ${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L ")}`;
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function Spark({ hist, big, sub, name, w, h, cfg }: { hist: number[]; big: string; sub: string; name: string; w: number; h: number; cfg: GaugeConfig }) {
  const uid = useId().replace(/:/g, "");
  const width = Math.max(80, w - 24);
  const height = Math.max(28, Math.min((h || 120) - 44, 220));
  const pts = hist.length ? hist : [0, 0];
  const cur = pts[pts.length - 1] ?? 0;
  const color = scaleColor(cur, cfg as ColorConfig, OPTS);
  const glow = cfg.glow !== false;
  // Inset the chart so the smoothed curve never touches the edges, and give the
  // y-axis its own headroom so peaks sit inside the frame.
  const PADX = 4;
  const topPad = 4;
  const botPad = 2;
  const iw = Math.max(1, width - PADX * 2);
  const ih = Math.max(1, height - topPad - botPad);
  const step = pts.length > 1 ? iw / (pts.length - 1) : iw;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = Math.max(hi - lo, 2);
  const yMin = Math.max(0, lo - span * 0.25);
  const yMax = hi + span * 0.25;
  const y = (v: number) => topPad + (ih - ((v - yMin) / (yMax - yMin || 1)) * ih);
  const P: [number, number][] = pts.map((v, i) => [PADX + i * step, y(v)]);
  const line = smoothPath(P);
  const lastX = (PADX + (pts.length - 1) * step).toFixed(1);
  const area = `${line} L ${lastX},${height} L ${PADX},${height} Z`;
  const fillId = `spk-${uid}`;
  return (
    <div className="w-full px-3">
      <div className="flex items-center justify-between gap-2 mb-1.5 leading-none">
        <span className="text-[12px] text-text-muted uppercase tracking-wide">{name}</span>
        <span className="font-mono tabular-nums text-[20px] font-semibold" style={{ color }}>{big}</span>
      </div>
      <svg width={width} height={height} className="w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
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

// Render one gauge for `metric` within a w×h box. Extracted so the dual mode
// can draw two.
function gaugeBody(metric: string, d: HostStats, cfg: GaugeConfig, w: number, h: number, hist: number[]): React.ReactNode {
  const m = readMetric(d, metric);
  const name = cfg.label && cfg.metric === metric ? cfg.label : m.name;
  let style: "ring" | "bar" | "spark" | "ringicon" | "baricon" = cfg.style ?? "ring";
  const wide = w > h * 1.4;
  if (cfg.compact === true) style = wide ? "baricon" : "ringicon";
  else if (style === "ring" && h > 0 && h < 96) style = wide ? "baricon" : "ringicon";

  if (style === "ringicon") {
    const size = Math.max(24, Math.min(w - 8, h - 8, 120));
    return <RingIcon pct={m.pct} size={size} metric={metric} cfg={cfg} />;
  }
  if (style === "baricon") return <BarIcon pct={m.pct} w={w} h={h} metric={metric} cfg={cfg} />;
  if (style === "bar") return <BarStyle pct={m.pct} big={m.big} sub={m.sub} name={name} h={h} cfg={cfg} />;
  if (style === "spark") {
    const win = (cfg.window ?? "5m") as TimeWindow;
    return <Spark hist={hist.slice(-windowPoints(win, POLL_MS))} big={m.big} sub={m.sub} name={name} w={w} h={h} cfg={cfg} />;
  }
  const size = Math.max(60, Math.min(w - 24, h - 24, 200)) || 96;
  return <Ring pct={m.pct} size={size} big={m.big} name={name} cfg={cfg} />;
}

function GaugeComponent({ config }: WidgetProps<GaugeConfig>) {
  const box = useSize<HTMLDivElement>();
  const cfg = config ?? {};
  const metric = cfg.metric ?? "cpu";
  const metric2 = cfg.metric2 && cfg.metric2 !== "none" ? cfg.metric2 : null;
  const hist = useRef<Record<string, number[]>>({});
  const [, tick] = useState(0);

  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: POLL_MS });

  useEffect(() => {
    if (!data) return;
    const cap = maxBuffer(POLL_MS);
    for (const mt of [metric, metric2].filter(Boolean) as string[]) {
      hist.current[mt] = [...(hist.current[mt] ?? []), readMetric(data, mt).pct].slice(-cap);
    }
    tick((n) => n + 1);
  }, [data, metric, metric2]);

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }

  if (metric2) {
    // Split the tile: side-by-side when wide, stacked when tall. A ring doesn't
    // fit a split half well, so fall back to a spark for dual gauges.
    const dcfg: GaugeConfig = cfg.style === "ring" || !cfg.style ? { ...cfg, style: "spark" } : cfg;
    const row = box.w >= box.h;
    const halfW = row ? box.w / 2 : box.w;
    const halfH = row ? box.h : box.h / 2;
    return (
      <div ref={box.ref} className={`h-full w-full flex ${row ? "flex-row" : "flex-col"}`}>
        <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">{gaugeBody(metric, data, dcfg, halfW, halfH, hist.current[metric] ?? [])}</div>
        <div className={row ? "w-px bg-border-subtle/60" : "h-px bg-border-subtle/60"} />
        <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">{gaugeBody(metric2, data, dcfg, halfW, halfH, hist.current[metric2] ?? [])}</div>
      </div>
    );
  }

  return <div ref={box.ref} className="h-full flex flex-col items-center justify-center">{gaugeBody(metric, data, cfg, box.w, box.h, hist.current[metric] ?? [])}</div>;
}

function Chip({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${
        disabled ? "border-border/40 text-text-muted/30 cursor-not-allowed" : active ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function GaugeConfigPanel({ config, save }: WidgetConfigProps<GaugeConfig>) {
  const metric = config?.metric ?? "cpu";
  const style = config?.style ?? "ring";
  const dual = !!config?.metric2 && config.metric2 !== "none";
  // Ring can't split, so choosing a second metric switches it to spark.
  const setSecond = (m: "none" | "cpu" | "ram" | "disk" | "swap") =>
    save(m !== "none" && style === "ring" ? { metric2: m, style: "spark" } : { metric2: m });
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
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Second metric (split tile)</label>
        <div className="grid grid-cols-5 gap-1">
          {(["none", "cpu", "ram", "disk", "swap"] as const).map((mt) => (
            <Chip key={mt} active={(config?.metric2 ?? "none") === mt} onClick={() => setSecond(mt)}>{mt}</Chip>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Style{dual ? " · ring off in split" : ""}</label>
        <div className="grid grid-cols-3 gap-1">
          {(["ring", "bar", "spark"] as const).map((st) => (
            <Chip key={st} active={style === st} disabled={dual && st === "ring"} onClick={() => save({ style: st })}>{st}</Chip>
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
