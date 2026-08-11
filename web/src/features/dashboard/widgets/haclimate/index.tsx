import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isClimate, friendly } from "../_hass";
import type { HassClimateConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant climate — thermostat for one climate entity: current temp,
// target with +/- (climate.set_temperature) and HVAC mode buttons.
// ---------------------------------------------------------------------------

const MODE_TONE: Record<string, string> = {
  heat: "text-orange-400",
  cool: "text-sky-400",
  heat_cool: "text-emerald-400",
  auto: "text-emerald-400",
  dry: "text-amber-400",
  fan_only: "text-text-secondary",
  off: "text-text-muted",
};

function ClimateComponent({ config, h }: WidgetProps<HassClimateConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const title = config?.title?.trim() || "Thermostat";
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");

  if (!b || !token || !id) return <EmptyState icon={ThermoIcon} title="Connect Thermostat" hint="Set the base URL, a long-lived token and a climate.* entity id." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const mode = e?.state ?? "off";
  const cur = e?.attributes?.current_temperature as number | undefined;
  const target = e?.attributes?.temperature as number | undefined;
  const step = (e?.attributes?.target_temp_step as number | undefined) ?? 0.5;
  const unit = (e?.attributes?.temperature_unit as string | undefined) ?? "°";
  const modes = (e?.attributes?.hvac_modes as string[] | undefined) ?? [];

  const setTarget = (t: number) => {
    if (!id || target == null) return;
    const clamped = Math.max((e?.attributes?.min_temp as number) ?? 5, Math.min((e?.attributes?.max_temp as number) ?? 35, t));
    opt(id, mode, { temperature: clamped });
    svc.mutate({ domain: "climate", service: "set_temperature", data: { entity_id: id, temperature: clamped } });
  };
  const setMode = (m: string) => {
    if (!id) return;
    opt(id, m);
    svc.mutate({ domain: "climate", service: "set_hvac_mode", data: { entity_id: id, hvac_mode: m } });
  };

  const stepBtn = (delta: number, label: string) =>
    target != null && (
      <button onClick={() => setTarget(target + delta)} className="w-6 h-6 rounded-full border border-border text-text hover:border-accent hover:text-accent text-[14px] leading-none shrink-0">
        {label}
      </button>
    );

  // Compact single-row layout for short (1-row) tiles.
  if (h <= 1) {
    return (
      <div className="h-full flex items-center gap-2 px-2.5 overflow-hidden">
        <span className={`shrink-0 ${MODE_TONE[mode] ?? "text-text-muted"}`}>{ThermoIcon}</span>
        <span className="text-[12px] text-text-secondary truncate flex-1" title={id}>{friendly(e, id)}</span>
        {cur != null && <span className="text-[11px] font-mono text-text-muted tabular-nums shrink-0">{cur.toFixed(1)}{unit}</span>}
        {stepBtn(-step, "−")}
        {target != null && <span className="text-[13px] font-semibold tabular-nums w-12 text-center shrink-0">{target.toFixed(1)}{unit}</span>}
        {stepBtn(step, "+")}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={ThermoIcon} title={title} right={<span className={`text-[11px] font-mono capitalize ${MODE_TONE[mode] ?? "text-text-muted"}`}>{mode.replace("_", " ")}</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 space-y-2.5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-text-muted truncate">{friendly(e, id)}</div>
            {cur != null && <div className="text-[12px] text-text-secondary tabular-nums">now {cur.toFixed(1)}{unit}</div>}
          </div>
          {target != null && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setTarget(target - step)} className="w-7 h-7 rounded-full border border-border text-text hover:border-accent hover:text-accent text-[15px] leading-none">−</button>
              <div className="text-[20px] font-semibold tabular-nums w-14 text-center">{target.toFixed(1)}<span className="text-[11px] text-text-muted">{unit}</span></div>
              <button onClick={() => setTarget(target + step)} className="w-7 h-7 rounded-full border border-border text-text hover:border-accent hover:text-accent text-[15px] leading-none">+</button>
            </div>
          )}
        </div>
        {modes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {modes.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-[10.5px] rounded border capitalize transition-colors ${
                  mode === m ? "border-accent/60 bg-accent/15 text-accent" : "border-border text-text-muted hover:text-text"
                }`}
              >
                {m.replace("_", " ")}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClimateConfigPanel({ config, save }: WidgetConfigProps<HassClimateConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Thermostat</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isClimate} multiple={false} value={config?.entity ? [config.entity] : []} onChange={(ids) => save({ entity: ids[0] })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Thermostat" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">URL + token are shared across HA widgets — set them once.</p>
    </div>
  );
}

const ThermoIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0z" />
  </svg>
);

const definition: WidgetDefinition<HassClimateConfig> = {
  type: "haclimate",
  title: "HA Thermostat",
  icon: ThermoIcon,
  category: "services",
  description: "Home Assistant climate — current temperature, target +/- and HVAC mode for a thermostat.",
  minW: 2,
  minH: 1,
  maxW: 5,
  maxH: 4,
  defaultW: 3,
  defaultH: 1,
  defaultConfig: {},
  Component: ClimateComponent,
  ConfigPanel: ClimateConfigPanel,
};

export default definition;
