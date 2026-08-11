import { WidgetHeader, EmptyState, ErrorState, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useSharedHassCreds, friendly } from "../_hass";
import type { HassConnConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant battery levels — every battery sensor across your devices,
// lowest first, with a coloured meter. No entity picker: it finds them.
// ---------------------------------------------------------------------------

const battColor = (p: number) => (p < 15 ? "var(--color-down)" : p < 30 ? "var(--color-degraded)" : "var(--color-up)");

function BatteryComponent({ config }: WidgetProps<HassConnConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || "Batteries";
  const ready = !!b && !!token;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready, 60_000);

  if (!ready) return <EmptyState icon={BattIcon} title="Connect Batteries" hint="Set the base URL and a long-lived token — it finds battery sensors." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const batteries = data
    .filter((e) => e.entity_id.startsWith("sensor.") && e.attributes?.device_class === "battery" && Number.isFinite(Number(e.state)))
    .map((e) => ({ e, pct: Math.max(0, Math.min(100, Number(e.state))) }))
    .sort((a, z) => a.pct - z.pct);
  const low = batteries.filter((x) => x.pct < 20).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={BattIcon} title={title} right={<span className={`text-[11px] font-mono ${low > 0 ? "text-down" : "text-text-muted"}`}>{low > 0 ? `${low} low` : `${batteries.length}`}</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 flex flex-col">
        <div className="space-y-1.5 my-auto w-full">
          {batteries.length === 0 && <div className="text-[11px] text-text-muted py-1">No battery sensors found.</div>}
          {batteries.map(({ e, pct }) => (
            <div key={e.entity_id} className="flex items-center gap-2">
              <span className="text-[11px] text-text-secondary truncate flex-1" title={e.entity_id}>
                {friendly(e, e.entity_id).replace(/\s*battery$/i, "")}
              </span>
              <div className="w-24 shrink-0"><Meter pct={pct} color={battColor(pct)} /></div>
              <span className="text-[10px] font-mono text-text-muted w-8 text-right shrink-0">{pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BatteryConfigPanel({ config, save }: WidgetConfigProps<HassConnConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Batteries" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Lists every sensor with device_class battery, lowest first.</p>
    </div>
  );
}

const BattIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="7" width="18" height="10" rx="2" /><path d="M22 11v2" /></svg>
);

const definition: WidgetDefinition<HassConnConfig> = {
  type: "habattery",
  title: "HA Batteries",
  icon: BattIcon,
  category: "homeassistant",
  description: "Home Assistant battery levels — every device battery, lowest first, with low-battery flags.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: BatteryComponent,
  ConfigPanel: BatteryConfigPanel,
};

export default definition;
