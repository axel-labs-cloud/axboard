import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import { PALETTE } from "../colorScale";
import type { NetGraphConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Network throughput graph — a live area chart of download (in) and upload
// (out) from a rolling history of /api/host counters. Two styles: "stack"
// (both from the bottom) or "mirror" (in above / out below a centre line).
// ---------------------------------------------------------------------------

const MAX_POINTS = 90;

function fmtRate(bps: number): string {
  if (bps < 1) return "0";
  const u = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bps) / Math.log(1024)));
  return `${(bps / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

// Area path for `vals` over width w, band height h, scaled to max. When flip is
// set the band grows downward from y=0; otherwise it grows up from y=h.
function area(vals: number[], w: number, h: number, max: number, flip: boolean): string {
  if (vals.length === 0 || max <= 0) return "";
  const step = vals.length > 1 ? w / (vals.length - 1) : w;
  const y = (v: number) => (flip ? (v / max) * h : h - (v / max) * h);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${y(Math.min(v, max)).toFixed(1)}`);
  const last = ((vals.length - 1) * step).toFixed(1);
  const base = flip ? "0" : h.toFixed(1);
  return `M 0,${base} L ${pts.join(" L ")} L ${last},${base} Z`;
}

function col(key: string | undefined, fallback: string): string {
  return key ? PALETTE[key] ?? fallback : fallback;
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

  const style = config?.style ?? "stack";
  const inColor = col(config?.colorIn, "var(--color-up, #10b981)");
  const outColor = col(config?.colorOut, "var(--color-accent, #818cf8)");

  const w = Math.max(40, box.w);
  const chartH = Math.max(24, box.h - 30);
  const fixed = config?.scaleMbit ? (config.scaleMbit * 1e6) / 8 : 0;
  const peak = Math.max(1, fixed || Math.max(...rx.current, ...tx.current, 1) * 1.15);

  return (
    <div ref={box.ref} className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 pt-1.5 shrink-0 text-[11px]">
        <span className="flex items-center gap-1.5" style={{ color: inColor }}>
          <span className="w-2 h-2 rounded-sm" style={{ background: inColor }} /> In {fmtRate(data.net_rx_bps)}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: outColor }}>
          Out {fmtRate(data.net_tx_bps)} <span className="w-2 h-2 rounded-sm" style={{ background: outColor }} />
        </span>
      </div>
      <svg width={w} height={chartH} className="w-full flex-1" preserveAspectRatio="none" viewBox={`0 0 ${w} ${chartH}`}>
        <defs>
          <linearGradient id="ng-in" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={inColor} stopOpacity="0.5" />
            <stop offset="1" stopColor={inColor} stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="ng-out" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={outColor} stopOpacity="0.5" />
            <stop offset="1" stopColor={outColor} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {style === "mirror" ? (
          <>
            <line x1="0" y1={chartH / 2} x2={w} y2={chartH / 2} stroke="var(--color-border-subtle, #ffffff18)" strokeWidth="1" />
            <path d={area(rx.current, w, chartH / 2, peak, false)} fill="url(#ng-in)" stroke={inColor} strokeWidth="1.5" />
            <g transform={`translate(0,${chartH / 2})`}>
              <path d={area(tx.current, w, chartH / 2, peak, true)} fill="url(#ng-out)" stroke={outColor} strokeWidth="1.5" />
            </g>
          </>
        ) : (
          <>
            <path d={area(tx.current, w, chartH, peak, false)} fill="url(#ng-out)" stroke={outColor} strokeWidth="1.5" />
            <path d={area(rx.current, w, chartH, peak, false)} fill="url(#ng-in)" stroke={inColor} strokeWidth="1.5" />
          </>
        )}
      </svg>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string) => void }) {
  const keys = ["emerald", "cyan", "blue", "violet", "amber", "rose", "accent"];
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => onChange(k)}
            title={k}
            className={`w-5 h-5 rounded-full ring-2 transition-transform ${value === k ? "ring-text scale-110" : "ring-transparent hover:scale-105"}`}
            style={{ background: PALETTE[k] }}
          />
        ))}
      </div>
    </div>
  );
}

function NetGraphConfigPanel({ config, save }: WidgetConfigProps<NetGraphConfig>) {
  const style = config?.style ?? "stack";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Style</label>
        <div className="grid grid-cols-2 gap-1">
          {([
            ["stack", "from bottom"],
            ["mirror", "mirror"],
          ] as const).map(([s, lbl]) => (
            <button
              key={s}
              onClick={() => save({ style: s })}
              className={`px-2 py-1.5 text-[11px] rounded border transition-colors ${style === s ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <ColorRow label="In (download)" value={config?.colorIn} onChange={(v) => save({ colorIn: v })} />
      <ColorRow label="Out (upload)" value={config?.colorOut} onChange={(v) => save({ colorOut: v })} />
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
  description: "Live download/upload throughput as an area chart, with a legend.",
  minW: 3,
  minH: 2,
  maxW: 12,
  maxH: 6,
  defaultW: 4,
  defaultH: 2,
  defaultConfig: { style: "stack" },
  Component: NetGraphComponent,
  ConfigPanel: NetGraphConfigPanel,
};

export default definition;
