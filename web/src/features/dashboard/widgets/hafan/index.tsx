import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, useTileFit, EntityPicker, isFan, friendly, isOn } from "../_hass";
import type { HassFanConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant fan — a 4-level speed control (Off / Low / Med / High) shown
// as tappable bars, so it fits any tile height without a slider or scrollbar.
// Level 0 = fan.turn_off; 1-3 = fan.set_percentage(33/66/100).
// ---------------------------------------------------------------------------

const LEVELS = [0, 33, 66, 100]; // off, low, med, high
const LABELS = ["Off", "Low", "Med", "High"];

function levelOf(on: boolean, pct: number | null): number {
  if (!on) return 0;
  if (pct == null) return 3;
  if (pct <= 16) return 0;
  if (pct <= 49) return 1;
  if (pct <= 83) return 2;
  return 3;
}

function SpeedBars({ level, onSet, tall }: { level: number; onSet: (l: number) => void; tall?: boolean }) {
  const heights = tall ? [10, 18, 26, 34] : [8, 13, 18, 23];
  return (
    <div className="flex items-end gap-1.5 shrink-0">
      {heights.map((hpx, i) => {
        const active = i === level;
        return (
          <button key={i} onClick={() => onSet(i)} title={LABELS[i]} className="flex items-end group/bar py-0.5" aria-label={LABELS[i]}>
            <span
              style={{ height: hpx }}
              className={`w-3.5 rounded-sm transition-colors ${active ? "bg-accent" : "bg-border group-hover/bar:bg-text-muted"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

function FanComponent({ config }: WidgetProps<HassFanConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const title = config?.title?.trim() || "Fan";
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");
  const { ref, compact } = useTileFit(72);

  if (!b || !token || !id) return <EmptyState icon={FanIcon} title="Connect Fan" hint="Set the base URL, a long-lived token and a fan.* entity id." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const on = isOn(e?.state);
  const pct = (e?.attributes?.percentage as number | undefined) ?? null;
  const level = levelOf(on, pct);
  const setLevel = (lvl: number) => {
    if (!id) return;
    if (lvl === 0) {
      opt(id, "off");
      svc.mutate({ domain: "fan", service: "turn_off", data: { entity_id: id } });
    } else {
      const p = LEVELS[lvl];
      opt(id, "on", { percentage: p });
      svc.mutate({ domain: "fan", service: "set_percentage", data: { entity_id: id, percentage: p } });
    }
  };

  if (compact) {
    return (
      <div ref={ref} className="h-full flex items-center gap-2 px-2.5 overflow-hidden">
        <FanSpin on={on} />
        <span className="text-[12px] text-text-secondary truncate flex-1" title={id}>{friendly(e, id)}</span>
        <SpeedBars level={level} onSet={setLevel} />
      </div>
    );
  }

  return (
    <div ref={ref} className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={FanIcon}
        title={title}
        right={<span className="text-[11px] font-mono text-text-muted">{LABELS[level].toLowerCase()}</span>}
      />
      <div className="flex-1 min-h-0 overflow-hidden px-3 flex flex-col justify-center gap-3">
        <div className="flex items-center gap-2">
          <FanSpin on={on} />
          <span className="text-[12px] text-text-secondary truncate flex-1" title={id}>{friendly(e, id)}</span>
        </div>
        <div className="flex items-end justify-between">
          {[0, 1, 2, 3].map((lvl) => {
            const active = lvl === level;
            return (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className="flex flex-col items-center gap-1 group/lvl"
                aria-label={LABELS[lvl]}
              >
                <span
                  style={{ height: [12, 20, 28, 36][lvl] }}
                  className={`w-6 rounded-sm transition-colors ${active ? "bg-accent" : "bg-border group-hover/lvl:bg-text-muted"}`}
                />
                <span className={`text-[9.5px] ${active ? "text-accent" : "text-text-muted"}`}>{LABELS[lvl]}</span>
              </button>
            );
          })}
        </div>
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
      <p className="text-[11px] text-text-muted leading-snug">URL + token are shared across HA widgets — set them once. Off / Low / Med / High map to fan.set_percentage.</p>
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
  description: "Home Assistant fan — a 4-level speed control (Off / Low / Med / High) that fits any tile height.",
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
