import { useEffect, useRef, useState } from "react";
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
// configurable ring, arc, bar, or live sparkline. Reads /api/host; keeps a
// short rolling history locally for the sparkline style.
// ---------------------------------------------------------------------------

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

type Metric = { pct: number; big: string; sub: string; name: string };

function readMetric(d: HostStats, metric: string): Metric {
  switch (metric) {
    case "ram":
      return {
        pct: d.mem_total > 0 ? (d.mem_used / d.mem_total) * 100 : 0,
        big: `${d.mem_total > 0 ? Math.round((d.mem_used / d.mem_total) * 100) : 0}%`,
        sub: `${fmtBytes(d.mem_used)} / ${fmtBytes(d.mem_total)}`,
        name: "RAM",
      };
    case "disk":
      return {
        pct: d.disk_total > 0 ? (d.disk_used / d.disk_total) * 100 : 0,
        big: `${d.disk_total > 0 ? Math.round((d.disk_used / d.disk_total) * 100) : 0}%`,
        sub: `${fmtBytes(d.disk_used)} / ${fmtBytes(d.disk_total)}`,
        name: "Disk",
      };
    case "swap":
      return {
        pct: d.swap_total > 0 ? (d.swap_used / d.swap_total) * 100 : 0,
        big: `${d.swap_total > 0 ? Math.round((d.swap_used / d.swap_total) * 100) : 0}%`,
        sub: d.swap_total > 0 ? `${fmtBytes(d.swap_used)} / ${fmtBytes(d.swap_total)}` : "no swap",
        name: "Swap",
      };
    default:
      return {
        pct: d.cpu_pct,
        big: `${Math.round(d.cpu_pct)}%`,
        sub: `${d.cpus} cores`,
        name: "CPU",
      };
  }
}

// Tailwind color tokens resolve at runtime via CSS vars; read them for SVG.
function toneColor(pct: number): string {
  if (pct > 90) return "var(--color-down, #f43f5e)";
  if (pct > 75) return "var(--color-degraded, #f59e0b)";
  return "var(--color-up, #10b981)";
}

function Ring({ pct, size, big, name }: { pct: number; size: number; big: string; name: string }) {
  const stroke = Math.max(5, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-bg-elevated, #1e2130)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneColor(pct)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono tabular-nums font-semibold text-text leading-none" style={{ fontSize: size * 0.24 }}>
          {big}
        </span>
        <span className="text-text-muted uppercase tracking-wide" style={{ fontSize: Math.max(8, size * 0.1) }}>
          {name}
        </span>
      </div>
    </div>
  );
}

function Arc({ pct, w, big, name }: { pct: number; w: number; big: string; name: string }) {
  const size = Math.min(w, 260);
  const stroke = Math.max(6, Math.round(size * 0.08));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // 240° sweep from 150° to 390°.
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
        <path d={arcPath(start, start + sweep)} fill="none" stroke="var(--color-bg-elevated, #1e2130)" strokeWidth={stroke} strokeLinecap="round" />
        {p > 0 && (
          <path
            d={arcPath(start, end)}
            fill="none"
            stroke={toneColor(pct)}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ transition: "stroke 0.4s ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="font-mono tabular-nums font-semibold text-text leading-none" style={{ fontSize: size * 0.2 }}>
          {big}
        </span>
        <span className="text-text-muted uppercase tracking-wide" style={{ fontSize: Math.max(8, size * 0.075) }}>
          {name}
        </span>
      </div>
    </div>
  );
}

function BarStyle({ pct, big, sub, name }: { pct: number; big: string; sub: string; name: string }) {
  return (
    <div className="w-full px-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] text-text-muted uppercase tracking-wide">{name}</span>
        <span className="font-mono tabular-nums text-[22px] font-semibold text-text leading-none">{big}</span>
      </div>
      <div className="w-full h-3 rounded-full bg-bg-elevated overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: toneColor(pct), transition: "width 0.6s ease, background 0.4s ease" }}
        />
      </div>
      <div className="mt-1.5 text-[11px] font-mono text-text-muted">{sub}</div>
    </div>
  );
}

function Spark({ hist, big, sub, name, w }: { hist: number[]; big: string; sub: string; name: string; w: number }) {
  const width = Math.max(80, w - 32);
  const height = 46;
  const pts = hist.length ? hist : [0];
  const max = 100;
  const step = pts.length > 1 ? width / (pts.length - 1) : width;
  const coords = pts.map((v, i) => `${i * step},${height - (Math.min(max, v) / max) * height}`);
  const line = `M ${coords.join(" L ")}`;
  const area = `${line} L ${(pts.length - 1) * step},${height} L 0,${height} Z`;
  const cur = pts[pts.length - 1] ?? 0;
  return (
    <div className="w-full px-4">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] text-text-muted uppercase tracking-wide">{name}</span>
        <span className="font-mono tabular-nums text-[22px] font-semibold text-text leading-none">{big}</span>
      </div>
      <svg width={width} height={height} className="w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="gauge-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={toneColor(cur)} stopOpacity="0.35" />
            <stop offset="1" stopColor={toneColor(cur)} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#gauge-spark-fill)" />
        <path d={line} fill="none" stroke={toneColor(cur)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1 text-[11px] font-mono text-text-muted">{sub}</div>
    </div>
  );
}

function GaugeComponent({ config }: WidgetProps<GaugeConfig>) {
  const box = useSize<HTMLDivElement>();
  const metric = config?.metric ?? "cpu";
  const style = config?.style ?? "ring";
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
  const name = config?.label || m.name;

  let body: React.ReactNode;
  if (style === "bar") {
    body = <BarStyle pct={m.pct} big={m.big} sub={m.sub} name={name} />;
  } else if (style === "spark") {
    body = <Spark hist={hist.current} big={m.big} sub={m.sub} name={name} w={box.w} />;
  } else if (style === "arc") {
    body = <Arc pct={m.pct} w={box.w} big={m.big} name={name} />;
  } else {
    const size = Math.max(60, Math.min(box.w - 24, box.h - 24, 200)) || 96;
    body = <Ring pct={m.pct} size={size} big={m.big} name={name} />;
  }

  return (
    <div ref={box.ref} className="h-full flex flex-col items-center justify-center">
      {body}
    </div>
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
            <button
              key={mt}
              onClick={() => save({ metric: mt })}
              className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${
                metric === mt ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
              }`}
            >
              {mt}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Style</label>
        <div className="grid grid-cols-4 gap-1">
          {(["ring", "arc", "bar", "spark"] as const).map((st) => (
            <button
              key={st}
              onClick={() => save({ style: st })}
              className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${
                style === st ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
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
  description: "One host metric (CPU/RAM/disk/swap) as a ring, arc, bar or live sparkline.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 6,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: { metric: "cpu", style: "ring" },
  Component: GaugeComponent,
  ConfigPanel: GaugeConfigPanel,
};

export default definition;
