import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type { NetGraphConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Network throughput graph — a live mirrored area chart of download (rx, up)
// and upload (tx, down) built from a rolling history of /api/host counters.
// Auto-scales to the window peak unless a fixed Mbit/s scale is set.
// ---------------------------------------------------------------------------

const MAX_POINTS = 90;

function fmtRate(bps: number): string {
  if (bps < 1) return "0";
  const u = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bps) / Math.log(1024)));
  return `${(bps / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

function area(vals: number[], w: number, h: number, max: number, flip: boolean): string {
  if (vals.length === 0 || max <= 0) return "";
  const step = vals.length > 1 ? w / (vals.length - 1) : w;
  const y = (v: number) => (flip ? (v / max) * h : h - (v / max) * h);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${y(Math.min(v, max)).toFixed(1)}`);
  const last = ((vals.length - 1) * step).toFixed(1);
  const base = flip ? "0" : h.toFixed(1);
  return `M 0,${base} L ${pts.join(" L ")} L ${last},${base} Z`;
}

function NetGraphComponent({ config }: WidgetProps<NetGraphConfig>) {
  const box = useSize<HTMLDivElement>();
  const rx = useRef<number[]>([]);
  const tx = useRef<number[]>([]);
  const [, tick] = useState(0);
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: 2_000 });

  useEffect(() => {
    if (!data) return;
    rx.current = [...rx.current, data.net_rx_bps].slice(-MAX_POINTS);
    tx.current = [...tx.current, data.net_tx_bps].slice(-MAX_POINTS);
    tick((n) => n + 1);
  }, [data]);

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }

  const w = Math.max(40, box.w);
  const chartH = Math.max(24, box.h - 34);
  const half = chartH / 2;
  const fixed = config?.scaleMbit ? (config.scaleMbit * 1e6) / 8 : 0;
  const peak = Math.max(1, fixed || Math.max(...rx.current, ...tx.current, 1) * 1.15);

  return (
    <div ref={box.ref} className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 pt-2 shrink-0 text-[11px]">
        <span className="flex items-center gap-1 text-up"><span className="w-1.5 h-1.5 rounded-full bg-up" />↓ {fmtRate(data.net_rx_bps)}</span>
        <span className="flex items-center gap-1 text-accent">↑ {fmtRate(data.net_tx_bps)} <span className="w-1.5 h-1.5 rounded-full bg-accent" /></span>
      </div>
      <svg width={w} height={chartH} className="w-full flex-1" preserveAspectRatio="none" viewBox={`0 0 ${w} ${chartH}`}>
        <defs>
          <linearGradient id="ng-rx" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-up, #10b981)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--color-up, #10b981)" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="ng-tx" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent, #818cf8)" stopOpacity="0.05" />
            <stop offset="1" stopColor="var(--color-accent, #818cf8)" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <line x1="0" y1={half} x2={w} y2={half} stroke="var(--color-border-subtle, #ffffff18)" strokeWidth="1" />
        <g transform={`translate(0,0)`}>
          <path d={area(rx.current, w, half, peak, false)} fill="url(#ng-rx)" stroke="var(--color-up, #10b981)" strokeWidth="1.5" />
        </g>
        <g transform={`translate(0,${half})`}>
          <path d={area(tx.current, w, half, peak, true)} fill="url(#ng-tx)" stroke="var(--color-accent, #818cf8)" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

function NetGraphConfigPanel({ config, save }: WidgetConfigProps<NetGraphConfig>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Fixed scale (Mbit/s)</label>
      <input
        value={config?.scaleMbit ? String(config.scaleMbit) : ""}
        onChange={(e) => save({ scaleMbit: Math.max(0, parseInt(e.target.value) || 0) })}
        placeholder="auto"
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
      <p className="text-[11px] text-text-muted">Blank = auto-scale to the window peak. Sums physical NICs (needs host networking).</p>
    </div>
  );
}

const NetGraphIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
);

const definition: WidgetDefinition<NetGraphConfig> = {
  type: "netgraph",
  title: "Network graph",
  icon: NetGraphIcon,
  category: "infrastructure",
  description: "Live download/upload throughput as a mirrored area chart.",
  minW: 3,
  minH: 2,
  maxW: 12,
  maxH: 6,
  defaultW: 4,
  defaultH: 2,
  defaultConfig: {},
  Component: NetGraphComponent,
  ConfigPanel: NetGraphConfigPanel,
};

export default definition;
