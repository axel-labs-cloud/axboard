import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type {
  MonitorConfig,
  MonitorTarget,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Uptime-monitor widget — pings a list of URLs (via the backend) and shows
// up/down + latency. Distinct from app health checks: any URL, no config app.
// ---------------------------------------------------------------------------

function host(u: string): string {
  try {
    return new URL(u).host || u;
  } catch {
    return u;
  }
}

function MonitorComponent({ config }: WidgetProps<MonitorConfig>) {
  const targets = config?.targets ?? [];
  const { data } = useQuery({
    queryKey: ["monitor", targets.map((t) => t.url).join("|")],
    enabled: targets.length > 0,
    refetchInterval: Math.max(5, config?.refreshSec ?? 30) * 1000,
    queryFn: async () =>
      Promise.all(
        targets.map(async (t) => ({
          t,
          r: await api
            .ping(t.url)
            .catch(() => ({ ok: false }) as { ok: boolean; status?: number; ms?: number; error?: string }),
        })),
      ),
  });

  if (targets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Add URLs to monitor in config.
      </div>
    );
  }

  const rows = data ?? targets.map((t) => ({ t, r: undefined as undefined | { ok: boolean; ms?: number } }));
  const up = rows.filter((x) => x.r?.ok).length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 px-3 pt-2.5 pb-1 shrink-0">
        <span className="text-2xl font-mono tabular-nums text-up leading-none">{up}</span>
        <span className="text-[12px] text-text-muted">/ {targets.length} up</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2 pb-2 divide-y divide-border-subtle">
        {rows.map(({ t, r }) => (
          <div key={t.url} className="flex items-center gap-2 px-1.5 py-1.5">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                r === undefined ? "bg-unknown/60" : r.ok ? "bg-up" : "bg-down"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-text-secondary truncate">{t.name || host(t.url)}</div>
              <div className="text-[10px] text-text-muted truncate font-mono">{host(t.url)}</div>
            </div>
            {r?.ms != null && (
              <span className="text-[11px] font-mono tabular-nums text-text-muted shrink-0">{r.ms} ms</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonitorConfigPanel({ config, save }: WidgetConfigProps<MonitorConfig>) {
  const targets = config?.targets ?? [];
  const set = (next: MonitorTarget[]) => save({ targets: next });
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {targets.map((t, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              value={t.name}
              onChange={(e) => set(targets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              placeholder="name"
              className="w-24 px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
            <input
              value={t.url}
              onChange={(e) => set(targets.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              placeholder="https://…"
              className="flex-1 min-w-0 px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text focus:outline-none focus:border-accent font-mono"
            />
            <button
              onClick={() => set(targets.filter((_, j) => j !== i))}
              className="w-7 shrink-0 flex items-center justify-center rounded text-text-muted hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => set([...targets, { name: "", url: "https://" }])}
        className="text-[11px] text-accent hover:underline"
      >
        + Add target
      </button>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Refresh (sec)
        </label>
        <input
          type="number"
          min={5}
          max={600}
          value={config?.refreshSec ?? 30}
          onChange={(e) => save({ refreshSec: Number(e.target.value) || 30 })}
          className="w-24 px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

const MonitorIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const definition: WidgetDefinition<MonitorConfig> = {
  type: "monitor",
  title: "Uptime monitor",
  icon: MonitorIcon,
  category: "infrastructure",
  description: "Ping a list of URLs and show up/down + latency.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 12,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: { targets: [], refreshSec: 30 },
  Component: MonitorComponent,
  ConfigPanel: MonitorConfigPanel,
};

export default definition;
