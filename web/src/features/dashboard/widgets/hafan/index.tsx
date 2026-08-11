import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isFan, friendly, isOn, Toggle } from "../_hass";
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

function FanComponent({ config, h }: WidgetProps<HassFanConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const title = config?.title?.trim() || "Fan";
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");
  const setPct = (p: number) => {
    if (!id) return;
    opt(id, "on", { percentage: p });
    svc.mutate({ domain: "fan", service: "set_percentage", data: { entity_id: id, percentage: p } });
  };

  if (!b || !token || !id) return <EmptyState icon={FanIcon} title="Connect Fan" hint="Set the base URL, a long-lived token and a fan.* entity id." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const on = isOn(e?.state);
  const pct = (e?.attributes?.percentage as number | undefined) ?? null;
  const toggle = () => {
    opt(id, on ? "off" : "on");
    svc.mutate({ domain: "fan", service: "toggle", data: { entity_id: id } });
  };

  // Compact single-row layout for short (1-row) tiles.
  if (h <= 1) {
    return (
      <div className="h-full flex items-center gap-2 px-2.5 overflow-hidden">
        <FanSpin on={on} />
        <span className="text-[12px] text-text-secondary truncate flex-1" title={id}>{friendly(e, id)}</span>
        <div className="flex gap-1 shrink-0">
          {PRESETS.map((p) => {
            const active = on && pct != null && Math.abs(pct - p.pct) <= 16;
            return (
              <button
                key={p.label}
                onClick={() => setPct(p.pct)}
                title={p.label}
                className={`w-6 h-6 text-[10px] rounded border transition-colors ${active ? "border-accent/60 bg-accent/15 text-accent" : "border-border text-text-muted hover:text-text"}`}
              >
                {p.label[0]}
              </button>
            );
          })}
        </div>
        <Toggle on={on} disabled={!e} onClick={toggle} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={FanIcon}
        title={title}
        right={<span className="text-[11px] font-mono text-text-muted">{on ? (pct != null ? `${pct}%` : "on") : "off"}</span>}
      />
      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <FanSpin on={on} />
          <span className="text-[12px] text-text-secondary truncate flex-1" title={id}>{friendly(e, id)}</span>
          <Toggle on={on} disabled={!e} onClick={toggle} />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => {
            const active = on && pct != null && Math.abs(pct - p.pct) <= 16;
            return (
              <button
                key={p.label}
                onClick={() => setPct(p.pct)}
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
            onMouseUp={(ev) => setPct(Number((ev.target as HTMLInputElement).value))}
            onTouchEnd={(ev) => setPct(Number((ev.target as HTMLInputElement).value))}
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

// A recognisable fan: four curved blades around a hub. Spins gently only while
// running so it reads as a fan, not an abstract glyph.
const FAN_BLADES = "M12 12c0-3 .5-6 3-6.5S19 8 17 10c-1 1-3 2-5 2zM12 12c3 0 6-.5 6.5 1.5S16 19 14 17c-1-1-2-3-2-5zM12 12c0 3-.5 6-3 6.5S5 16 7 14c1-1 3-2 5-2zM12 12c-3 0-6 .5-6.5-1.5S8 5 10 7c1 1 2 3 2 5z";
function FanSpin({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`w-4 h-4 shrink-0 ${on ? "text-accent animate-spin" : "text-text-muted"}`} style={{ animationDuration: "3s" }}>
      <path d={FAN_BLADES} />
      <circle cx="12" cy="12" r="1.4" fill="var(--color-bg-elevated)" />
    </svg>
  );
}
const FanIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-4 h-4">
    <path d={FAN_BLADES} />
    <circle cx="12" cy="12" r="1.4" fill="var(--color-bg-elevated)" />
  </svg>
);

const definition: WidgetDefinition<HassFanConfig> = {
  type: "hafan",
  title: "HA Fan",
  icon: FanIcon,
  category: "services",
  description: "Home Assistant fan — on/off plus low/medium/high presets and a speed slider.",
  minW: 2,
  minH: 1,
  maxW: 4,
  maxH: 4,
  defaultW: 2,
  defaultH: 1,
  defaultConfig: {},
  Component: FanComponent,
  ConfigPanel: FanConfigPanel,
};

export default definition;
