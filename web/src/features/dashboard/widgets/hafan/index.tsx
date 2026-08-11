import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useSharedHassCreds, EntityPicker, isFan, friendly, isOn, Toggle } from "../_hass";
import type { HassFanConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant fan — on/off + speed for one fan entity. Speed presets map to
// fan.set_percentage; the toggle uses fan.toggle.
// ---------------------------------------------------------------------------

const PRESETS = [
  { label: "Low", pct: 33 },
  { label: "Med", pct: 66 },
  { label: "High", pct: 100 },
];

function FanComponent({ config }: WidgetProps<HassFanConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const title = config?.title?.trim() || "Fan";
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");

  if (!b || !token || !id) return <EmptyState icon={FanIcon} title="Connect Fan" hint="Set the base URL, a long-lived token and a fan.* entity id." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const on = isOn(e?.state);
  const pct = (e?.attributes?.percentage as number | undefined) ?? null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={FanIcon}
        title={title}
        right={<span className="text-[11px] font-mono text-text-muted">{on ? (pct != null ? `${pct}%` : "on") : "off"}</span>}
      />
      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 flex flex-col gap-3 justify-center">
        <div className="flex items-center gap-2">
          <FanSpin on={on} />
          <span className="text-[12px] text-text-secondary truncate flex-1" title={id}>{friendly(e, id)}</span>
          <Toggle on={on} disabled={!e} onClick={() => svc.mutate({ domain: "fan", service: "toggle", data: { entity_id: id } })} />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => {
            const active = on && pct != null && Math.abs(pct - p.pct) <= 16;
            return (
              <button
                key={p.label}
                onClick={() => svc.mutate({ domain: "fan", service: "set_percentage", data: { entity_id: id, percentage: p.pct } })}
                className={`px-2 py-2 text-[11px] rounded border transition-colors ${
                  active ? "border-accent/60 bg-accent/15 text-accent" : "border-border text-text-muted hover:text-text"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {on && (
          <input
            type="range"
            min={1}
            max={100}
            defaultValue={pct ?? 100}
            key={pct ?? "x"}
            onMouseUp={(ev) => svc.mutate({ domain: "fan", service: "set_percentage", data: { entity_id: id, percentage: Number((ev.target as HTMLInputElement).value) } })}
            onTouchEnd={(ev) => svc.mutate({ domain: "fan", service: "set_percentage", data: { entity_id: id, percentage: Number((ev.target as HTMLInputElement).value) } })}
            className="w-full accent-accent h-1 cursor-pointer"
          />
        )}
      </div>
    </div>
  );
}

function FanConfigPanel({ config, save }: WidgetConfigProps<HassFanConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Fan</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isFan} multiple={false} value={config?.entity ? [config.entity] : []} onChange={(ids) => save({ entity: ids[0] })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Fan" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">URL + token are shared across HA widgets — set them once. Presets/slider call fan.set_percentage.</p>
    </div>
  );
}

function FanSpin({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 shrink-0 ${on ? "text-accent animate-spin" : "text-text-muted"}`} style={{ animationDuration: "2.5s" }}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2a4 4 0 0 1 0 8 4 4 0 0 0-4 4M22 12a4 4 0 0 1-8 0 4 4 0 0 0-4-4M12 22a4 4 0 0 1 0-8 4 4 0 0 0 4-4" />
    </svg>
  );
}
const FanIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2a4 4 0 0 1 0 8 4 4 0 0 0-4 4M22 12a4 4 0 0 1-8 0 4 4 0 0 0-4-4M12 22a4 4 0 0 1 0-8 4 4 0 0 0 4-4" />
  </svg>
);

const definition: WidgetDefinition<HassFanConfig> = {
  type: "hafan",
  title: "HA Fan",
  icon: FanIcon,
  category: "services",
  description: "Home Assistant fan — on/off plus low/medium/high presets and a speed slider.",
  minW: 2,
  minH: 2,
  maxW: 4,
  maxH: 4,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: {},
  Component: FanComponent,
  ConfigPanel: FanConfigPanel,
};

export default definition;
