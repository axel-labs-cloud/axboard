import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { ImmichConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Immich widget — library statistics. GET /api/server/statistics (x-api-key
// with the server.statistics permission) → { photos, videos, usage,
// usageByUser[] }. Falls back to the older /api/server-info/statistics path.
// ---------------------------------------------------------------------------

interface Stats {
  photos?: number;
  videos?: number;
  usage?: number; // bytes
  usageByUser?: unknown[];
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
function bytes(b?: number): string {
  const v = b ?? 0;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)}K`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(0)}M`;
  if (v < 1024 ** 4) return `${(v / 1024 ** 3).toFixed(1)}G`;
  return `${(v / 1024 ** 4).toFixed(2)}T`;
}

function ImmichComponent({ config }: WidgetProps<ImmichConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Immich";
  const key = config?.apiKey?.trim();
  const ready = !!b && !!key;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["immich", b, key],
    enabled: ready,
    refetchInterval: 120_000,
    queryFn: async () => {
      const h = { "x-api-key": key! };
      try {
        return await api.fetchJson<Stats>({ url: `${b}/api/server/statistics`, headers: h });
      } catch {
        return await api.fetchJson<Stats>({ url: `${b}/api/server-info/statistics`, headers: h });
      }
    },
  });

  if (!ready) return <EmptyState icon={CamIcon} title="Connect Immich" hint="Set the base URL (http://host:2283) and an API key with server statistics." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Immich."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const users = Array.isArray(data.usageByUser) ? data.usageByUser.length : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={CamIcon} title={title} right={users ? <span className="text-[11px] font-mono text-text-muted">{users} users</span> : undefined} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2">
        <StatTiles
          tiles={[
            { label: "Photos", value: (data.photos ?? 0).toLocaleString() },
            { label: "Videos", value: (data.videos ?? 0).toLocaleString() },
            { label: "Storage", value: bytes(data.usage) },
          ]}
        />
      </div>
    </div>
  );
}

function ImmichConfigPanel({ config, save }: WidgetConfigProps<ImmichConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:2283" />
      <ConfigField label="API key" value={config?.apiKey} onChange={(apiKey) => save({ apiKey })} placeholder="••••••••" hint="Account → API Keys" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Immich" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">The key needs the server.statistics permission. It stays in your config.yaml.</p>
    </div>
  );
}

const CamIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="6" width="18" height="14" rx="2" />
    <circle cx="12" cy="13" r="3.5" />
    <path d="M8 6l1.5-2h5L16 6" />
  </svg>
);

const definition: WidgetDefinition<ImmichConfig> = {
  type: "immich",
  title: "Immich",
  icon: CamIcon,
  category: "services",
  description: "Immich — photo and video counts plus storage used across the library.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: ImmichComponent,
  ConfigPanel: ImmichConfigPanel,
};

export default definition;
