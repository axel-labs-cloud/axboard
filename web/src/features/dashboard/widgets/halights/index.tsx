import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, useTileFit, EntityPicker, isLight, friendly, isOn, Toggle } from "../_hass";
import type { HassLightsConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant lights — toggle + brightness for the chosen light (or switch)
// entities via /api/services. Shares the deduped /api/states query.
// ---------------------------------------------------------------------------

function LightsComponent({ config }: WidgetProps<HassLightsConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || "Lights";
  const ids = config?.entities ?? [];
  const ready = !!b && !!token && ids.length > 0;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");
  const { ref, compact } = useTileFit();

  if (!b || !token) return <EmptyState icon={BulbIcon} title="Connect Lights" hint="Set the base URL, a long-lived token and pick light entities." />;
  if (ids.length === 0) return <EmptyState icon={BulbIcon} title="Pick entities" hint="Add light.* (or switch.*) entity ids in this widget's config." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const byId = new Map(data.map((e) => [e.entity_id, e]));
  const anyOn = ids.some((id) => isOn(byId.get(id)?.state));
  const onCount = ids.filter((id) => isOn(byId.get(id)?.state)).length;
  const domainOf = (id: string) => id.split(".")[0];
  const toggleAll = () =>
    ids.forEach((id) => {
      const on = isOn(byId.get(id)?.state);
      const target = ids.length === 1 ? !on : !anyOn;
      opt(id, target ? "on" : "off");
      svc.mutate({ domain: domainOf(id), service: target ? "turn_on" : "turn_off", data: { entity_id: id } });
    });

  // Compact single-row layout only when the tile is genuinely too short.
  if (compact) {
    return (
      <div ref={ref} className="h-full flex items-center gap-2 px-2.5 overflow-hidden">
        <BulbIcon2 on={anyOn} />
        <span className="text-[12px] text-text-secondary truncate flex-1" title={ids.join(", ")}>
          {ids.length === 1 ? friendly(byId.get(ids[0]), ids[0]) : `${onCount}/${ids.length} on`}
        </span>
        <Toggle on={anyOn} onClick={toggleAll} />
      </div>
    );
  }

  return (
    <div ref={ref} className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={BulbIcon}
        title={title}
        right={
          <button
            onClick={() =>
              ids.forEach((id) => {
                opt(id, anyOn ? "off" : "on");
                svc.mutate({ domain: domainOf(id), service: anyOn ? "turn_off" : "turn_on", data: { entity_id: id } });
              })
            }
            className="text-[10px] font-mono text-text-muted hover:text-accent"
            title={anyOn ? "Turn all off" : "Turn all on"}
          >
            all {anyOn ? "off" : "on"}
          </button>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 flex flex-col">
       <div className="my-auto w-full space-y-1">
        {ids.map((id) => {
          const e = byId.get(id);
          const on = isOn(e?.state);
          const dom = domainOf(id);
          const bright = e?.attributes?.brightness;
          const pct = bright != null ? Math.round((bright / 255) * 100) : null;
          const dimmable = dom === "light" && (e?.attributes?.supported_color_modes?.some((m) => m !== "onoff") ?? bright != null);
          return (
            <div key={id} className="py-1">
              <div className="flex items-center gap-2">
                <BulbIcon2 on={on} />
                <span className="text-[12px] text-text-secondary truncate flex-1" title={id}>{friendly(e, id)}</span>
                {on && pct != null && <span className="text-[10px] font-mono text-text-muted shrink-0">{pct}%</span>}
                <Toggle
                  on={on}
                  disabled={!e}
                  onClick={() => {
                    opt(id, on ? "off" : "on");
                    svc.mutate({ domain: dom, service: "toggle", data: { entity_id: id } });
                  }}
                />
              </div>
              {dimmable && (
                <input
                  type="range"
                  min={1}
                  max={100}
                  key={`${on}-${pct}`}
                  defaultValue={pct ?? (on ? 100 : 1)}
                  onMouseUp={(ev) => {
                    const v = Number((ev.target as HTMLInputElement).value);
                    opt(id, "on", { brightness: Math.round((v / 100) * 255) });
                    svc.mutate({ domain: "light", service: "turn_on", data: { entity_id: id, brightness_pct: v } });
                  }}
                  onTouchEnd={(ev) => {
                    const v = Number((ev.target as HTMLInputElement).value);
                    opt(id, "on", { brightness: Math.round((v / 100) * 255) });
                    svc.mutate({ domain: "light", service: "turn_on", data: { entity_id: id, brightness_pct: v } });
                  }}
                  className={`w-full mt-1.5 accent-accent h-1 cursor-pointer ${on ? "" : "opacity-50"}`}
                />
              )}
            </div>
          );
        })}
       </div>
      </div>
    </div>
  );
}

function LightsConfigPanel({ config, save }: WidgetConfigProps<HassLightsConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Lights</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isLight} value={config?.entities ?? []} onChange={(entities) => save({ entities })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Lights" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">URL + token are shared across HA widgets — set them once. The token stays in your config.yaml.</p>
    </div>
  );
}

function BulbIcon2({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 shrink-0 ${on ? "text-degraded" : "text-text-muted"}`}>
      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </svg>
  );
}
const BulbIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
  </svg>
);

const definition: WidgetDefinition<HassLightsConfig> = {
  type: "halights",
  title: "HA Lights",
  icon: BulbIcon,
  category: "homeassistant",
  group: "Lights",
  variant: "Multiple",
  description: "Home Assistant lights — toggle on/off and dim brightness for the entities you pick.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 1,
  defaultConfig: {},
  Component: LightsComponent,
  ConfigPanel: LightsConfigPanel,
};

export default definition;
