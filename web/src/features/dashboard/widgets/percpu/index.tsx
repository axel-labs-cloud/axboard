import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import { ColorControls, scaleColor, type ColorConfig } from "../colorScale";
import type { PerCpuConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Per-core CPU widget — one full-height column per logical core, each filling
// from the bottom by utilisation. Bars reflow into as many columns as fit.
// ---------------------------------------------------------------------------

const OPTS = { lo: 0, hi: 100, warn: 70, crit: 90 };

function PerCpuComponent({ config }: WidgetProps<PerCpuConfig>) {
  const box = useSize<HTMLDivElement>();
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: 2_000 });

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }

  const cores = data.per_cpu ?? [];
  const n = cores.length;
  const avg = n ? cores.reduce((a, b) => a + b, 0) / n : data.cpu_pct;
  const gap = n > 32 ? 1 : n > 16 ? 2 : 3;

  return (
    <div ref={box.ref} className="h-full flex flex-col px-3 py-2.5 min-h-0">
      <div className="flex items-baseline justify-between shrink-0 mb-2">
        <span className="text-[11px] text-text-muted uppercase tracking-wide">CPU · {n} cores</span>
        <span className="font-mono tabular-nums text-[15px] font-semibold" style={{ color: scaleColor(avg, config as ColorConfig, OPTS) }}>
          {avg.toFixed(0)}%
        </span>
      </div>
      {/* One flex row of full-height columns — always fills, never leaves gaps. */}
      <div className="flex-1 min-h-0 w-full flex items-stretch" style={{ gap: `${gap}px` }}>
        {cores.map((p, i) => (
          <div key={i} title={`core ${i}: ${p.toFixed(0)}%`} className="relative flex-1 min-w-0 h-full rounded-sm bg-bg-elevated overflow-hidden">
            <div
              className="absolute bottom-0 left-0 right-0 rounded-sm"
              style={{ height: `${Math.min(100, p)}%`, background: scaleColor(p, config as ColorConfig, OPTS), transition: "height 0.5s ease, background 0.4s ease" }}
            />
          </div>
        ))}
        {n === 0 && <div className="text-[11px] text-text-muted self-center">No per-core data.</div>}
      </div>
    </div>
  );
}

function PerCpuConfigPanel({ config, save }: WidgetConfigProps<PerCpuConfig>) {
  return <ColorControls cfg={config} save={save} opts={OPTS} unit="%" />;
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
  category: "system",
  description: "Live utilisation of every logical CPU core as a bar strip.",
  minW: 2,
  minH: 2,
  maxW: 12,
  maxH: 6,
  defaultW: 4,
  defaultH: 2,
  defaultConfig: { colorScale: "threshold" },
  Component: PerCpuComponent,
  ConfigPanel: PerCpuConfigPanel,
};

export default definition;
