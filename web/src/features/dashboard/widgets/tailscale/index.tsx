import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles, StatusDot } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import { ConfigField } from "../_fields";
import type { TailscaleConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Tailscale widget — tailnet device status via the Tailscale cloud API
// (api.tailscale.com, Bearer API key). There is no explicit online flag, so a
// device counts as online when lastSeen is within ~5 minutes.
// ---------------------------------------------------------------------------

interface Device {
  name?: string;
  hostname?: string;
  os?: string;
  lastSeen?: string;
  updateAvailable?: boolean;
}

const ONLINE_MS = 5 * 60_000;
const seenMs = (d: Device) => (d.lastSeen ? Date.now() - new Date(d.lastSeen).getTime() : Infinity);
const isOnline = (d: Device) => seenMs(d) < ONLINE_MS;

function TailscaleComponent({ config }: WidgetProps<TailscaleConfig>) {
  const title = config?.title?.trim() || "Tailscale";
  const tailnet = config?.tailnet?.trim() || "-";
  const key = config?.apiKey?.trim();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tailscale", tailnet, key],
    enabled: !!key,
    refetchInterval: 60_000,
    queryFn: () =>
      api.fetchJson<{ devices: Device[] }>({
        url: `https://api.tailscale.com/api/v2/tailnet/${encodeURIComponent(tailnet)}/devices`,
        headers: { Authorization: `Bearer ${key}` },
      }),
  });

  if (!key) return <EmptyState icon={TsIcon} title="Connect Tailscale" hint="Add an API access token (tskey-api-…). Tailnet defaults to your token's tailnet." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Tailscale."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const devices = [...(data.devices ?? [])].sort((a, z) => seenMs(a) - seenMs(z));
  const online = devices.filter(isOnline).length;
  const updates = devices.filter((d) => d.updateAvailable).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={TsIcon} title={title} right={<span className="text-[11px] font-mono text-text-muted">{online}/{devices.length} up</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2.5">
        <StatTiles
          tiles={[
            { label: "Devices", value: String(devices.length) },
            { label: "Online", value: String(online), color: "var(--color-up)" },
            { label: "Updates", value: String(updates), color: updates > 0 ? "var(--color-degraded)" : undefined },
          ]}
        />
        <div className="divide-y divide-border-subtle">
          {devices.map((d) => {
            const on = isOnline(d);
            return (
              <div key={d.name || d.hostname} className="flex items-center gap-2 py-1">
                <StatusDot status={on ? "up" : "unknown"} size="sm" />
                <span className="text-[11.5px] text-text-secondary truncate flex-1" title={d.name}>{d.hostname || d.name}</span>
                {d.updateAvailable && <span className="text-[8.5px] font-mono uppercase px-1 py-px rounded bg-degraded/15 text-degraded shrink-0">update</span>}
                <span className="text-[10px] font-mono text-text-muted shrink-0">{on ? d.os : timeAgo(d.lastSeen)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TailscaleConfigPanel({ config, save }: WidgetConfigProps<TailscaleConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Tailnet" value={config?.tailnet} onChange={(tailnet) => save({ tailnet })} placeholder="- (default) or example.com" />
      <ConfigField label="API key" value={config?.apiKey} onChange={(apiKey) => save({ apiKey })} placeholder="tskey-api-…" hint="admin → Keys" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Tailscale" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Calls the Tailscale cloud API (api.tailscale.com). The key stays in your config.yaml.</p>
    </div>
  );
}

const TsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" />
    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
  </svg>
);

const definition: WidgetDefinition<TailscaleConfig> = {
  type: "tailscale",
  title: "Tailscale",
  icon: TsIcon,
  category: "services",
  description: "Tailscale tailnet — device count, how many are online, and pending client updates.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: TailscaleComponent,
  ConfigPanel: TailscaleConfigPanel,
};

export default definition;
