import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type {
  GaugeConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";
import type { HostStats } from "../../../../api/types";

// ---------------------------------------------------------------------------
// Resource gauge — one host metric (CPU / RAM / disk / swap) drawn as a
// configurable ring, arc, bar, or live sparkline, with threshold / gradient /
// solid colour scales, an optional neon glow, and a palette. Reads /api/host;
// keeps a short rolling history locally for the sparkline style.
// ---------------------------------------------------------------------------

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

const PALETTE: Record<string, string> = {
  accent: "var(--color-accent, #818cf8)",
  emerald: "#10b981",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

function threshold(pct: number): string {
  if (pct > 90) return "var(--color-down, #f43f5e)";
  if (pct > 75) return "var(--color-degraded, #f59e0b)";
  return "var(--color-up, #10b981)";
}

// hue from green (145°) at 0% to red (0°) at 100%.
function hue(pct: number): string {
  const h = Math.max(0, 145 - 1.45 * Math.min(100, Math.max(0, pct)));
  return `hsl(${h.toFixed(0)} 72% 52%)`;
}

// Colour for the current value (used for numbers, spark line, solid fills).
function currentColor(pct: number, cfg: GaugeConfig): string {
  if (cfg.colorScale === "solid") return PALETTE[cfg.color ?? "accent"] ?? PALETTE.accent;
  if (cfg.colorScale === "gradient") return hue(pct);
  return threshold(pct);
}

function useGaugeColors(pct: number, cfg: GaugeConfig, gradId: string) {
  const scale = cfg.colorScale ?? "threshold";
  const cur = currentColor(pct, cfg);
  // fill = a paint reference for strokes/bars: the spectrum gradient in
  // gradient mode, otherwise the solid current colour.
  const fill = scale === "gradient" ? `url(#${gradId})` : cur;
  return { cur, fill, scale };
}

// The green→amber→red spectrum, defined once per gauge for gradient mode.
function SpectrumDef({ id, vertical }: { id: string; vertical?: boolean }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1={vertical ? "1" : "0"} x2={vertical ? "0" : "1"} y2="0">
        <stop offset="0" stopColor="#10b981" />
        <stop offset="0.55" stopColor="#f59e0b" />
        <stop offset="1" stopColor="#f43f5e" />
      </linearGradient>
    </defs>
  );
}

function Ring({ pct, size, big, name, cfg, gradId }: { pct: number; size: number; big: string; name: string; cfg: GaugeConfig; gradId: string }) {
  const { fill, cur } = useGaugeColors(pct, cfg, gradId);
  const glow = cfg.glow !== false;
  const showTrack = cfg.track !== false;
  const stroke = Math.max(5, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <SpectrumDef id={gradId} />
        {showTrack && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-bg-elevated, #1e2130)" strokeWidth={stroke} />}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={fill}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease", filter: glow ? `drop-shadow(0 0 ${stroke * 0.7}px ${cur})` : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono tabular-nums font-semibold leading-none" style={{ fontSize: size * 0.24, color: cur }}>
          {big}
        </span>
        <span className="text-text-muted uppercase tracking-wide" style={{ fontSize: Math.max(8, size * 0.1) }}>{name}</span>
      </div>
    </div>
  );
}

function Arc({ pct, w, big, name, cfg, gradId }: { pct: number; w: number; big: string; name: string; cfg: GaugeConfig; gradId: string }) {
  const { fill, cur } = useGaugeColors(pct, cfg, gradId);
  const glow = cfg.glow !== false;
  const showTrack = cfg.track !== false;
  const size = Math.min(w, 260);
  const stroke = Math.max(6, Math.round(size * 0.08));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const start = 150;
  const sweep = 240;
  const pol = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  };
  const arcPath = (fromDeg: number, toDeg: number) => {
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${pol(fromDeg)} A ${r} ${r} 0 ${large} 1 ${pol(toDeg)}`;
  };
  const p = Math.min(100, Math.max(0, pct));
  const end = start + (sweep * p) / 100;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size * 0.72 }}>
      <svg width={size} height={size} className="absolute top-0" style={{ overflow: "visible" }}>
        <SpectrumDef id={gradId} />
        {showTrack && <path d={arcPath(start, start + sweep)} fill="none" stroke="var(--color-bg-elevated, #1e2130)" strokeWidth={stroke} strokeLinecap="round" />}
        {p > 0 && (
          <path
            d={arcPath(start, end)}
            fill="none"
            stroke={fill}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ transition: "stroke 0.4s ease", filter: glow ? `drop-shadow(0 0 ${stroke * 0.7}px ${cur})` : undefined }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="font-mono tabular-nums font-semibold leading-none" style={{ fontSize: size * 0.2, color: cur }}>{big}</span>
        <span className="text-text-muted uppercase tracking-wide" style={{ fontSize: Math.max(8, size * 0.075) }}>{name}</span>
      </div>
    </div>
  );
}

function BarStyle({ pct, big, sub, name, cfg }: { pct: number; big: string; sub: string; name: string; cfg: GaugeConfig }) {
  const { cur, scale } = useGaugeColors(pct, cfg, "");
  const glow = cfg.glow !== false;
  const showTrack = cfg.track !== false;
  const p = Math.min(100, Math.max(0, pct));
  const barBg =
    scale === "gradient"
      ? "linear-gradient(90deg,#10b981 0%,#f59e0b 55%,#f43f5e 100%)"
      : cur;
  return (
    <div className="w-full px-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] text-text-muted uppercase tracking-wide">{name}</span>
        <span className="font-mono tabular-nums text-[22px] font-semibold leading-none" style={{ color: cur }}>{big}</span>
      </div>
      <div className={`w-full h-3 rounded-full overflow-hidden ${showTrack ? "bg-bg-elevated" : ""}`}>
        <div
          className="h-full rounded-full"
          style={{ width: `${p}%`, background: barBg, transition: "width 0.6s ease, background 0.4s ease", boxShadow: glow ? `0 0 8px ${cur}` : undefined }}
        />
      </div>
      <div className="mt-1.5 text-[11px] font-mono text-text-muted">{sub}</div>
    </div>
  );
}

function Spark({ hist, big, sub, name, w, cfg, gradId }: { hist: number[]; big: string; sub: string; name: string; w: number; cfg: GaugeConfig; gradId: string }) {
  const width = Math.max(80, w - 32);
  const height = 46;
  const pts = hist.length ? hist : [0];
  const cur = pts[pts.length - 1] ?? 0;
  const { cur: color, fill } = useGaugeColors(cur, cfg, gradId);
  const glow = cfg.glow !== false;
  const step = pts.length > 1 ? width / (pts.length - 1) : width;
  const coords = pts.map((v, i) => `${i * step},${height - (Math.min(100, v) / 100) * height}`);
  const line = `M ${coords.join(" L ")}`;
  const area = `${line} L ${(pts.length - 1) * step},${height} L 0,${height} Z`;
  const fillId = `${gradId}-f`;
  return (
    <div className="w-full px-4">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] text-text-muted uppercase tracking-wide">{name}</span>
        <span className="font-mono tabular-nums text-[22px] font-semibold leading-none" style={{ color }}>{big}</span>
      </div>
      <svg width={width} height={height} className="w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <SpectrumDef id={gradId} />
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fillId})`} />
        <path d={line} fill="none" stroke={fill} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ filter: glow ? `drop-shadow(0 0 3px ${color})` : undefined }} />
      </svg>
      <div className="mt-1 text-[11px] font-mono text-text-muted">{sub}</div>
    </div>
  );
}

