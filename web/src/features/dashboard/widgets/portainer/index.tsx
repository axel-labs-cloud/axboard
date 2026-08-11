import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { PortainerConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Portainer widget — container counts from an endpoint's snapshot. GET
// /api/endpoints (X-API-Key) returns each environment with a DockerSnapshot;
// we pick the configured endpoint id (or the first) and read its counts.
// ---------------------------------------------------------------------------

interface Snapshot {
  RunningContainerCount?: number;
  StoppedContainerCount?: number;
  HealthyContainerCount?: number;
  ImageCount?: number;
  VolumeCount?: number;
  StackCount?: number;
}
interface Endpoint {
  Id: number;
  Name?: string;
  Snapshots?: { DockerSnapshot?: Snapshot }[];
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

function PortainerComponent({ config }: WidgetProps<PortainerConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Portainer";
  const key = config?.apiKey?.trim();
  const ready = !!b && !!key;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["portainer", b, key, config?.env],
    enabled: ready,
    refetchInterval: 30_000,
    queryFn: () => api.fetchJson<Endpoint[]>({ url: `${b}/api/endpoints`, headers: { "X-API-Key": key! } }),
  });

  if (!ready) return <EmptyState icon={PortIcon} title="Connect Portainer" hint="Set the base URL (https://host:9443) and an access token (X-API-Key)." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Portainer."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const ep = (config?.env != null ? data.find((e) => e.Id === config.env) : data[0]) ?? data[0];
  const snap = ep?.Snapshots?.[0]?.DockerSnapshot ?? {};
  const running = snap.RunningContainerCount ?? 0;
  const stopped = snap.StoppedContainerCount ?? 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={PortIcon} title={title} right={<span className="text-[11px] font-mono text-text-muted truncate max-w-[45%]">{ep?.Name}</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2.5">
        <StatTiles
          tiles={[
            { label: "Running", value: String(running), color: "var(--color-up)" },
            { label: "Stopped", value: String(stopped), color: stopped > 0 ? "var(--color-down)" : undefined },
            { label: "Total", value: String(running + stopped) },
          ]}
        />
        <StatTiles
          tiles={[
            { label: "Images", value: String(snap.ImageCount ?? 0) },
            { label: "Volumes", value: String(snap.VolumeCount ?? 0) },
            { label: "Stacks", value: String(snap.StackCount ?? 0) },
          ]}
        />
      </div>
    </div>
  );
}

function PortainerConfigPanel({ config, save }: WidgetConfigProps<PortainerConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="https://172.24.2.100:9443" />
      <ConfigField label="Access token" value={config?.apiKey} onChange={(apiKey) => save({ apiKey })} placeholder="ptr_…" hint="Account → API tokens" />
      <ConfigField label="Environment id" value={config?.env != null ? String(config.env) : ""} onChange={(v) => save({ env: v ? Number(v) : undefined })} placeholder="1 (blank = first)" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Portainer" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Reads the endpoint's container snapshot. The token stays in your config.yaml.</p>
    </div>
  );
}

const PortIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
  </svg>
);

const definition: WidgetDefinition<PortainerConfig> = {
  type: "portainer",
  title: "Portainer",
  icon: PortIcon,
  category: "services",
  description: "Portainer — running / stopped / total containers, images, volumes and stacks for an environment.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 6,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: PortainerComponent,
  ConfigPanel: PortainerConfigPanel,
};

export default definition;
