import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useSharedHassCreds, useTileFit, EntityPicker, isScene, friendly } from "../_hass";
import type { HassScenesConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant scenes — one-tap buttons for scenes, scripts, automations and
// buttons. The service depends on the domain (scene/script → turn_on,
// button/input_button → press, automation → trigger).
// ---------------------------------------------------------------------------

const serviceFor = (id: string): { domain: string; service: string } => {
  const domain = id.split(".")[0];
  if (domain === "button" || domain === "input_button") return { domain, service: "press" };
  if (domain === "automation") return { domain, service: "trigger" };
  return { domain, service: "turn_on" };
};

function ScenesComponent({ config }: WidgetProps<HassScenesConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || "Scenes";
  const ids = config?.entities ?? [];
  const ready = !!b && !!token && ids.length > 0;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready);
  const svc = useHassService(b, token ?? "");
  const { ref, compact } = useTileFit();

  if (!b || !token) return <EmptyState icon={SceneIcon} title="Connect Scenes" hint="Set the base URL, a long-lived token and pick scenes/scripts." />;
  if (ids.length === 0) return <EmptyState icon={SceneIcon} title="Pick scenes" hint="Add scene.* / script.* / button.* entities in this widget's config." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const byId = new Map(data.map((e) => [e.entity_id, e]));
  const fire = (id: string) => {
    const s = serviceFor(id);
    svc.mutate({ domain: s.domain, service: s.service, data: { entity_id: id } });
  };

  // Compact single-row layout only when the tile is genuinely too short.
  if (compact) {
    return (
      <div ref={ref} className="h-full flex items-center gap-1.5 px-2.5 overflow-x-auto">
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => fire(id)}
            className="px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:border-accent/60 hover:bg-accent/10 hover:text-accent transition-colors shrink-0 whitespace-nowrap"
            title={id}
          >
            {friendly(byId.get(id), id)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={SceneIcon} title={title} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 flex flex-col">
        <div className="grid grid-cols-2 gap-1.5 my-auto w-full">
          {ids.map((id) => {
            const s = serviceFor(id);
            return (
              <button
                key={id}
                onClick={() => svc.mutate({ domain: s.domain, service: s.service, data: { entity_id: id } })}
                className="px-2 py-2 text-[11.5px] rounded border border-border text-text-secondary hover:border-accent/60 hover:bg-accent/10 hover:text-accent transition-colors truncate text-left"
                title={id}
              >
                {friendly(byId.get(id), id)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScenesConfigPanel({ config, save }: WidgetConfigProps<HassScenesConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Scenes / scripts / buttons</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isScene} value={config?.entities ?? []} onChange={(entities) => save({ entities })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Scenes" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">URL + token are shared across HA widgets — set them once.</p>
    </div>
  );
}

const SceneIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const definition: WidgetDefinition<HassScenesConfig> = {
  type: "hascenes",
  title: "HA Scenes",
  icon: SceneIcon,
  category: "services",
  description: "Home Assistant scenes — one-tap buttons for scenes, scripts, automations and buttons.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 1,
  defaultConfig: {},
  Component: ScenesComponent,
  ConfigPanel: ScenesConfigPanel,
};

export default definition;
