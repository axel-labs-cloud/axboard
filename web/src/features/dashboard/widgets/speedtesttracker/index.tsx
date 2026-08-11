import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import { ConfigField } from "../_fields";
import type { SpeedtestTrackerConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Speedtest Tracker widget — latest result (down/up/ping) plus recent history.
// GET /api/speedtest/latest and /api/speedtests (optional bearer token).
// download/upload are bytes/s → shown as Mbps.
// ---------------------------------------------------------------------------

interface Result {
  download?: number;
  upload?: number;
  ping?: number;
  created_at?: string;
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const mbps = (bytesPerSec?: number) => ((bytesPerSec ?? 0) * 8) / 1e6;
const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));

function SpeedtestComponent({ config }: WidgetProps<SpeedtestTrackerConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Speedtest";
  const token = config?.token?.trim();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["speedtest-tracker", b, token],
    enabled: !!b,
    refetchInterval: 300_000,
    queryFn: async () => {
      const latest = await api.fetchJson<{ data?: Result }>({ url: `${b}/api/speedtest/latest`, headers });
      let history: Result[] = [];
      try {
        const list = await api.fetchJson<{ data?: Result[] }>({ url: `${b}/api/speedtests?perPage=8`, headers });
        history = list.data ?? [];
      } catch {
        /* history is optional */
      }
      return { latest: latest.data, history };
    },
  });

  if (!b) return <EmptyState icon={GaugeIcon} title="Connect Speedtest" hint="Set the base URL (http://host:8765). Add a bearer token if the API is protected." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Speedtest Tracker."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const l = data.latest;
  const history = data.history.slice(0, 6);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={GaugeIcon} title={title} right={l?.created_at ? <span className="text-[11px] font-mono text-text-muted">{timeAgo(l.created_at)}</span> : undefined} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 flex flex-col">
        <div className="my-auto w-full space-y-2.5">
          <StatTiles
            tiles={[
              { label: "Down Mbps", value: fmt(mbps(l?.download)), color: "var(--color-up)" },
              { label: "Up Mbps", value: fmt(mbps(l?.upload)), color: "var(--color-accent)" },
              { label: "Ping ms", value: l?.ping != null ? l.ping.toFixed(0) : "—" },
            ]}
          />
          {history.length > 1 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text-muted mb-0.5">History</div>
              <div className="divide-y divide-border-subtle">
                {history.map((h, i) => (
                  <div key={i} className="flex items-baseline gap-2 py-0.5 text-[10.5px] font-mono">
                    <span className="text-up">{fmt(mbps(h.download))}</span>
                    <span className="text-accent">{fmt(mbps(h.upload))}</span>
                    <span className="text-text-muted">{h.ping != null ? `${h.ping.toFixed(0)}ms` : ""}</span>
                    <span className="ml-auto text-text-muted/70">{h.created_at ? timeAgo(h.created_at) : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpeedtestConfigPanel({ config, save }: WidgetConfigProps<SpeedtestTrackerConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8765" />
      <ConfigField label="Bearer token" value={config?.token} onChange={(token) => save({ token })} placeholder="optional" hint="if API auth is on" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Speedtest" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">For the Speedtest Tracker app. The token stays in your config.yaml.</p>
    </div>
  );
}

const GaugeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 12l4-4M4 20a8 8 0 1 1 16 0" /></svg>
);

const definition: WidgetDefinition<SpeedtestTrackerConfig> = {
  type: "speedtesttracker",
  title: "Speedtest Tracker",
  icon: GaugeIcon,
  category: "network",
  description: "Speedtest Tracker — latest download / upload / ping plus recent history.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: SpeedtestComponent,
  ConfigPanel: SpeedtestConfigPanel,
};

export default definition;
