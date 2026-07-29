import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type {
  ContainersConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Container-status widget — lists Docker/Podman containers over the mounted
// socket. Size-responsive: a compact dot-summary when short, an adaptive list
// otherwise. Liveness only, per the design.
// ---------------------------------------------------------------------------

function stateDot(state: string): string {
  switch (state) {
    case "running":
      return "bg-up";
    case "paused":
    case "created":
      return "bg-degraded";
    default:
      return "bg-down"; // exited, dead…
  }
}

function fmtMem(b?: number): string {
  if (!b) return "";
  const gb = b / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)}G` : `${Math.round(b / 1e6)}M`;
}

// CPU% + memory chip shown per running container when stats are on.
function StatCol({ cpu, mem }: { cpu?: number; mem?: number }) {
  return (
    <div className="shrink-0 text-right font-mono leading-tight">
      <div className="text-[11px] text-text-secondary tabular-nums">{cpu != null ? `${cpu.toFixed(0)}%` : "—"}</div>
      <div className="text-[9.5px] text-text-muted tabular-nums">{fmtMem(mem) || "—"}</div>
    </div>
  );
}

function ContainersComponent({ config }: WidgetProps<ContainersConfig>) {
  const filter = config?.filter?.trim().toLowerCase() ?? "";
  const runningOnly = config?.runningOnly ?? false;
  const stats = config?.stats ?? false;
  const box = useSize<HTMLDivElement>();

  const { data, isError, error } = useQuery({
    queryKey: ["containers", stats],
    queryFn: () => api.getContainers(stats),
    refetchInterval: 15_000,
  });

  const list = useMemo(() => {
    let cs = data?.containers ?? [];
    if (runningOnly) cs = cs.filter((c) => c.state === "running");
    if (filter) cs = cs.filter((c) => c.name.toLowerCase().includes(filter));
    return [...cs].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, runningOnly, filter]);

  if (isError || data?.error) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        {data?.error ?? (error as Error)?.message ?? "Cannot reach the container socket."}
      </div>
    );
  }

  const running = (data?.containers ?? []).filter((c) => c.state === "running").length;
  const total = (data?.containers ?? []).length;
  const compact = box.h > 0 && box.h < 104;
  const showWord = box.w >= 150;
  const showSub = box.w >= 200; // status / image subline
  const cols = box.w >= 560 ? 3 : box.w >= 360 ? 2 : 1; // grid when wide, list when narrow

  const Count = (
    <span className="flex items-baseline gap-1.5">
      <span className="text-2xl font-mono tabular-nums text-up leading-none">{running}</span>
      <span className="text-[12px] text-text-muted">
        / {total}
        {showWord ? (compact ? " up" : " containers up") : ""}
      </span>
    </span>
  );

  if (compact) {
    return (
      <div ref={box.ref} className="h-full flex flex-col justify-center gap-2.5 px-3">
        {Count}
        <div className="flex flex-wrap gap-1.5">
          {list.map((c) => (
            <span key={c.name} title={`${c.name} · ${c.state}`} className={`w-2 h-2 rounded-full ${stateDot(c.state)}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={box.ref} className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 shrink-0">
        <span className="text-text-muted shrink-0">{ContainersIcon}</span>
        {Count}
      </div>
      {cols > 1 ? (
        <div
          className="flex-1 min-h-0 overflow-auto p-2"
          style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "6px", alignContent: "start" }}
        >
          {list.length === 0 && <div className="text-[11px] text-text-muted px-1 py-2">No containers.</div>}
          {list.map((c) => (
            <div key={c.name} className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-bg-card/40 border border-border-subtle/50 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${stateDot(c.state)}`} title={c.state} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-text-secondary truncate">{c.name}</div>
                <div className="text-[10px] text-text-muted truncate font-mono">{c.status || c.image}</div>
              </div>
              {stats && c.state === "running" && <StatCol cpu={c.cpu} mem={c.mem} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto px-2 pb-2 divide-y divide-border-subtle">
          {list.length === 0 && (
            <div className="text-[11px] text-text-muted px-1 py-2">No containers.</div>
          )}
          {list.map((c) => (
            <div key={c.name} className="flex items-center gap-2 px-1.5 py-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${stateDot(c.state)}`} title={c.state} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-text-secondary truncate">{c.name}</div>
                {showSub && <div className="text-[10px] text-text-muted truncate font-mono">{c.status || c.image}</div>}
              </div>
              {stats && c.state === "running" && <StatCol cpu={c.cpu} mem={c.mem} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContainersConfigPanel({ config, save }: WidgetConfigProps<ContainersConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Name filter
        </label>
        <input
          value={config?.filter ?? ""}
          onChange={(e) => save({ filter: e.target.value })}
          placeholder="substring, e.g. media"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.runningOnly ?? false}
          onChange={(e) => save({ runningOnly: e.target.checked })}
          className="accent-accent"
        />
        Running only
      </label>
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.stats ?? false}
          onChange={(e) => save({ stats: e.target.checked })}
          className="accent-accent"
        />
        Show CPU / memory
      </label>
      <p className="text-[11px] text-text-muted leading-snug">
        Reads the mounted Docker/Podman socket (same as auto-discovery). CPU/memory adds a short
        stats sample per running container.
      </p>
    </div>
  );
}

const ContainersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M22 12.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3.5" />
    <rect x="3" y="8" width="4" height="4.5" />
    <rect x="8" y="8" width="4" height="4.5" />
    <rect x="13" y="8" width="4" height="4.5" />
    <rect x="8" y="3" width="4" height="4.5" />
  </svg>
);

const definition: WidgetDefinition<ContainersConfig> = {
  type: "containers",
  title: "Containers",
  icon: ContainersIcon,
  category: "infrastructure",
  description: "Live Docker/Podman container states over the mounted socket.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 12,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: {},
  Component: ContainersComponent,
  ConfigPanel: ContainersConfigPanel,
};

export default definition;
