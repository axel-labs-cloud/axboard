import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { TraefikConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Traefik widget — router / service / middleware counts. GET /api/overview
// (optional basic auth) → http.{routers,services,middlewares}.{total,errors}.
// ---------------------------------------------------------------------------

interface Section {
  total?: number;
  warnings?: number;
  errors?: number;
}
interface Overview {
  http?: { routers?: Section; services?: Section; middlewares?: Section };
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

function TraefikComponent({ config }: WidgetProps<TraefikConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Traefik";
  const auth = config?.username ? `Basic ${btoa(`${config.username}:${config.password ?? ""}`)}` : undefined;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["traefik", b, config?.username],
    enabled: !!b,
    refetchInterval: 30_000,
    queryFn: () => api.fetchJson<Overview>({ url: `${b}/api/overview`, headers: auth ? { Authorization: auth } : {} }),
  });

  if (!b) return <EmptyState icon={RouteIcon} title="Connect Traefik" hint="Set the API base URL (http://host:8080). Add basic auth if the dashboard is protected." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Traefik."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const http = data.http ?? {};
  const errs = (http.routers?.errors ?? 0) + (http.services?.errors ?? 0) + (http.middlewares?.errors ?? 0);
  const sub = (s?: Section) => (s?.errors ? `${s.errors} err` : s?.warnings ? `${s.warnings} warn` : undefined);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={RouteIcon}
        title={title}
        right={<span className={`text-[11px] font-mono ${errs > 0 ? "text-down" : "text-up"}`}>{errs > 0 ? `${errs} errors` : "ok"}</span>}
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2">
        <StatTiles
          tiles={[
            { label: "Routers", value: String(http.routers?.total ?? 0), sub: sub(http.routers) },
            { label: "Services", value: String(http.services?.total ?? 0), sub: sub(http.services) },
            { label: "Middleware", value: String(http.middlewares?.total ?? 0), sub: sub(http.middlewares) },
          ]}
        />
      </div>
    </div>
  );
}

function TraefikConfigPanel({ config, save }: WidgetConfigProps<TraefikConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="API URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8080" />
      <ConfigField label="Username" value={config?.username} onChange={(username) => save({ username })} placeholder="optional" mono={false} hint="basic auth" />
      <ConfigField label="Password" value={config?.password} onChange={(password) => save({ password })} placeholder="optional" mono={false} />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Traefik" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Needs the Traefik API/dashboard enabled. Credentials stay in your config.yaml.</p>
    </div>
  );
}

const RouteIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M6 16.5V9a4 4 0 0 1 4-4h5.5" />
  </svg>
);

const definition: WidgetDefinition<TraefikConfig> = {
  type: "traefik",
  title: "Traefik",
  icon: RouteIcon,
  category: "services",
  description: "Traefik — router, service and middleware counts with error/warning flags.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: TraefikComponent,
  ConfigPanel: TraefikConfigPanel,
};

export default definition;
