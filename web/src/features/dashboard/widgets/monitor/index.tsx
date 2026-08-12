import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import { WidgetHeader, StatusDot } from "../../../../components/widget";
import type {
  MonitorConfig,
  MonitorTarget,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Uptime-monitor widget — pings a list of URLs (via the backend) and shows an
// Uptime-Kuma-style heartbeat per target: a strip of latency-height bars
// coloured by status, a live uptime %, and the current latency. History
// accumulates client-side while the page is open. Distinct from app health.
// ---------------------------------------------------------------------------

const BARS = 30; // heartbeat slots per target

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

// A heartbeat bar's height (%) and colour from a single ping. Up bars grow with
// latency (a slow-but-up beat reads taller), down bars fill red, pending are low.
function bar(h: Ping | undefined): { height: number; bg: string; op: number; title: string } {
  if (!h) return { height: 22, bg: "var(--color-border)", op: 0.35, title: "pending" };
  if (h.ok) return { height: Math.max(32, Math.min(100, 34 + ((h.ms ?? 0) / 500) * 66)), bg: "var(--color-up)", op: 1, title: `${h.ms ?? "?"} ms` };
  return { height: 100, bg: "var(--color-down)", op: 1, title: `down${h.status ? ` · ${h.status}` : ""}` };
}

function MonitorComponent({ config, editing }: WidgetProps<MonitorConfig>) {
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

  // Rolling per-target history for the heartbeat, capped at BARS.
  const [history, setHistory] = useState<Record<string, Ping[]>>({});
  useEffect(() => {
    if (!data) return;
    setHistory((prev) => {
      const next: Record<string, Ping[]> = { ...prev };
      for (const { t, r } of data) next[t.url] = (prev[t.url] ?? []).concat(r).slice(-BARS);
      return next;
    });
  }, [data]);

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

  // Size-driven layout. Very short → a summary pill; otherwise heartbeat cards.
  const compact = box.h > 0 && box.h < 72;
  const showWord = box.w >= 150;

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
          {rows.map(({ t, r }) => {
            const title = `${t.name || host(t.url)}${r?.ms != null ? ` · ${r.ms}ms` : ""}`;
            const cls = `w-2 h-2 rounded-full ${dotClass(r)}`;
            return editing ? (
              <span key={t.url} title={title} className={cls} />
            ) : (
              <a key={t.url} href={t.url} target="_blank" rel="noreferrer" title={title} className={`${cls} hover:ring-2 hover:ring-accent/40`} />
            );
          })}
        </div>
      </div>
    );
  }

  // Down / unknown first so problems surface at the top.
  const rank = (r: Ping | undefined) => (r === undefined ? 1 : r.ok ? 2 : 0);
  const sorted = [...rows].sort((a, b) => rank(a.r) - rank(b.r));

  return (
    <div ref={box.ref} className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={MonitorIcon}
        title={Count}
        right={down > 0 ? <span className="text-[11px] font-mono text-down">{down} down</span> : undefined}
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2">
        {sorted.map(({ t, r }) => {
          const hist = history[t.url] ?? [];
          const uptime = hist.length ? Math.round((hist.filter((h) => h.ok).length / hist.length) * 100) : null;
          const upColor = uptime == null ? "var(--color-text-muted)" : uptime >= 99 ? "var(--color-up)" : uptime >= 90 ? "var(--color-degraded)" : "var(--color-down)";
          const pad = BARS - hist.length;
          const inner = (
            <div className="rounded-lg border border-border-subtle bg-bg-card/30 px-2.5 py-2">
              <div className="flex items-center gap-2 mb-1.5">
                <StatusDot status={r === undefined ? undefined : r.ok ? "up" : "down"} size="sm" />
                <span className="text-[12px] text-text-secondary truncate flex-1 min-w-0">{t.name || host(t.url)}</span>
                {r?.ok && r.ms != null && <span className="text-[10.5px] font-mono tabular-nums text-text-muted shrink-0">{r.ms} ms</span>}
                {r && !r.ok && <span className="text-[10.5px] font-mono text-down shrink-0">down</span>}
                {uptime != null && <span className="text-[10.5px] font-mono tabular-nums shrink-0" style={{ color: upColor }}>{uptime}%</span>}
              </div>
              <div className="flex items-end gap-[2px] h-6">
                {Array.from({ length: BARS }).map((_, i) => {
                  const b = bar(i >= pad ? hist[i - pad] : undefined);
                  return <div key={i} className="flex-1 rounded-sm min-w-[2px]" style={{ height: `${b.height}%`, background: b.bg, opacity: b.op }} title={b.title} />;
                })}
              </div>
            </div>
          );
          return editing ? (
            <div key={t.url}>{inner}</div>
          ) : (
            <a key={t.url} href={t.url} target="_blank" rel="noreferrer" className="block hover:opacity-90 transition-opacity">{inner}</a>
          );
        })}
      </div>
    </div>
  );
}

function MonitorConfigPanel({ config, save }: WidgetConfigProps<MonitorConfig>) {
  const targets = config?.targets ?? [];
  const set = (next: MonitorTarget[]) => save({ targets: next });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= targets.length) return;
    const next = [...targets];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {targets.map((t, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <div className="flex flex-col shrink-0">
              <button onClick={() => move(i, -1)} disabled={i === 0} className={`w-4 h-3.5 flex items-center justify-center rounded ${i === 0 ? "text-text-muted/30" : "text-text-muted hover:text-text"}`} title="Move up">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><path d="M18 15l-6-6-6 6" /></svg>
              </button>
              <button onClick={() => move(i, 1)} disabled={i === targets.length - 1} className={`w-4 h-3.5 flex items-center justify-center rounded ${i === targets.length - 1 ? "text-text-muted/30" : "text-text-muted hover:text-text"}`} title="Move down">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </div>
            <input
              value={t.name}
              onChange={(e) => set(targets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              placeholder="name"
              className="w-20 px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
            <input
              value={t.url}
              onChange={(e) => set(targets.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              placeholder="https://…"
              className="flex-1 min-w-0 px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text focus:outline-none focus:border-accent font-mono"
            />
            <button
              onClick={() => set(targets.filter((_, j) => j !== i))}
              aria-label="Remove target"
              className="w-6 shrink-0 flex items-center justify-center rounded text-text-muted hover:text-danger"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
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
  category: "network",
  description: "Ping URLs and show an Uptime-Kuma-style heartbeat with live uptime and latency.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 12,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: { targets: [], refreshSec: 30 },
  Component: MonitorComponent,
  ConfigPanel: MonitorConfigPanel,
};

export default definition;
