import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type { TempsConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Temperatures widget — hardware sensors from /sys/class/hwmon. Size-responsive:
// a compact hottest-reading pill when short, a bar list otherwise, in one or
// two columns depending on width.
// ---------------------------------------------------------------------------

function tone(c: number): string {
  if (c >= 85) return "bg-down";
  if (c >= 70) return "bg-degraded";
  return "bg-up";
}
function toneText(c: number): string {
  if (c >= 85) return "text-down";
  if (c >= 70) return "text-degraded";
  return "text-up";
}

function TempsComponent({ config }: WidgetProps<TempsConfig>) {
  const box = useSize<HTMLDivElement>();
  const filter = config?.filter?.trim().toLowerCase() ?? "";
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: 5_000 });

  const temps = useMemo(() => {
    let t = data?.temps ?? [];
    if (filter) t = t.filter((x) => x.label.toLowerCase().includes(filter));
    return [...t].sort((a, b) => b.celsius - a.celsius);
  }, [data, filter]);

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }
  if (temps.length === 0) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">No temperature sensors exposed.</div>;
  }

  const hottest = temps[0];
  const compact = box.h > 0 && box.h < 104;
  const cols = box.w >= 420 ? 2 : 1;

  if (compact) {
    return (
      <div ref={box.ref} className="h-full flex flex-col justify-center px-3.5">
        <span className="text-[11px] text-text-muted uppercase tracking-wide">{hottest.label}</span>
        <span className={`font-mono tabular-nums text-3xl font-semibold leading-none ${toneText(hottest.celsius)}`}>
          {hottest.celsius.toFixed(0)}°
        </span>
      </div>
    );
  }

  return (
    <div ref={box.ref} className="h-full overflow-auto px-3 py-2.5">
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, columnGap: "14px", rowGap: "7px" }}>
        {temps.map((t, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-baseline justify-between text-[11px] gap-2">
              <span className="text-text-secondary truncate">{t.label}</span>
              <span className={`font-mono tabular-nums ${toneText(t.celsius)}`}>{t.celsius.toFixed(0)}°C</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-bg-elevated overflow-hidden">
              <div className={`h-full ${tone(t.celsius)}`} style={{ width: `${Math.min(100, (t.celsius / 100) * 100)}%`, transition: "width 0.5s ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TempsConfigPanel({ config, save }: WidgetConfigProps<TempsConfig>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Label filter</label>
      <input
        value={config?.filter ?? ""}
        onChange={(e) => save({ filter: e.target.value })}
        placeholder="e.g. Core, nvme, Package"
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
      <p className="text-[11px] text-text-muted">Reads /sys/class/hwmon on the host.</p>
    </div>
  );
}

const TempsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
);

const definition: WidgetDefinition<TempsConfig> = {
  type: "temps",
  title: "Temperatures",
  icon: TempsIcon,
  category: "infrastructure",
  description: "Hardware temperature sensors (CPU, NVMe, chipset) from the host.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: TempsComponent,
  ConfigPanel: TempsConfigPanel,
};

export default definition;
