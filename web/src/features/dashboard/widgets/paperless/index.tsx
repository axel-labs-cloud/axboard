import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { PaperlessConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Paperless-ngx widget — document statistics. GET /api/statistics/ with
// Authorization: Token … → documents_total, documents_inbox, and more.
// ---------------------------------------------------------------------------

interface Stats {
  documents_total?: number;
  documents_inbox?: number;
  character_count?: number;
  document_file_type_counts?: unknown[];
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

function PaperlessComponent({ config }: WidgetProps<PaperlessConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Paperless";
  const token = config?.token?.trim();
  const ready = !!b && !!token;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["paperless", b, token],
    enabled: ready,
    refetchInterval: 120_000,
    queryFn: () => api.fetchJson<Stats>({ url: `${b}/api/statistics/`, headers: { Authorization: `Token ${token}` } }),
  });

  if (!ready) return <EmptyState icon={DocIcon} title="Connect Paperless" hint="Set the base URL (http://host:8000) and an API token." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Paperless."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const inbox = data.documents_inbox ?? 0;
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={DocIcon} title={title} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2">
        <StatTiles
          tiles={[
            { label: "Documents", value: (data.documents_total ?? 0).toLocaleString() },
            { label: "Inbox", value: String(inbox), color: inbox > 0 ? "var(--color-degraded)" : "var(--color-up)" },
          ]}
          cols={2}
        />
      </div>
    </div>
  );
}

function PaperlessConfigPanel({ config, save }: WidgetConfigProps<PaperlessConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8000" />
      <ConfigField label="API token" value={config?.token} onChange={(token) => save({ token })} placeholder="••••••••" hint="Settings → API token" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Paperless" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">The token stays in your config.yaml.</p>
    </div>
  );
}

const DocIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);

const definition: WidgetDefinition<PaperlessConfig> = {
  type: "paperless",
  title: "Paperless-ngx",
  icon: DocIcon,
  category: "services",
  description: "Paperless-ngx — total documents and how many are waiting in the inbox.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 4,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: {},
  Component: PaperlessComponent,
  ConfigPanel: PaperlessConfigPanel,
};

export default definition;
