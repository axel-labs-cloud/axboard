import { WidgetHeader, EmptyState, ErrorState, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { scaleColor } from "../colorScale";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useSharedHassCreds, EntityPicker, isPowerSensor, friendly } from "../_hass";
import type { HassPowerConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant power — live readouts for the chosen sensor entities. Power
// sensors (W/kW) get a draw bar scaled to `max`; energy sensors (kWh/Wh) show
// their value. Total current draw sits in the header.
// ---------------------------------------------------------------------------

const OPTS = { lo: 0, hi: 100, warn: 60, crit: 85 };

function watts(state: string, unit?: string): number | null {
  const v = Number(state);
  if (!Number.isFinite(v)) return null;
  if (unit === "kW") return v * 1000;
  if (unit === "W") return v;
  return null; // not a power sensor
}
function fmtW(w: number): string {
  return w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${w.toFixed(0)} W`;
}

function PowerComponent({ config }: WidgetProps<HassPowerConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || "Power";
  const ids = config?.entities ?? [];
  const max = config?.max && config.max > 0 ? config.max : 3000;
  const ready = !!b && !!token && ids.length > 0;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready, 5_000);

  if (!b || !token) return <EmptyState icon={BoltIcon} title="Connect Power" hint="Set the base URL, a long-lived token and pick power/energy sensors." />;
  if (ids.length === 0) return <EmptyState icon={BoltIcon} title="Pick sensors" hint="Add sensor.* power/energy entity ids in this widget's config." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const byId = new Map(data.map((e) => [e.entity_id, e]));
  const rows = ids.map((id) => {
    const e = byId.get(id);
    const unit = e?.attributes?.unit_of_measurement;
    const w = e ? watts(e.state, unit) : null;
    return { id, e, unit, w };
  });
  const totalW = rows.reduce((n, r) => n + (r.w ?? 0), 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={BoltIcon} title={title} right={totalW > 0 ? <span className="text-[11px] font-mono text-degraded">{fmtW(totalW)}</span> : undefined} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2">
        {rows.map((r) => (
          <div key={r.id}>
            <div className="flex items-baseline gap-2">
              <span className="text-[11.5px] text-text-secondary truncate flex-1" title={r.id}>{friendly(r.e, r.id)}</span>
              <span className="text-[11px] font-mono tabular-nums text-text shrink-0">
                {r.e ? `${Number(r.e.state).toLocaleString(undefined, { maximumFractionDigits: 2 })}${r.unit ? ` ${r.unit}` : ""}` : "—"}
              </span>
            </div>
            {r.w != null && (
              <div className="mt-1">
                <Meter pct={Math.min(100, (100 * r.w) / max)} color={scaleColor((100 * r.w) / max, undefined, OPTS)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PowerConfigPanel({ config, save }: WidgetConfigProps<HassPowerConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Power / energy sensors</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isPowerSensor} value={config?.entities ?? []} onChange={(entities) => save({ entities })} />
      </div>
      <ConfigField label="Bar max (W)" value={config?.max != null ? String(config.max) : ""} onChange={(v) => save({ max: v ? Number(v) : undefined })} placeholder="3000" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Power" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">URL + token are shared across HA widgets — set them once. Refreshes every 5s.</p>
    </div>
  );
}

const BoltIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
  </svg>
);

const definition: WidgetDefinition<HassPowerConfig> = {
  type: "hapower",
  title: "HA Power",
  icon: BoltIcon,
  category: "services",
  description: "Home Assistant power — live draw for the sensors you pick, with total consumption.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: PowerComponent,
  ConfigPanel: PowerConfigPanel,
};

export default definition;
