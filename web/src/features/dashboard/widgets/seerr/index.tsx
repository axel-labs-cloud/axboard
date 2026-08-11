import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { SeerrConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Overseerr / Jellyseerr widget — media request counts. GET
// /api/v1/request/count (X-Api-Key) → totals by status.
// ---------------------------------------------------------------------------

interface Counts {
  total?: number;
  movie?: number;
  tv?: number;
  pending?: number;
  approved?: number;
  declined?: number;
  processing?: number;
  available?: number;
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

function SeerrComponent({ config }: WidgetProps<SeerrConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Overseerr";
  const key = config?.apiKey?.trim();
  const ready = !!b && !!key;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seerr", b, key],
    enabled: ready,
    refetchInterval: 60_000,
    queryFn: () => api.fetchJson<Counts>({ url: `${b}/api/v1/request/count`, headers: { "X-Api-Key": key! } }),
  });

  if (!ready) return <EmptyState icon={SeerrIcon} title="Connect Seerr" hint="Set the base URL (http://host:5055) and the API key (Settings → General)." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Seerr."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={SeerrIcon} title={title} right={<span className="text-[11px] font-mono text-text-muted">{data.total ?? 0} total</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2.5">
        <StatTiles
          tiles={[
            { label: "Pending", value: String(data.pending ?? 0), color: (data.pending ?? 0) > 0 ? "var(--color-degraded)" : undefined },
            { label: "Approved", value: String(data.approved ?? 0), color: "var(--color-up)" },
            { label: "Available", value: String(data.available ?? 0) },
          ]}
        />
        <StatTiles tiles={[{ label: "Movies", value: String(data.movie ?? 0) }, { label: "TV", value: String(data.tv ?? 0) }, { label: "Processing", value: String(data.processing ?? 0) }]} />
      </div>
    </div>
  );
}

function SeerrConfigPanel({ config, save }: WidgetConfigProps<SeerrConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:5055" />
      <ConfigField label="API key" value={config?.apiKey} onChange={(apiKey) => save({ apiKey })} placeholder="••••••••" hint="Settings → General" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Overseerr" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Works with Overseerr and Jellyseerr. The key stays in your config.yaml.</p>
    </div>
  );
}

const SeerrIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
  </svg>
);

const definition: WidgetDefinition<SeerrConfig> = {
  type: "seerr",
  title: "Overseerr / Jellyseerr",
  icon: SeerrIcon,
  category: "services",
  description: "Overseerr / Jellyseerr — pending, approved and available media requests.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 6,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: SeerrComponent,
  ConfigPanel: SeerrConfigPanel,
};

export default definition;
