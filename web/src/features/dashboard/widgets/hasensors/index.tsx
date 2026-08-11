import { WidgetHeader, EmptyState, ErrorState, StatusDot } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useSharedHassCreds, useTileFit, EntityPicker, isSensor, friendly, isOn } from "../_hass";
import type { HassSensorsConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant sensors — read-only value rows for any sensor / binary_sensor
// (temperature, humidity, doors, motion, …). Binary sensors show a state dot.
// ---------------------------------------------------------------------------

function SensorsComponent({ config }: WidgetProps<HassSensorsConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || "Sensors";
  const ids = config?.entities ?? [];
  const ready = !!b && !!token && ids.length > 0;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready, 15_000);
  const { ref, compact } = useTileFit();

  if (!b || !token) return <EmptyState icon={GaugeIcon} title="Connect Sensors" hint="Set the base URL, a long-lived token and pick sensors." />;
  if (ids.length === 0) return <EmptyState icon={GaugeIcon} title="Pick sensors" hint="Add sensor.* / binary_sensor.* entities in this widget's config." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const byId = new Map(data.map((e) => [e.entity_id, e]));

  // Compact single-row layout only when the tile is genuinely too short.
  if (compact) {
    const first = ids[0];
    const e = byId.get(first);
    const unit = e?.attributes?.unit_of_measurement;
    const binary = first.startsWith("binary_sensor.");
    return (
      <div ref={ref} className="h-full flex items-center gap-2 px-2.5 overflow-hidden">
        {binary && <StatusDot status={isOn(e?.state) ? "up" : "unknown"} size="sm" />}
        <span className="text-[12px] text-text-secondary truncate flex-1" title={first}>{friendly(e, first)}</span>
        <span className="text-[12.5px] font-mono tabular-nums text-text shrink-0">
          {e ? `${e.state}${unit ? ` ${unit}` : ""}` : "—"}
          {ids.length > 1 && <span className="text-text-muted/60"> +{ids.length - 1}</span>}
        </span>
      </div>
    );
  }

  return (
    <div ref={ref} className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={GaugeIcon} title={title} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 flex flex-col">
        <div className="divide-y divide-border-subtle my-auto w-full">
          {ids.map((id) => {
            const e = byId.get(id);
            const binary = id.startsWith("binary_sensor.");
            const unit = e?.attributes?.unit_of_measurement;
            return (
              <div key={id} className="flex items-center gap-2 py-1">
                {binary && <StatusDot status={isOn(e?.state) ? "up" : "unknown"} size="sm" />}
                <span className="text-[11.5px] text-text-secondary truncate flex-1" title={id}>{friendly(e, id)}</span>
                <span className="text-[11.5px] font-mono tabular-nums text-text shrink-0">
                  {e ? `${e.state}${unit ? ` ${unit}` : ""}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SensorsConfigPanel({ config, save }: WidgetConfigProps<HassSensorsConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Sensors</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isSensor} value={config?.entities ?? []} onChange={(entities) => save({ entities })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Sensors" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">URL + token are shared across HA widgets — set them once.</p>
    </div>
  );
}

const GaugeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 12l3-3M3.5 12a8.5 8.5 0 0 1 17 0" />
  </svg>
);

const definition: WidgetDefinition<HassSensorsConfig> = {
  type: "hasensors",
  title: "HA Sensors",
  icon: GaugeIcon,
  category: "homeassistant",
  group: "Sensors",
  variant: "Multiple",
  description: "Home Assistant sensors — live values for temperature, humidity, doors, motion and any entity.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 1,
  defaultConfig: {},
  Component: SensorsComponent,
  ConfigPanel: SensorsConfigPanel,
};

export default definition;
