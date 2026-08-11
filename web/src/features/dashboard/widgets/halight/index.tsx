import { WidgetHeader, EmptyState, ErrorState, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isLight, friendly, isOn, Toggle, OpenInHass } from "../_hass";
import type { HassOneConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant — a single light (or switch). Name is the widget header;
// body is the toggle and, for dimmable lights, a brightness slider.
// ---------------------------------------------------------------------------

function LightComponent({ config }: WidgetProps<HassOneConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");

  if (!b || !token || !id) return <EmptyState icon={BulbIcon} title="Connect Light" hint="Set the base URL, a long-lived token and a light.* entity." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const on = isOn(e?.state);
  const dom = id.split(".")[0];
  const bright = e?.attributes?.brightness as number | undefined;
  const pct = bright != null ? Math.round((bright / 255) * 100) : null;
  const modes = (e?.attributes?.supported_color_modes as string[] | undefined) ?? [];
  const dimmable = dom === "light" && (modes.some((m) => m !== "onoff") ?? bright != null);
  const ctCapable = modes.includes("color_temp");
  const rgbCapable = modes.some((m) => ["rgb", "rgbw", "rgbww", "hs", "xy"].includes(m));
  const minK = (e?.attributes?.min_color_temp_kelvin as number | undefined) ?? 2000;
  const maxK = (e?.attributes?.max_color_temp_kelvin as number | undefined) ?? 6500;
  const curK = (e?.attributes?.color_temp_kelvin as number | undefined) ?? Math.round((minK + maxK) / 2);
  const setK = (k: number) => { opt(id, "on", { color_temp_kelvin: k }); svc.mutate({ domain: "light", service: "turn_on", data: { entity_id: id, color_temp_kelvin: k } }); };
  const setRgb = (rgb: [number, number, number]) => { opt(id, "on", { rgb_color: rgb }); svc.mutate({ domain: "light", service: "turn_on", data: { entity_id: id, rgb_color: rgb } }); };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={<BulbGlyph on={on} />}
        title={config?.title?.trim() || friendly(e, id)}
        right={
          <span className="flex items-center gap-2">
            <OpenInHass base={b} id={id} />
            <Toggle
              on={on}
              disabled={!e}
              onClick={() => {
                opt(id, on ? "off" : "on");
                svc.mutate({ domain: dom, service: "toggle", data: { entity_id: id } });
              }}
            />
          </span>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 flex flex-col justify-center gap-2.5">
        {dimmable ? (
          <div>
            <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
              <span>Brightness</span>
              <span className="font-mono text-text-secondary">{on ? (pct != null ? `${pct}%` : "on") : "off"}</span>
            </div>
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
              className="w-full accent-accent h-1.5 cursor-pointer"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Meter pct={on ? 100 : 0} color={on ? "var(--color-degraded)" : "var(--color-border)"} />
            <span className={`text-[11px] font-mono shrink-0 ${on ? "text-degraded" : "text-text-muted"}`}>{on ? "on" : "off"}</span>
          </div>
        )}
        {ctCapable && (
          <div>
            <div className="text-[10px] text-text-muted mb-1">Warmth</div>
            <input
              type="range"
              min={minK}
              max={maxK}
              step={100}
              key={curK}
              defaultValue={curK}
              onMouseUp={(ev) => setK(Number((ev.target as HTMLInputElement).value))}
              onTouchEnd={(ev) => setK(Number((ev.target as HTMLInputElement).value))}
              data-nofill
              className="w-full cursor-pointer rounded-full appearance-none"
              style={{ background: "linear-gradient(90deg,#ffb04d,#fff,#bcd8ff)" }}
            />
          </div>
        )}
        {rgbCapable && (
          <div className="flex items-center gap-1.5">
            {([[255,80,80],[255,170,60],[255,235,120],[110,220,120],[90,170,255],[190,120,255],[255,255,255]] as [number,number,number][]).map((c, i) => (
              <button
                key={i}
                onClick={() => setRgb(c)}
                title={`rgb(${c.join(",")})`}
                className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                style={{ background: `rgb(${c[0]},${c[1]},${c[2]})` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LightConfigPanel({ config, save }: WidgetConfigProps<HassOneConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Light</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isLight} multiple={false} value={config?.entity ? [config.entity] : []} onChange={(ids) => save({ entity: ids[0] })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(entity name)" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Single light. For several lights on one tile, use HA Lights.</p>
    </div>
  );
}

function BulbGlyph({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ${on ? "text-degraded" : "text-text-muted"}`}>
      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </svg>
  );
}
const BulbIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
  </svg>
);

const definition: WidgetDefinition<HassOneConfig> = {
  type: "halight",
  title: "HA Light",
  icon: BulbIcon,
  category: "homeassistant",
  group: "Lights",
  variant: "Single",
  description: "Home Assistant — one light: toggle in the header, brightness slider in the body.",
  minW: 2,
  minH: 1,
  maxW: 4,
  maxH: 4,
  defaultW: 2,
  defaultH: 1,
  defaultConfig: {},
  Component: LightComponent,
  ConfigPanel: LightConfigPanel,
};

export default definition;
