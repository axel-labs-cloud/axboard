import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type {
  ContainersConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Container-status widget — lists Docker/Podman containers over the mounted
// socket (same one auto-discovery uses). Liveness only, per the design.
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

function ContainersComponent({ config }: WidgetProps<ContainersConfig>) {
  const filter = config?.filter?.trim().toLowerCase() ?? "";
  const runningOnly = config?.runningOnly ?? false;

  const { data, isError, error } = useQuery({
    queryKey: ["containers"],
    queryFn: api.getContainers,
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
      <div className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        {data?.error ?? (error as Error)?.message ?? "Cannot reach the container socket."}
      </div>
    );
  }

  const running = (data?.containers ?? []).filter((c) => c.state === "running").length;
  const total = (data?.containers ?? []).length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 shrink-0">
        <span className="text-text-muted shrink-0">{ContainersIcon}</span>
        <span className="text-2xl font-mono tabular-nums text-up leading-none">{running}</span>
        <span className="text-[12px] text-text-muted">/ {total} containers up</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2 pb-2 divide-y divide-border-subtle">
        {list.length === 0 && (
          <div className="text-[11px] text-text-muted px-1 py-2">No containers.</div>
        )}
        {list.map((c) => (
          <div key={c.name} className="flex items-center gap-2 px-1.5 py-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${stateDot(c.state)}`} title={c.state} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-text-secondary truncate">{c.name}</div>
              <div className="text-[10px] text-text-muted truncate font-mono">{c.status || c.image}</div>
            </div>
          </div>
        ))}
      </div>
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
      <p className="text-[11px] text-text-muted leading-snug">
        Reads the mounted Docker/Podman socket (same as auto-discovery).
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
