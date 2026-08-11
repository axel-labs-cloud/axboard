import { WidgetHeader, EmptyState, ErrorState, StatusDot } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useSharedHassCreds, EntityPicker, isSensor, friendly, isOn } from "../_hass";
import type { HassOneConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant — a single sensor as a big value tile. Name in the header,
// the reading (large) in the body. Binary sensors show an on/off state.
// ---------------------------------------------------------------------------

function SensorComponent({ config }: WidgetProps<HassOneConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready, 15_000);

  if (!b || !token || !id) return <EmptyState icon={GaugeIcon} title="Connect Sensor" hint="Set the base URL, a long-lived token and a sensor entity." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const unit = e?.attributes?.unit_of_measurement;
  const binary = id.startsWith("binary_sensor.");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={GaugeIcon} title={config?.title?.trim() || friendly(e, id)} />
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex items-center justify-center">
        {binary ? (
          <span className="flex items-center gap-2">
            <StatusDot status={isOn(e?.state) ? "up" : "unknown"} size="md" />
            <span className="text-[18px] font-semibold capitalize">{e?.state ?? "—"}</span>
          </span>
        ) : (
          <span className="text-[26px] font-semibold tabular-nums truncate">
            {e ? Number(e.state).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
            {unit && <span className="text-[13px] text-text-muted ml-1">{unit}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function SensorConfigPanel({ config, save }: WidgetConfigProps<HassOneConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Sensor</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isSensor} multiple={false} value={config?.entity ? [config.entity] : []} onChange={(ids) => save({ entity: ids[0] })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(entity name)" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Single sensor as a big value. For several, use HA Sensors.</p>
    </div>
  );
}

const GaugeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 12l3-3M3.5 12a8.5 8.5 0 0 1 17 0" />
  </svg>
);

const definition: WidgetDefinition<HassOneConfig> = {
  type: "hasensor",
  title: "HA Sensor",
  icon: GaugeIcon,
  category: "homeassistant",
  group: "Sensors",
  variant: "Single",
  description: "Home Assistant — one sensor shown as a big value tile (temperature, humidity, a door, …).",
  minW: 2,
  minH: 1,
  maxW: 4,
  maxH: 3,
  defaultW: 2,
  defaultH: 1,
  defaultConfig: {},
  Component: SensorComponent,
  ConfigPanel: SensorConfigPanel,
};

export default definition;
