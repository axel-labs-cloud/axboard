import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { useSharedHassCreds, useTileFit } from "../_hass";
import type { HomeAssistantConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant widget — entity roll-up. GET /api/states (Bearer long-lived
// token) → all entities. We derive people-home / lights-on / switches-on and
// render any extra entity_ids the user pins.
// ---------------------------------------------------------------------------

interface Entity {
  entity_id: string;
  state: string;
  attributes?: { friendly_name?: string; unit_of_measurement?: string };
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const onState = (s: string) => s === "on" || s === "home" || s === "open" || s === "playing";

function HomeAssistantComponent({ config }: WidgetProps<HomeAssistantConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Home Assistant";
  const token = config?.token?.trim();
  const pinned = config?.entities ?? [];
  const ready = !!b && !!token;
  const { ref, compact } = useTileFit();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["hass", b, token],
    enabled: ready,
    refetchInterval: 15_000,
    queryFn: () => api.fetchJson<Entity[]>({ url: `${b}/api/states`, headers: { Authorization: `Bearer ${token}` } }),
  });

  if (!ready) return <EmptyState icon={HomeIcon} title="Connect Home Assistant" hint="Set the base URL (http://host:8123) and a long-lived access token." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const byId = new Map(data.map((e) => [e.entity_id, e]));
  const count = (prefix: string) => data.filter((e) => e.entity_id.startsWith(prefix) && onState(e.state)).length;
  const peopleHome = data.filter((e) => e.entity_id.startsWith("person.") && e.state === "home").length;

  // Compact single-row summary only when the tile is genuinely too short.
  if (compact) {
    return (
      <div ref={ref} className="h-full flex items-center gap-2.5 px-2.5 overflow-hidden text-[12px]">
        <span className="shrink-0 text-text-muted">{HomeIcon}</span>
        <span className="text-text-secondary">{peopleHome} home</span>
        <span className="text-text-muted/40">·</span>
        <span className="text-text-secondary">{count("light.")} lights</span>
        <span className="text-text-muted/40">·</span>
        <span className="text-text-secondary">{count("switch.")} sw</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={HomeIcon} title={title} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 flex flex-col justify-center gap-2.5">
        <StatTiles
          tiles={[
            { label: "Home", value: String(peopleHome), color: peopleHome > 0 ? "var(--color-up)" : undefined },
            { label: "Lights on", value: String(count("light.")), color: count("light.") > 0 ? "var(--color-degraded)" : undefined },
            { label: "Switches", value: String(count("switch.")) },
          ]}
        />
        {pinned.length > 0 && (
          <div className="divide-y divide-border-subtle">
            {pinned.map((id) => {
              const e = byId.get(id.trim());
              return (
                <div key={id} className="flex items-baseline gap-2 py-1">
                  <span className="text-[11.5px] text-text-secondary truncate flex-1" title={id}>{e?.attributes?.friendly_name ?? id}</span>
                  <span className="text-[11px] font-mono text-text shrink-0">
                    {e ? `${e.state}${e.attributes?.unit_of_measurement ? ` ${e.attributes.unit_of_measurement}` : ""}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HomeAssistantConfigPanel({ config, save }: WidgetConfigProps<HomeAssistantConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <ConfigField
        label="Pinned entities"
        value={(config?.entities ?? []).join(", ")}
        onChange={(v) => save({ entities: v.split(",").map((s) => s.trim()).filter(Boolean) })}
        placeholder="sensor.temperature, binary_sensor.door"
        hint="comma-separated entity_ids"
      />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Home Assistant" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Reads /api/states. The token stays in your config.yaml.</p>
    </div>
  );
}

const HomeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
);

const definition: WidgetDefinition<HomeAssistantConfig> = {
  type: "homeassistant",
  title: "Home Assistant",
  icon: HomeIcon,
  category: "services",
  description: "Home Assistant — people home, lights and switches on, plus any entities you pin.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 1,
  defaultConfig: {},
  Component: HomeAssistantComponent,
  ConfigPanel: HomeAssistantConfigPanel,
};

export default definition;
