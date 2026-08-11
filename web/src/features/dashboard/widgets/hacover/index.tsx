import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isCover, friendly } from "../_hass";
import type { HassCoverConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant covers — open / stop / close (and position when reported) for
// blinds, garage doors, curtains. Uses cover.open_cover/close_cover/stop_cover.
// ---------------------------------------------------------------------------

function CoverComponent({ config, h }: WidgetProps<HassCoverConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || "Covers";
  const ids = config?.entities ?? [];
  const ready = !!b && !!token && ids.length > 0;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");

  if (!b || !token) return <EmptyState icon={CoverIcon} title="Connect Covers" hint="Set the base URL, a long-lived token and pick cover entities." />;
  if (ids.length === 0) return <EmptyState icon={CoverIcon} title="Pick covers" hint="Add cover.* entity ids in this widget's config." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const byId = new Map(data.map((e) => [e.entity_id, e]));
  const act = (id: string, service: "open_cover" | "close_cover" | "stop_cover", next: string) => {
    opt(id, next);
    svc.mutate({ domain: "cover", service, data: { entity_id: id } });
  };

  // Compact single-row layout for short (1-row) tiles: first cover's controls.
  if (h <= 1) {
    const id = ids[0];
    const e = byId.get(id);
    const st = e?.state ?? "";
    return (
      <div className="h-full flex items-center gap-2 px-2.5 overflow-hidden">
        <span className="text-[12px] text-text-secondary truncate flex-1" title={id}>
          {friendly(e, id)}{ids.length > 1 ? ` +${ids.length - 1}` : ""}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <CoverBtn label="▲" title="Open" onClick={() => act(id, "open_cover", "opening")} />
          <CoverBtn label="■" title="Stop" onClick={() => act(id, "stop_cover", st)} />
          <CoverBtn label="▼" title="Close" onClick={() => act(id, "close_cover", "closing")} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={CoverIcon} title={title} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 space-y-1.5">
        {ids.map((id) => {
          const e = byId.get(id);
          const pos = e?.attributes?.current_position as number | undefined;
          const st = e?.state ?? "";
          return (
            <div key={id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-text-secondary truncate" title={id}>{friendly(e, id)}</span>
                <span className="block text-[9.5px] font-mono text-text-muted">{pos != null ? `${pos}% open` : st}</span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <CoverBtn label="▲" title="Open" onClick={() => act(id, "open_cover", "opening")} />
                <CoverBtn label="■" title="Stop" onClick={() => act(id, "stop_cover", st)} />
                <CoverBtn label="▼" title="Close" onClick={() => act(id, "close_cover", "closing")} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoverBtn({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="w-7 h-7 rounded border border-border text-text-muted hover:border-accent hover:text-accent text-[11px] leading-none flex items-center justify-center">
      {label}
    </button>
  );
}

function CoverConfigPanel({ config, save }: WidgetConfigProps<HassCoverConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Covers</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isCover} value={config?.entities ?? []} onChange={(entities) => save({ entities })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Covers" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">URL + token are shared across HA widgets — set them once.</p>
    </div>
  );
}

const CoverIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 8h18M3 12h18M3 16h18" />
  </svg>
);

const definition: WidgetDefinition<HassCoverConfig> = {
  type: "hacover",
  title: "HA Covers",
  icon: CoverIcon,
  category: "services",
  description: "Home Assistant covers — open / stop / close blinds, garage doors and curtains, with position.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 1,
  defaultConfig: {},
  Component: CoverComponent,
  ConfigPanel: CoverConfigPanel,
};

export default definition;
