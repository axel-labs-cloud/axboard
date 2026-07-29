import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type { DisksConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Filesystems widget — a usage bar for every mounted real filesystem. Two
// columns when wide, one when narrow.
// ---------------------------------------------------------------------------

function fmtBytes(n: number): string {
  if (n <= 0) return "0";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)}${u[i]}`;
}
function tone(pct: number): string {
  return pct > 90 ? "bg-down" : pct > 75 ? "bg-degraded" : "bg-up";
}

function DisksComponent({ config }: WidgetProps<DisksConfig>) {
  const box = useSize<HTMLDivElement>();
  const filter = config?.filter?.trim().toLowerCase() ?? "";
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: 15_000 });

  const fs = useMemo(() => {
    let f = data?.filesystems ?? [];
    if (filter) f = f.filter((x) => x.path.toLowerCase().includes(filter));
    return [...f].sort((a, b) => b.total - a.total);
  }, [data, filter]);

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }
  if (fs.length === 0) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">No filesystems reported.</div>;
  }

  const cols = box.w >= 440 ? 2 : 1;

  return (
    <div ref={box.ref} className="h-full overflow-auto px-3 py-2.5">
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, columnGap: "14px", rowGap: "9px" }}>
        {fs.map((d) => {
          const pct = d.total > 0 ? (d.used / d.total) * 100 : 0;
          return (
            <div key={d.path} className="space-y-1">
              <div className="flex items-baseline justify-between text-[11px] gap-2">
                <span className="text-text-secondary font-mono truncate">{d.path}</span>
                <span className="font-mono tabular-nums text-text-muted shrink-0">{fmtBytes(d.used)}/{fmtBytes(d.total)}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                <div className={`h-full ${tone(pct)}`} style={{ width: `${Math.min(100, pct)}%`, transition: "width 0.5s ease" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DisksConfigPanel({ config, save }: WidgetConfigProps<DisksConfig>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Path filter</label>
      <input
        value={config?.filter ?? ""}
        onChange={(e) => save({ filter: e.target.value })}
        placeholder="e.g. /mnt"
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
      <p className="text-[11px] text-text-muted">Real on-disk filesystems (ext4/xfs/btrfs/zfs/…).</p>
    </div>
  );
}

const DisksIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="2" y="4" width="20" height="6" rx="1" /><rect x="2" y="14" width="20" height="6" rx="1" />
    <line x1="6" y1="7" x2="6.01" y2="7" /><line x1="6" y1="17" x2="6.01" y2="17" />
  </svg>
);

const definition: WidgetDefinition<DisksConfig> = {
  type: "disks",
  title: "Filesystems",
  icon: DisksIcon,
  category: "infrastructure",
  description: "Usage bars for every mounted real filesystem on the host.",
  minW: 2,
  minH: 2,
  maxW: 10,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: DisksComponent,
  ConfigPanel: DisksConfigPanel,
};

export default definition;
