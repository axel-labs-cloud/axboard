import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type { PerCpuConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Per-core CPU widget — one bar per logical core, live. Size-responsive: the
// bars reflow into as many columns as fit, and grow taller in a taller widget.
// ---------------------------------------------------------------------------

const PALETTE: Record<string, string> = {
  emerald: "#10b981", cyan: "#06b6d4", violet: "#8b5cf6", amber: "#f59e0b", rose: "#f43f5e",
};

function colorFor(pct: number, mode: string): string {
  if (mode === "accent") return "var(--color-accent, #818cf8)";
  if (PALETTE[mode]) return PALETTE[mode];
  if (pct > 90) return "var(--color-down, #f43f5e)";
  if (pct > 70) return "var(--color-degraded, #f59e0b)";
  return "var(--color-up, #10b981)";
}

function PerCpuComponent({ config }: WidgetProps<PerCpuConfig>) {
  const box = useSize<HTMLDivElement>();
  const mode = config?.color ?? "threshold";
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: 2_000 });

  if (isError || !data) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        Host stats unavailable.
      </div>
    );
  }

  const cores = data.per_cpu ?? [];
  const n = cores.length;
  const avg = n ? cores.reduce((a, b) => a + b, 0) / n : data.cpu_pct;

  // Choose a column count so each bar is at least ~14px wide.
  const usableW = Math.max(0, box.w - 24);
  const cols = Math.max(1, Math.min(n, Math.floor(usableW / 16))) || 8;

  return (
    <div ref={box.ref} className="h-full flex flex-col px-3 py-2.5">
      <div className="flex items-baseline justify-between shrink-0 mb-2">
        <span className="text-[11px] text-text-muted uppercase tracking-wide">CPU · {n} cores</span>
        <span className="font-mono tabular-nums text-[15px] font-semibold" style={{ color: colorFor(avg, mode) }}>
          {avg.toFixed(0)}%
        </span>
      </div>
      <div
        className="flex-1 min-h-0"
        style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: "3px", alignItems: "end" }}
      >
        {cores.map((p, i) => (
          <div key={i} title={`core ${i}: ${p.toFixed(0)}%`} className="relative h-full rounded-sm bg-bg-elevated overflow-hidden flex items-end">
            <div className="w-full rounded-sm" style={{ height: `${Math.max(3, p)}%`, background: colorFor(p, mode), transition: "height 0.5s ease, background 0.4s ease" }} />
          </div>
        ))}
        {n === 0 && <div className="text-[11px] text-text-muted col-span-full">No per-core data.</div>}
      </div>
    </div>
  );
}

function PerCpuConfigPanel({ config, save }: WidgetConfigProps<PerCpuConfig>) {
  const mode = config?.color ?? "threshold";
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Colour</label>
      <div className="grid grid-cols-4 gap-1">
        {(["threshold", "accent", "emerald", "cyan", "violet", "amber", "rose"] as const).map((c) => (
          <button
            key={c}
            onClick={() => save({ color: c })}
            className={`px-1.5 py-1.5 text-[10px] rounded border capitalize transition-colors ${
              mode === c ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
            }`}
          >
            {c === "threshold" ? "health" : c}
          </button>
        ))}
      </div>
    </div>
  );
}

const PerCpuIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9 9v6M12 9v6M15 9v6" />
  </svg>
);

const definition: WidgetDefinition<PerCpuConfig> = {
  type: "percpu",
  title: "Per-core CPU",
  icon: PerCpuIcon,
  category: "infrastructure",
  description: "Live utilisation of every logical CPU core as a bar strip.",
  minW: 2,
  minH: 2,
  maxW: 12,
  maxH: 6,
  defaultW: 4,
  defaultH: 2,
  defaultConfig: { color: "threshold" },
  Component: PerCpuComponent,
  ConfigPanel: PerCpuConfigPanel,
};

export default definition;
