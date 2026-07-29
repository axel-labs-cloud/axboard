import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import { PALETTE } from "../colorScale";
import { WindowChips, windowPoints, maxBuffer, type TimeWindow } from "../timeWindow";
import type { NetGraphConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Network throughput graph — a live area chart of download (in) and upload
// (out) from a rolling history of /api/host counters. Two styles: "stack"
// (both from the bottom) or "mirror" (in above / out below a centre line).
// ---------------------------------------------------------------------------

const POLL_MS = 2000;

function fmtRate(bps: number): string {
  if (bps < 1) return "0";
  const u = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bps) / Math.log(1024)));
  return `${(bps / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}

// Catmull-Rom → cubic-bezier smoothing over a list of points.
function smooth(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) return `M ${pts.map((p) => `${p[0]},${p[1]}`).join(" L ")}`;
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

// Smooth line + filled area for `vals` over a band of height h scaled to max.
// flip grows the band downward from y=0; otherwise upward from y=h.
function paths(vals: number[], w: number, h: number, max: number, flip: boolean): { line: string; fill: string } {
  if (vals.length === 0 || max <= 0) return { line: "", fill: "" };
  const step = vals.length > 1 ? w / (vals.length - 1) : w;
  const y = (v: number) => (flip ? (v / max) * h : h - (v / max) * h);
  const pts: [number, number][] = vals.map((v, i) => [i * step, y(Math.min(v, max))]);
  const line = smooth(pts);
  const last = (vals.length - 1) * step;
  const base = flip ? 0 : h;
  const fill = `${line} L ${last.toFixed(1)},${base} L 0,${base} Z`;
  return { line, fill };
}

function col(key: string | undefined, fallback: string): string {
  return key ? PALETTE[key] ?? fallback : fallback;
}

function NetGraphComponent({ config, save }: WidgetProps<NetGraphConfig>) {
  const box = useSize<HTMLDivElement>();
  const rx = useRef<number[]>([]);
  const tx = useRef<number[]>([]);
  const [, tick] = useState(0);
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: POLL_MS });

  useEffect(() => {
    if (!data) return;
    const cap = maxBuffer(POLL_MS);
    rx.current = [...rx.current, data.net_rx_bps].slice(-cap);
    tx.current = [...tx.current, data.net_tx_bps].slice(-cap);
    tick((n) => n + 1);
  }, [data]);

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }

  const style = config?.style ?? "stack";
  const win = (config?.window ?? "5m") as TimeWindow;
  const n = windowPoints(win, POLL_MS);
  const rxV = rx.current.slice(-n);
  const txV = tx.current.slice(-n);
  const inColor = col(config?.colorIn, "var(--color-up, #10b981)");
  const outColor = col(config?.colorOut, "var(--color-accent, #818cf8)");

  const w = Math.max(40, box.w);
  const showHeader = box.h >= 58; // hide the legend row when very short (1H)
  const chartH = Math.max(20, box.h - (showHeader ? 30 : 4));
  const fixed = config?.scaleMbit ? (config.scaleMbit * 1e6) / 8 : 0;
  const peak = Math.max(1, fixed || Math.max(...rxV, ...txV, 1) * 1.15);

  const inP = paths(rxV, w, style === "mirror" ? chartH / 2 : chartH, peak, false);
  const outP = paths(txV, w, style === "mirror" ? chartH / 2 : chartH, peak, style === "mirror");
  const grid = style === "mirror" ? [chartH / 2] : [chartH * 0.33, chartH * 0.66];

  return (
    <div ref={box.ref} className="h-full flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between px-3 pt-1.5 shrink-0 text-[11px] gap-2">
          <span className="flex items-center gap-1.5 min-w-0" style={{ color: inColor }}>
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: inColor }} /> <span className="truncate">In {fmtRate(data.net_rx_bps)}</span>
          </span>
          {box.w >= 300 && <WindowChips value={win} onChange={(wv) => save({ window: wv })} size="xs" />}
          <span className="flex items-center gap-1.5 min-w-0 justify-end" style={{ color: outColor }}>
            <span className="truncate">Out {fmtRate(data.net_tx_bps)}</span> <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: outColor }} />
          </span>
        </div>
      )}
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
        {grid.map((gy, i) => (
          <line key={i} x1="0" y1={gy} x2={w} y2={gy} stroke="var(--color-border-subtle, #ffffff14)" strokeWidth="1" strokeDasharray={style === "mirror" ? undefined : "2 4"} />
        ))}
        {style === "mirror" ? (
          <>
            <path d={inP.fill} fill="url(#ng-in)" />
            <path d={inP.line} fill="none" stroke={inColor} strokeWidth="1.75" style={{ filter: `drop-shadow(0 0 3px ${inColor})` }} />
            <g transform={`translate(0,${chartH / 2})`}>
              <path d={outP.fill} fill="url(#ng-out)" />
              <path d={outP.line} fill="none" stroke={outColor} strokeWidth="1.75" style={{ filter: `drop-shadow(0 0 3px ${outColor})` }} />
            </g>
          </>
        ) : (
          <>
            <path d={outP.fill} fill="url(#ng-out)" />
            <path d={outP.line} fill="none" stroke={outColor} strokeWidth="1.75" style={{ filter: `drop-shadow(0 0 3px ${outColor})` }} />
            <path d={inP.fill} fill="url(#ng-in)" />
            <path d={inP.line} fill="none" stroke={inColor} strokeWidth="1.75" style={{ filter: `drop-shadow(0 0 3px ${inColor})` }} />
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
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Time window</label>
        <WindowChips value={(config?.window ?? "5m") as TimeWindow} onChange={(w) => save({ window: w })} />
      </div>
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
  minH: 1,
  maxW: 12,
  maxH: 6,
  defaultW: 4,
  defaultH: 2,
  defaultConfig: { style: "stack", window: "5m" },
  Component: NetGraphComponent,
  ConfigPanel: NetGraphConfigPanel,
};

export default definition;
