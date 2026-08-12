import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatusDot } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { PrometheusConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Prometheus widget — firing / pending alerts via GET /api/v1/alerts.
// ---------------------------------------------------------------------------

interface Alert {
  labels?: { alertname?: string; severity?: string };
  annotations?: { summary?: string; description?: string };
  state?: string; // firing | pending
  activeAt?: string;
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const sevTone = (s?: string) => (s === "critical" ? "text-down" : s === "warning" ? "text-degraded" : "text-text-muted");
const sevDot = (s?: string): "up" | "degraded" | "down" | "unknown" => (s === "critical" ? "down" : s === "warning" ? "degraded" : "unknown");

function PrometheusComponent({ config }: WidgetProps<PrometheusConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Prometheus";
  const auth = config?.username ? `Basic ${btoa(`${config.username}:${config.password ?? ""}`)}` : undefined;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["prometheus", b, config?.username],
    enabled: !!b,
    refetchInterval: 30_000,
    queryFn: async () => {
      const r = await api.fetchJson<{ data?: { alerts?: Alert[] } }>({ url: `${b}/api/v1/alerts`, headers: auth ? { Authorization: auth } : {} });
      return r.data?.alerts ?? [];
    },
  });

  if (!b) return <EmptyState icon={AlertIcon} title="Connect Prometheus" hint="Set the base URL (http://host:9090). Add basic auth if protected." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Prometheus."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const sev = (a: Alert) => a.labels?.severity;
  const rank = (a: Alert) => (sev(a) === "critical" ? 0 : sev(a) === "warning" ? 1 : 2) + (a.state === "firing" ? 0 : 0.5);
  const alerts = [...data].sort((x, z) => rank(x) - rank(z));
  const firing = alerts.filter((a) => a.state === "firing").length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={AlertIcon}
        title={title}
        right={<span className={`text-[11px] font-mono ${firing > 0 ? "text-down" : "text-up"}`}>{firing > 0 ? `${firing} firing` : "all clear"}</span>}
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5">
        <div className="divide-y divide-border-subtle w-full">
          {alerts.length === 0 && <div className="text-[11px] text-text-muted py-2 text-center">No active alerts.</div>}
          {alerts.map((a, i) => (
            <div key={i} className="py-1">
              <div className="flex items-center gap-2">
                <StatusDot status={sevDot(sev(a))} size="sm" />
                <span className="text-[11.5px] text-text-secondary truncate flex-1" title={a.annotations?.description}>{a.labels?.alertname ?? "alert"}</span>
                <span className={`text-[9.5px] font-mono uppercase shrink-0 ${a.state === "pending" ? "text-text-muted/60" : sevTone(sev(a))}`}>{a.state}</span>
              </div>
              {a.annotations?.summary && <div className="text-[10px] text-text-muted truncate pl-4">{a.annotations.summary}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PrometheusConfigPanel({ config, save }: WidgetConfigProps<PrometheusConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:9090" />
      <ConfigField label="Username" value={config?.username} onChange={(username) => save({ username })} placeholder="optional" mono={false} hint="basic auth" />
      <ConfigField label="Password" value={config?.password} onChange={(password) => save({ password })} placeholder="optional" mono={false} />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Prometheus" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Reads /api/v1/alerts. Works with Alertmanager-backed Prometheus.</p>
    </div>
  );
}

const AlertIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
);

const definition: WidgetDefinition<PrometheusConfig> = {
  type: "prometheus",
  title: "Prometheus",
  icon: AlertIcon,
  category: "services",
  description: "Prometheus — firing and pending alerts, ranked by severity.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: PrometheusComponent,
  ConfigPanel: PrometheusConfigPanel,
};

export default definition;
