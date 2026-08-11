import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isFan, friendly, isOn } from "../_hass";
import type { HassCoverConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant fans — several fans in one tile, each a compact Off/1/2/3
// stepped slider. For a single fan with a bigger control, use HA Fan.
// ---------------------------------------------------------------------------

const LEVELS = [0, 33, 66, 100];
function levelOf(on: boolean, pct: number | null): number {
  if (!on) return 0;
  if (pct == null) return 3;
  if (pct <= 16) return 0;
  if (pct <= 49) return 1;
  if (pct <= 83) return 2;
  return 3;
}

function FansComponent({ config }: WidgetProps<HassCoverConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || "Fans";
  const ids = config?.entities ?? [];
  const ready = !!b && !!token && ids.length > 0;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");

  if (!b || !token) return <EmptyState icon={FanIcon} title="Connect Fans" hint="Set the base URL, a long-lived token and pick fan entities." />;
  if (ids.length === 0) return <EmptyState icon={FanIcon} title="Pick fans" hint="Add fan.* entities in this widget's config." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const byId = new Map(data.map((e) => [e.entity_id, e]));
  const setLevel = (id: string, lvl: number) => {
    if (lvl === 0) {
      opt(id, "off");
      svc.mutate({ domain: "fan", service: "turn_off", data: { entity_id: id } });
    } else {
      const p = LEVELS[lvl];
      opt(id, "on", { percentage: p });
      svc.mutate({ domain: "fan", service: "set_percentage", data: { entity_id: id, percentage: p } });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={FanIcon} title={title} right={<span className="text-[11px] font-mono text-text-muted">{ids.filter((id) => isOn(byId.get(id)?.state)).length}/{ids.length} on</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 flex flex-col">
        <div className="my-auto w-full space-y-2">
          {ids.map((id) => {
            const e = byId.get(id);
            const level = levelOf(isOn(e?.state), (e?.attributes?.percentage as number | undefined) ?? null);
            return (
              <div key={id} className="flex items-center gap-2.5">
                <FanSpin on={level > 0} />
                <span className="text-[11.5px] text-text-secondary truncate w-1/3 min-w-0" title={id}>{friendly(e, id)}</span>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={level}
                  onChange={(ev) => setLevel(id, Number((ev.target as HTMLInputElement).value))}
                  className="flex-1 accent-accent h-1 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-text-muted w-7 text-right shrink-0">{level === 0 ? "off" : level}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FansConfigPanel({ config, save }: WidgetConfigProps<HassCoverConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Fans</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isFan} value={config?.entities ?? []} onChange={(entities) => save({ entities })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Fans" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Several fans in one list. For a single fan, use HA Fan.</p>
    </div>
  );
}

const FAN_BLADES = "M12 12c0-3 .5-6 3-6.5S19 8 17 10c-1 1-3 2-5 2zM12 12c3 0 6-.5 6.5 1.5S16 19 14 17c-1-1-2-3-2-5zM12 12c0 3-.5 6-3 6.5S5 16 7 14c1-1 3-2 5-2zM12 12c-3 0-6 .5-6.5-1.5S8 5 10 7c1 1 2 3 2 5z";
function FanSpin({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`w-3.5 h-3.5 shrink-0 ${on ? "text-accent animate-spin" : "text-text-muted"}`} style={{ animationDuration: "3s" }}>
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

const definition: WidgetDefinition<HassCoverConfig> = {
  type: "hafans",
  title: "HA Fans",
  icon: FanIcon,
  category: "homeassistant",
  description: "Home Assistant — several fans, each a compact Off / 1 / 2 / 3 speed slider.",
  minW: 3,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: FansComponent,
  ConfigPanel: FansConfigPanel,
};

export default definition;
