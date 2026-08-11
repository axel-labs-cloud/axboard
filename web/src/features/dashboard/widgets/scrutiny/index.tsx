import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles, StatusDot } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { ScrutinyConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Scrutiny widget — disk SMART health. GET /api/summary (no auth) returns a
// per-device map; device_status 0 = passed, non-zero = failed, no smart data =
// unknown. Also surfaces per-drive temperature.
// ---------------------------------------------------------------------------

interface DeviceEntry {
  device?: { device_name?: string; model_name?: string; device_status?: number };
  smart?: { temp?: number; power_on_hours?: number };
}
interface Summary {
  data?: { summary?: Record<string, DeviceEntry> };
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

function ScrutinyComponent({ config }: WidgetProps<ScrutinyConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Scrutiny";

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scrutiny", b],
    enabled: !!b,
    refetchInterval: 60_000,
    queryFn: () => api.fetchJson<Summary>({ url: `${b}/api/summary` }),
  });

  if (!b) return <EmptyState icon={DiskIcon} title="Connect Scrutiny" hint="Set the base URL (http://host:8080). No auth needed." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Scrutiny."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const devices = Object.entries(data.data?.summary ?? {}).map(([wwn, e]) => ({ wwn, ...e }));
  let passed = 0, failed = 0, unknown = 0;
  for (const d of devices) {
    const st = d.device?.device_status;
    if (st == null || !d.smart) unknown++;
    else if (st === 0) passed++;
    else failed++;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={DiskIcon} title={title} right={<span className="text-[11px] font-mono text-text-muted">{devices.length} drives</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2.5">
        <StatTiles
          tiles={[
            { label: "Passed", value: String(passed), color: "var(--color-up)" },
            { label: "Failed", value: String(failed), color: failed > 0 ? "var(--color-down)" : undefined },
            { label: "Unknown", value: String(unknown), color: unknown > 0 ? "var(--color-degraded)" : undefined },
          ]}
        />
        <div className="divide-y divide-border-subtle">
          {devices.map((d) => {
            const st = d.device?.device_status;
            const tone = st == null || !d.smart ? "unknown" : st === 0 ? "up" : "down";
            return (
              <div key={d.wwn} className="flex items-center gap-2 py-1">
                <StatusDot status={tone} size="sm" />
                <span className="text-[11.5px] text-text-secondary truncate flex-1" title={d.device?.model_name}>
                  {d.device?.device_name || d.device?.model_name || d.wwn}
                </span>
                {d.smart?.temp != null && <span className="text-[10px] font-mono text-text-muted shrink-0">{d.smart.temp}°C</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScrutinyConfigPanel({ config, save }: WidgetConfigProps<ScrutinyConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8080" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Scrutiny" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Reads the public /api/summary — no token required.</p>
    </div>
  );
}

const DiskIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M18.5 12h-4M12 5.5v.01" />
  </svg>
);

const definition: WidgetDefinition<ScrutinyConfig> = {
  type: "scrutiny",
  title: "Scrutiny",
  icon: DiskIcon,
  category: "services",
  description: "Scrutiny disk SMART health — passed / failed / unknown drives, with per-drive temperature.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: ScrutinyComponent,
  ConfigPanel: ScrutinyConfigPanel,
};

export default definition;
