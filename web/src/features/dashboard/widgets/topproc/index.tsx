import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type { TopProcConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Top-processes widget — the busiest host processes by CPU or memory. Needs the
// host PID namespace (compose `pid: host`); otherwise it only sees axboard.
// ---------------------------------------------------------------------------

function fmtMem(b: number): string {
  if (b <= 0) return "0";
  const gb = b / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)}G` : `${Math.round(b / 1e6)}M`;
}

const ROW_H = 26; // px per process row

function TopProcComponent({ config }: WidgetProps<TopProcConfig>) {
  const box = useSize<HTMLDivElement>();
  const sortBy = config?.sort ?? "cpu";
  // How many rows fit the current height (header ~26px). The config `count`
  // caps it, but the widget never overflows or leaves blank space.
  const fit = box.h > 0 ? Math.max(1, Math.floor((box.h - 26) / ROW_H)) : 8;
  const want = Math.min(fit, config?.count ?? 30);

  const { data, isError } = useQuery({
    queryKey: ["host-procs"],
    queryFn: () => api.getHostProcs(30),
    refetchInterval: 3_000,
  });

  const rows = useMemo(() => {
    const p = [...(data?.procs ?? [])];
    p.sort((a, b) => (sortBy === "mem" ? b.rss - a.rss : b.cpu - a.cpu));
    return p.slice(0, want);
  }, [data, sortBy, want]);

  if (isError) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Process list unavailable.</div>;
  }

  const showMem = box.w >= 220;

  return (
    <div ref={box.ref} className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0 text-[10px] uppercase tracking-wide text-text-muted">
        <span>Process</span>
        <span className="flex gap-3">
          <span className={sortBy === "cpu" ? "text-text-secondary" : ""}>CPU</span>
          {showMem && <span className={sortBy === "mem" ? "text-text-secondary" : ""}>MEM</span>}
        </span>
      </div>
      <div className="flex-1 min-h-0 px-2 divide-y divide-border-subtle">
        {rows.length === 0 && <div className="text-[11px] text-text-muted px-1 py-2">No data (needs pid: host).</div>}
        {rows.map((p) => (
          <div key={p.pid} className="relative flex items-center gap-2 px-1.5" style={{ height: ROW_H }}>
            <span className="absolute inset-y-[3px] left-0 rounded-sm bg-accent/10 pointer-events-none" style={{ width: `${Math.min(100, p.cpu)}%` }} />
            <span className="relative text-[12px] text-text-secondary truncate flex-1 font-mono" title={`${p.name} · pid ${p.pid}`}>{p.name}</span>
            <span className={`relative font-mono tabular-nums text-[11px] w-11 text-right ${sortBy === "cpu" ? "text-text" : "text-text-muted"}`}>{p.cpu.toFixed(0)}%</span>
            {showMem && <span className={`relative font-mono tabular-nums text-[11px] w-11 text-right ${sortBy === "mem" ? "text-text" : "text-text-muted"}`}>{fmtMem(p.rss)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopProcConfigPanel({ config, save }: WidgetConfigProps<TopProcConfig>) {
  const sortBy = config?.sort ?? "cpu";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Sort by</label>
        <div className="grid grid-cols-2 gap-1">
          {(["cpu", "mem"] as const).map((s) => (
            <button
              key={s}
              onClick={() => save({ sort: s })}
              className={`px-2 py-1.5 text-[11px] rounded border uppercase transition-colors ${
                sortBy === s ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Rows: {config?.count ?? 8}</label>
        <input type="range" min={3} max={12} value={config?.count ?? 8} onChange={(e) => save({ count: parseInt(e.target.value) })} className="w-full accent-accent" />
      </div>
      <p className="text-[11px] text-text-muted">Requires compose <span className="font-mono">pid: host</span> to see host processes.</p>
    </div>
  );
}

const TopProcIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const definition: WidgetDefinition<TopProcConfig> = {
  type: "topproc",
  title: "Top processes",
  icon: TopProcIcon,
  category: "infrastructure",
  description: "The busiest host processes by CPU or memory, live.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 10,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { count: 8, sort: "cpu" },
  Component: TopProcComponent,
  ConfigPanel: TopProcConfigPanel,
};

export default definition;