function GaugeComponent({ config }: WidgetProps<GaugeConfig>) {
  const box = useSize<HTMLDivElement>();
  const cfg = config ?? {};
  const metric = cfg.metric ?? "cpu";
  const style = cfg.style ?? "ring";
  const uid = useId().replace(/:/g, "");
  const gradId = `gauge-${uid}`;
  const hist = useRef<number[]>([]);
  const [, tick] = useState(0);

  const { data, isError } = useQuery({
    queryKey: ["host"],
    queryFn: api.getHost,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (!data) return;
    const m = readMetric(data, metric);
    hist.current = [...hist.current, m.pct].slice(-40);
    tick((n) => n + 1);
  }, [data, metric]);

  if (isError || !data) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        Host stats unavailable.
      </div>
    );
  }

  const m = readMetric(data, metric);
  const name = cfg.label || m.name;

  let body: React.ReactNode;
  if (style === "bar") {
    body = <BarStyle pct={m.pct} big={m.big} sub={m.sub} name={name} cfg={cfg} />;
  } else if (style === "spark") {
    body = <Spark hist={hist.current} big={m.big} sub={m.sub} name={name} w={box.w} cfg={cfg} gradId={gradId} />;
  } else if (style === "arc") {
    body = <Arc pct={m.pct} w={box.w} big={m.big} name={name} cfg={cfg} gradId={gradId} />;
  } else {
    const size = Math.max(60, Math.min(box.w - 24, box.h - 24, 200)) || 96;
    body = <Ring pct={m.pct} size={size} big={m.big} name={name} cfg={cfg} gradId={gradId} />;
  }

  return (
    <div ref={box.ref} className="h-full flex flex-col items-center justify-center">
      {body}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${
        active ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function GaugeConfigPanel({ config, save }: WidgetConfigProps<GaugeConfig>) {
  const metric = config?.metric ?? "cpu";
  const style = config?.style ?? "ring";
  const scale = config?.colorScale ?? "threshold";
  const color = config?.color ?? "accent";
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
        <div className="grid grid-cols-4 gap-1">
          {(["ring", "arc", "bar", "spark"] as const).map((st) => (
            <Chip key={st} active={style === st} onClick={() => save({ style: st })}>{st}</Chip>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Colour scale</label>
        <div className="grid grid-cols-3 gap-1">
          {([
            ["threshold", "health"],
            ["gradient", "spectrum"],
            ["solid", "solid"],
          ] as const).map(([sc, lbl]) => (
            <Chip key={sc} active={scale === sc} onClick={() => save({ colorScale: sc })}>{lbl}</Chip>
          ))}
        </div>
        <p className="text-[10px] text-text-muted">
          {scale === "threshold" ? "Green → amber → red by load." : scale === "gradient" ? "Smooth spectrum by value." : "One fixed colour."}
        </p>
      </div>

      {scale === "solid" && (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Colour</label>
          <div className="flex flex-wrap gap-1.5">
            {(["accent", "emerald", "cyan", "blue", "violet", "amber", "rose"] as const).map((c) => (
              <button
                key={c}
                onClick={() => save({ color: c })}
                title={c}
                className={`w-6 h-6 rounded-full ring-2 transition-transform ${color === c ? "ring-text scale-110" : "ring-transparent hover:scale-105"}`}
                style={{ background: PALETTE[c] }}
              />
            ))}
          </div>
        </div>
      )}

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
  description: "One host metric (CPU/RAM/disk/swap) as a ring, arc, bar or live sparkline — themable colours + glow.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 6,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: { metric: "cpu", style: "ring", colorScale: "threshold", glow: true, track: true },
  Component: GaugeComponent,
  ConfigPanel: GaugeConfigPanel,
};

export default definition;
