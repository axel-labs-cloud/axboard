import { WidgetHeader, EmptyState, ErrorState, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isVacuum, friendly, OpenInHass } from "../_hass";
import type { HassOneConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant vacuum — start / pause / dock plus state and battery.
// ---------------------------------------------------------------------------

// Battery is inverted (low = bad), so pick the tone directly.
export const battColor = (p: number) => (p < 15 ? "var(--color-down)" : p < 30 ? "var(--color-degraded)" : "var(--color-up)");

function VacuumComponent({ config }: WidgetProps<HassOneConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready, 10_000);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");

  if (!b || !token || !id) return <EmptyState icon={VacIcon} title="Connect Vacuum" hint="Set the base URL, a long-lived token and a vacuum.* entity." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const st = e?.state ?? "unknown";
  const batt = (e?.attributes?.battery_level as number | undefined) ?? null;
  const call = (service: string, next: string) => { opt(id, next); svc.mutate({ domain: "vacuum", service, data: { entity_id: id } }); };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={VacIcon}
        title={config?.title?.trim() || friendly(e, id)}
        right={<span className="flex items-center gap-1.5"><span className="text-[11px] font-mono text-text-muted capitalize">{st}</span><OpenInHass base={b} id={id} /></span>}
      />
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex flex-col justify-center gap-2.5">
        {batt != null && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-10 shrink-0">Battery</span>
            <Meter pct={batt} color={battColor(batt)} />
            <span className="text-[10px] font-mono text-text-muted w-8 text-right shrink-0">{batt}%</span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          <Btn label="Clean" onClick={() => call("start", "cleaning")} active={st === "cleaning"} />
          <Btn label="Pause" onClick={() => call("pause", "paused")} active={st === "paused"} />
          <Btn label="Dock" onClick={() => call("return_to_base", "returning")} active={st === "docked" || st === "returning"} />
        </div>
      </div>
    </div>
  );
}

function Btn({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`px-2 py-2 text-[11px] rounded border transition-colors ${active ? "border-accent/60 bg-accent/15 text-accent" : "border-border text-text-muted hover:text-text"}`}>
      {label}
    </button>
  );
}

function VacuumConfigPanel({ config, save }: WidgetConfigProps<HassOneConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Vacuum</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isVacuum} multiple={false} value={config?.entity ? [config.entity] : []} onChange={(ids) => save({ entity: ids[0] })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(entity name)" mono={false} />
    </div>
  );
}

const VacIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3" /></svg>
);

const definition: WidgetDefinition<HassOneConfig> = {
  type: "havacuum",
  title: "HA Vacuum",
  icon: VacIcon,
  category: "homeassistant",
  description: "Home Assistant vacuum — start / pause / dock, with state and battery.",
  minW: 2,
  minH: 2,
  maxW: 4,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: VacuumComponent,
  ConfigPanel: VacuumConfigPanel,
};

export default definition;
