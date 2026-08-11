import { WidgetHeader, EmptyState, ErrorState, StatusDot } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useSharedHassCreds, friendly } from "../_hass";
import type { HassConnConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant presence — who's home. Lists every person.* with their zone
// (home / away / a named zone) and avatar. No entity picker: it finds them.
// ---------------------------------------------------------------------------

function PresenceComponent({ config }: WidgetProps<HassConnConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || "Presence";
  const ready = !!b && !!token;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready, 15_000);

  if (!ready) return <EmptyState icon={PeopleIcon} title="Connect Presence" hint="Set the base URL and a long-lived token — it lists your people." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const people = data.filter((e) => e.entity_id.startsWith("person.")).sort((a, z) => friendly(a, a.entity_id).localeCompare(friendly(z, z.entity_id)));
  const home = people.filter((p) => p.state === "home").length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={PeopleIcon} title={title} right={<span className="text-[11px] font-mono text-text-muted">{home}/{people.length} home</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 flex flex-col">
        <div className="divide-y divide-border-subtle my-auto w-full">
          {people.length === 0 && <div className="text-[11px] text-text-muted py-1">No person entities.</div>}
          {people.map((p) => {
            const pic = p.attributes?.entity_picture as string | undefined;
            const isHome = p.state === "home";
            return (
              <div key={p.entity_id} className="flex items-center gap-2 py-1.5">
                {pic ? (
                  <img src={`${b}${pic}`} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] text-text-muted shrink-0">
                    {friendly(p, p.entity_id).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="text-[12px] text-text-secondary truncate flex-1">{friendly(p, p.entity_id)}</span>
                <StatusDot status={isHome ? "up" : "unknown"} size="sm" />
                <span className={`text-[11px] font-mono capitalize shrink-0 ${isHome ? "text-up" : "text-text-muted"}`}>
                  {p.state === "not_home" ? "away" : p.state}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PresenceConfigPanel({ config, save }: WidgetConfigProps<HassConnConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Presence" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Automatically lists every person tracked by Home Assistant.</p>
    </div>
  );
}

const PeopleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);

const definition: WidgetDefinition<HassConnConfig> = {
  type: "hapresence",
  title: "HA Presence",
  icon: PeopleIcon,
  category: "homeassistant",
  description: "Home Assistant presence — who's home, with avatars and zones (auto-lists your people).",
  minW: 2,
  minH: 1,
  maxW: 5,
  maxH: 8,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: PresenceComponent,
  ConfigPanel: PresenceConfigPanel,
};

export default definition;
