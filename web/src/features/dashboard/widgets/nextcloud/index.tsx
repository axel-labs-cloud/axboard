import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { NextcloudConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Nextcloud widget — serverinfo stats. GET the serverinfo API (NC-Token header,
// or HTTP basic auth) with OCS-APIRequest:true → free space, users, files,
// shares. Response is the OCS envelope: ocs.data.nextcloud.{system,storage,shares}.
// ---------------------------------------------------------------------------

interface Info {
  ocs?: {
    data?: {
      nextcloud?: {
        system?: { freespace?: number };
        storage?: { num_users?: number; num_files?: number };
        shares?: { num_shares?: number };
      };
      activeUsers?: { last24hours?: number };
    };
  };
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
function bytes(b?: number): string {
  const v = b ?? 0;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(0)}M`;
  if (v < 1024 ** 4) return `${(v / 1024 ** 3).toFixed(1)}G`;
  return `${(v / 1024 ** 4).toFixed(2)}T`;
}

function NextcloudComponent({ config }: WidgetProps<NextcloudConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Nextcloud";
  const token = config?.token?.trim();
  const auth = config?.username ? `Basic ${btoa(`${config.username}:${config.password ?? ""}`)}` : undefined;
  const ready = !!b && (!!token || !!auth);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["nextcloud", b, token, config?.username],
    enabled: ready,
    refetchInterval: 120_000,
    queryFn: () => {
      const headers: Record<string, string> = { "OCS-APIRequest": "true" };
      if (token) headers["NC-Token"] = token;
      if (auth) headers["Authorization"] = auth;
      return api.fetchJson<Info>({ url: `${b}/ocs/v2.php/apps/serverinfo/api/v1/info?format=json`, headers });
    },
  });

  if (!ready) return <EmptyState icon={CloudIcon} title="Connect Nextcloud" hint="Set the base URL and an NC-Token (Settings → System) or admin user/password." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Nextcloud."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const nc = data.ocs?.data?.nextcloud;
  const active = data.ocs?.data?.activeUsers?.last24hours;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={CloudIcon} title={title} right={active != null ? <span className="text-[11px] font-mono text-text-muted">{active} active</span> : undefined} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2.5">
        <StatTiles
          tiles={[
            { label: "Free", value: bytes(nc?.system?.freespace), color: "var(--color-up)" },
            { label: "Users", value: String(nc?.storage?.num_users ?? 0) },
          ]}
          cols={2}
        />
        <StatTiles
          tiles={[
            { label: "Files", value: (nc?.storage?.num_files ?? 0).toLocaleString() },
            { label: "Shares", value: (nc?.shares?.num_shares ?? 0).toLocaleString() },
          ]}
          cols={2}
        />
      </div>
    </div>
  );
}

function NextcloudConfigPanel({ config, save }: WidgetConfigProps<NextcloudConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="https://cloud.example.com" />
      <ConfigField label="NC-Token" value={config?.token} onChange={(token) => save({ token })} placeholder="serverinfo token" hint="Settings → System" />
      <ConfigField label="Username" value={config?.username} onChange={(username) => save({ username })} placeholder="or admin user" mono={false} />
      <ConfigField label="Password" value={config?.password} onChange={(password) => save({ password })} placeholder="admin password" mono={false} />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Nextcloud" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Use either the NC-Token or admin user/password. Credentials stay in your config.yaml.</p>
    </div>
  );
}

const CloudIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19z" />
  </svg>
);

const definition: WidgetDefinition<NextcloudConfig> = {
  type: "nextcloud",
  title: "Nextcloud",
  icon: CloudIcon,
  category: "services",
  description: "Nextcloud — free space, users, files and shares from the serverinfo API.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 6,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: NextcloudComponent,
  ConfigPanel: NextcloudConfigPanel,
};

export default definition;
