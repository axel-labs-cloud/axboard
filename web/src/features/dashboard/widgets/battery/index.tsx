import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type { BatteryConfig, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Battery / UPS widget — power supplies from /sys/class/power_supply. Shows a
// horizontal battery glyph per supply that fills and colours by charge. Empty
// on desktops with no battery.
// ---------------------------------------------------------------------------

function tone(pct: number, charging: boolean): string {
  if (charging) return "var(--color-up, #10b981)";
  if (pct <= 15) return "var(--color-down, #f43f5e)";
  if (pct <= 35) return "var(--color-degraded, #f59e0b)";
  return "var(--color-up, #10b981)";
}

function BatteryComponent(_: WidgetProps<BatteryConfig>) {
  const box = useSize<HTMLDivElement>();
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: 10_000 });

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }
  const bats = data.batteries ?? [];
  if (bats.length === 0) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">No battery or UPS detected.</div>;
  }

  return (
    <div ref={box.ref} className="h-full flex flex-col items-stretch justify-center gap-3 px-4 py-3">
      {bats.map((b) => {
        const charging = /charg|full/i.test(b.status);
        const color = tone(b.pct, charging);
        return (
          <div key={b.name} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-text-muted uppercase tracking-wide truncate">{b.name}</span>
              <span className="font-mono tabular-nums font-semibold inline-flex items-center gap-1" style={{ color }}>
                {b.pct}%
                {charging && (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 shrink-0" aria-label="charging"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" /></svg>
                )}
              </span>
            </div>
            <div className="relative flex items-center gap-1">
              <div className="relative flex-1 h-5 rounded border-2 border-border-subtle overflow-hidden bg-bg-elevated">
                <div className="h-full rounded-sm" style={{ width: `${Math.min(100, Math.max(0, b.pct))}%`, background: color, transition: "width 0.6s ease, background 0.4s ease" }} />
              </div>
              <div className="w-1 h-2.5 rounded-r-sm bg-border-subtle" />
            </div>
            <div className="text-[10px] text-text-muted capitalize">{b.status.toLowerCase()}</div>
          </div>
        );
      })}
    </div>
  );
}

const BatteryIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="2" y="7" width="16" height="10" rx="2" /><line x1="22" y1="11" x2="22" y2="13" /><line x1="6" y1="11" x2="6" y2="13" />
  </svg>
);

const definition: WidgetDefinition<BatteryConfig> = {
  type: "battery",
  title: "Battery / UPS",
  icon: BatteryIcon,
  category: "infrastructure",
  description: "Charge and status of any battery or UPS the host exposes.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 5,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: BatteryComponent,
};

export default definition;
