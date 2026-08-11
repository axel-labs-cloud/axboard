import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isCover, friendly, OpenInHass } from "../_hass";
import type { HassOneConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant — a single cover (blind / garage / curtain). Name in the
// header; body has large open / stop / close buttons and the position.
// ---------------------------------------------------------------------------

function CoverComponent({ config }: WidgetProps<HassOneConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");

  if (!b || !token || !id) return <EmptyState icon={CoverIcon} title="Connect Cover" hint="Set the base URL, a long-lived token and a cover.* entity." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const pos = e?.attributes?.current_position as number | undefined;
  const st = e?.state ?? "";
  const act = (service: "open_cover" | "close_cover" | "stop_cover", next: string) => {
    if (!id) return;
    opt(id, next);
    svc.mutate({ domain: "cover", service, data: { entity_id: id } });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={CoverIcon}
        title={config?.title?.trim() || friendly(e, id)}
        right={<span className="flex items-center gap-1.5"><span className="text-[11px] font-mono text-text-muted">{pos != null ? `${pos}%` : st}</span><OpenInHass base={b} id={id} /></span>}
      />
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex items-center justify-center gap-2">
        <Btn label="▲" title="Open" onClick={() => act("open_cover", "opening")} />
        <Btn label="■" title="Stop" onClick={() => act("stop_cover", st)} />
        <Btn label="▼" title="Close" onClick={() => act("close_cover", "closing")} />
      </div>
    </div>
  );
}

function Btn({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="flex-1 max-w-[70px] h-8 rounded border border-border text-text-muted hover:border-accent hover:text-accent text-[13px] leading-none flex items-center justify-center transition-colors">
      {label}
    </button>
  );
}

function CoverConfigPanel({ config, save }: WidgetConfigProps<HassOneConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Cover</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isCover} multiple={false} value={config?.entity ? [config.entity] : []} onChange={(ids) => save({ entity: ids[0] })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(entity name)" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Single cover. For several on one tile, use HA Covers.</p>
    </div>
  );
}

const CoverIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 8h18M3 12h18M3 16h18" />
  </svg>
);

const definition: WidgetDefinition<HassOneConfig> = {
  type: "hacoverone",
  title: "HA Cover",
  icon: CoverIcon,
  category: "homeassistant",
  group: "Covers",
  variant: "Single",
  description: "Home Assistant — one cover: open / stop / close a blind, garage door or curtain.",
  minW: 2,
  minH: 1,
  maxW: 4,
  maxH: 3,
  defaultW: 2,
  defaultH: 1,
  defaultConfig: {},
  Component: CoverComponent,
  ConfigPanel: CoverConfigPanel,
};

export default definition;
