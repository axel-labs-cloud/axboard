import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { scaleColor } from "../colorScale";
import { ConfigField } from "../_fields";
import type { PbsConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Proxmox Backup Server widget — datastore usage. GET
// /api2/json/status/datastore-usage with a PBSAPIToken (note the colon before
// the secret) → per-store total/used/avail.
// ---------------------------------------------------------------------------

interface Store {
  store: string;
  total?: number;
  used?: number;
  avail?: number;
}

const OPTS = { lo: 0, hi: 100, warn: 75, crit: 90 };
const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const pct = (used?: number, total?: number) => (total && total > 0 ? Math.min(100, (100 * (used ?? 0)) / total) : 0);
function tb(b?: number): string {
  const v = b ?? 0;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(0)}M`;
  if (v < 1024 ** 4) return `${(v / 1024 ** 3).toFixed(1)}G`;
  return `${(v / 1024 ** 4).toFixed(2)}T`;
}

function PbsComponent({ config }: WidgetProps<PbsConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Backup Server";
  const ready = !!b && !!config?.tokenId && !!config?.tokenSecret;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pbs", b, config?.tokenId],
    enabled: ready,
    refetchInterval: 60_000,
    queryFn: () =>
      api.fetchJson<{ data: Store[] }>({
        url: `${b}/api2/json/status/datastore-usage`,
        headers: { Authorization: `PBSAPIToken=${config!.tokenId}:${config!.tokenSecret}` },
      }),
  });

  if (!ready) return <EmptyState icon={PbsIcon} title="Connect PBS" hint="Set the base URL (https://host:8007), a token id (user@realm!name) and its secret." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach PBS."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const stores = (data.data ?? []).slice().sort((a, z) => pct(z.used, z.total) - pct(a.used, a.total));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={PbsIcon} title={title} right={<span className="text-[11px] font-mono text-text-muted">{stores.length} stores</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2">
        {stores.length === 0 && <div className="text-[11px] text-text-muted px-1 py-2">No datastores.</div>}
        {stores.map((s) => {
          const v = pct(s.used, s.total);
          return (
            <div key={s.store}>
              <div className="flex items-baseline justify-between text-[10px] mb-1">
                <span className="text-text-secondary truncate">{s.store}</span>
                <span className="font-mono tabular-nums text-text-muted shrink-0">{tb(s.used)}/{tb(s.total)}</span>
              </div>
              <Meter pct={v} color={scaleColor(v, undefined, OPTS)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PbsConfigPanel({ config, save }: WidgetConfigProps<PbsConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="https://172.24.2.100:8007" />
      <ConfigField label="Token id" value={config?.tokenId} onChange={(tokenId) => save({ tokenId })} placeholder="root@pam!axboard" />
      <ConfigField label="Token secret" value={config?.tokenSecret} onChange={(tokenSecret) => save({ tokenSecret })} placeholder="token secret" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Backup Server" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Needs a token with Datastore.Audit. Secrets stay in your config.yaml.</p>
    </div>
  );
}

const PbsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </svg>
);

const definition: WidgetDefinition<PbsConfig> = {
  type: "pbs",
  title: "Proxmox Backup Server",
  icon: PbsIcon,
  category: "services",
  description: "Proxmox Backup Server — datastore usage bars (used / total) per store.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: PbsComponent,
  ConfigPanel: PbsConfigPanel,
};

export default definition;
