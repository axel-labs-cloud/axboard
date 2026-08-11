import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isLock, friendly, OpenInHass } from "../_hass";
import type { HassOneConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant lock — a big lock/unlock control for one lock entity.
// ---------------------------------------------------------------------------

function LockComponent({ config }: WidgetProps<HassOneConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");

  if (!b || !token || !id) return <EmptyState icon={LockIcon} title="Connect Lock" hint="Set the base URL, a long-lived token and a lock.* entity." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const st = e?.state ?? "unknown";
  const locked = st === "locked";
  const busy = st === "locking" || st === "unlocking";
  const toggle = () => {
    opt(id, locked ? "unlocking" : "locking");
    svc.mutate({ domain: "lock", service: locked ? "unlock" : "lock", data: { entity_id: id } });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={LockIcon} title={config?.title?.trim() || friendly(e, id)} right={<OpenInHass base={b} id={id} />} />
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex items-center justify-center">
        <button
          onClick={toggle}
          disabled={busy}
          className={`flex items-center gap-2.5 px-4 py-2 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-60 ${
            locked ? "border-up/50 bg-up/10 text-up" : "border-degraded/50 bg-degraded/10 text-degraded"
          }`}
        >
          {locked ? <ClosedLock /> : <OpenLock />}
          {busy ? "…" : locked ? "Locked" : "Unlocked"}
        </button>
      </div>
    </div>
  );
}

function LockConfigPanel({ config, save }: WidgetConfigProps<HassOneConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Lock</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isLock} multiple={false} value={config?.entity ? [config.entity] : []} onChange={(ids) => save({ entity: ids[0] })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(entity name)" mono={false} />
    </div>
  );
}

const LockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
const ClosedLock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
const OpenLock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>;

const definition: WidgetDefinition<HassOneConfig> = {
  type: "halock",
  title: "HA Lock",
  icon: LockIcon,
  category: "homeassistant",
  description: "Home Assistant lock — lock / unlock a door with its current state.",
  minW: 2,
  minH: 1,
  maxW: 4,
  maxH: 3,
  defaultW: 2,
  defaultH: 1,
  defaultConfig: {},
  Component: LockComponent,
  ConfigPanel: LockConfigPanel,
};

export default definition;
