import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type {
  MonitorConfig,
  MonitorTarget,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Uptime-monitor widget — pings a list of URLs (via the backend) and shows
// up/down + latency. Size-responsive: a compact status pill when short, a full
// adaptive list when there's room. Distinct from app health checks.
// ---------------------------------------------------------------------------

function host(u: string): string {
  try {
    return new URL(u).host || u;
  } catch {
    return u;
  }
}

type Ping = { ok: boolean; status?: number; ms?: number; error?: string };

function dotClass(r: Ping | undefined): string {
  return r === undefined ? "bg-unknown/60" : r.ok ? "bg-up" : "bg-down";
}

function MonitorComponent({ config }: WidgetProps<MonitorConfig>) {
  const targets = config?.targets ?? [];
  const box = useSize<HTMLDivElement>();
  const { data } = useQuery({
    queryKey: ["monitor", targets.map((t) => t.url).join("|")],
    enabled: targets.length > 0,
    refetchInterval: Math.max(5, config?.refreshSec ?? 30) * 1000,
    queryFn: async () =>
      Promise.all(
        targets.map(async (t) => ({
          t,
          r: await api.ping(t.url).catch(() => ({ ok: false }) as Ping),
        })),
      ),
  });

  if (targets.length === 0) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Add URLs to monitor in config.
      </div>
    );
  }

  const rows = data ?? targets.map((t) => ({ t, r: undefined as Ping | undefined }));
  const up = rows.filter((x) => x.r?.ok).length;
  const down = rows.filter((x) => x.r && !x.r.ok).length;

  // Size-driven layout. Short → a summary pill; otherwise an adaptive list.
  const compact = box.h > 0 && box.h < 104;
  const showWord = box.w >= 150; // "up" / "endpoints up" text
  const showHost = box.w >= 232; // secondary host line under a named row
  const showLatency = box.w >= 168;

  const Count = (
    <span className="flex items-baseline gap-1.5">
      <span className="text-2xl font-mono tabular-nums text-up leading-none">{up}</span>
      <span className="text-[12px] text-text-muted">
        / {targets.length}
        {showWord ? (compact ? " up" : " endpoints up") : ""}
      </span>
    </span>
  );

  if (compact) {
    return (
      <div ref={box.ref} className="h-full flex flex-col justify-center gap-2.5 px-3">
        <div className="flex items-center">
          {Count}
          {down > 0 && <span className="ml-auto text-[11px] font-mono text-down">{down} down</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rows.map(({ t, r }) => (
            <span key={t.url} title={`${t.name || host(t.url)}${r?.ms != null ? ` · ${r.ms}ms` : ""}`} className={`w-2 h-2 rounded-full ${dotClass(r)}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={box.ref} className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 shrink-0">
        <span className="text-text-muted shrink-0">{MonitorIcon}</span>
        {Count}
        {down > 0 && <span className="ml-auto text-[11px] font-mono text-down shrink-0">{down} down</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2 pb-2 divide-y divide-border-subtle">
        {rows.map(({ t, r }) => (
          <div key={t.url} className="flex items-center gap-2 px-1.5 py-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(r)}`} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-text-secondary truncate">{t.name || host(t.url)}</div>
              {showHost && t.name && (
                <div className="text-[10px] text-text-muted truncate font-mono">{host(t.url)}</div>
              )}
            </div>
            {showLatency && r?.ms != null && (
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
