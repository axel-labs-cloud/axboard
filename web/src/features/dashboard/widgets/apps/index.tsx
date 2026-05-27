import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, GroupDef, StatusMap } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import type { AppsConfig, AppsDensity, WidgetDefinition, WidgetProps } from "../types";

function AppsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function statusClasses(s: string | undefined): string {
  switch (s) {
    case "healthy":
      return "bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.18)]";
    case "degraded":
      return "bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.18)]";
    case "down":
      return "bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.18)]";
    case "unknown":
    default:
      return "bg-text-muted/60";
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 35%, 25%)`;
}

function IconChip({ app, size }: { app: AppDef; size: number }) {
  if (!app.icon) {
    return (
      <div
        className="rounded-md flex items-center justify-center text-text text-[11px] font-semibold shrink-0 ring-1 ring-white/5"
        style={{ width: size, height: size, background: hashColor(app.name) }}
      >
        {initials(app.name)}
      </div>
    );
  }
  return (
    <div
      className="shrink-0 flex items-center justify-center rounded-md bg-bg-elevated/40 ring-1 ring-white/5 p-1"
      style={{ width: size, height: size }}
    >
      <SimpleIcon slug={app.icon} fill />
    </div>
  );
}

function StatusDot({
  status,
  lastChecked,
  responseMs,
  error,
}: {
  status: string | undefined;
  lastChecked?: string;
  responseMs?: number;
  error?: string;
}) {
  const title = [
    status ? `status: ${status}` : "no health check",
    lastChecked ? `checked: ${new Date(lastChecked).toLocaleTimeString()}` : "",
    responseMs != null ? `${responseMs} ms` : "",
    error ? `error: ${error}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusClasses(status)}`}
      title={title}
    />
  );
}

type CardProps = {
  app: AppDef;
  status?: StatusMap[string];
  density: AppsDensity;
  groupColor?: string;
};

function AppCard({ app, status, density, groupColor }: CardProps) {
  const showStatus = density !== "compact" && app.health && app.health.type !== "none";
  const showDetailed = density === "detailed";
  const iconSize = density === "compact" ? 28 : density === "detailed" ? 40 : 34;
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group/card relative flex items-center gap-3 rounded-md border border-border-subtle bg-bg-card/70 px-2.5 py-2 hover:border-accent/40 hover:bg-bg-elevated hover:-translate-y-px hover:shadow-lg hover:shadow-black/30 transition-all min-w-0"
      style={groupColor ? { borderLeftColor: groupColor, borderLeftWidth: 2 } : undefined}
      title={app.description || app.name}
    >
      <IconChip app={app} size={iconSize} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12.5px] text-text font-medium truncate leading-tight">
            {app.name}
          </span>
          {showStatus && (
            <StatusDot
              status={status?.status}
              lastChecked={status?.last_checked}
              responseMs={status?.response_ms}
              error={status?.error}
            />
          )}
        </div>
        {showDetailed && (
          <div className="flex items-center gap-2 mt-0.5">
            {app.description && (
              <span className="text-[10.5px] text-text-muted truncate flex-1 leading-snug">
                {app.description}
              </span>
            )}
            {status?.response_ms != null && (
              <span className="text-[10px] text-text-muted/70 tabular-nums shrink-0">
                {status.response_ms} ms
              </span>
            )}
          </div>
        )}
      </div>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3 h-3 text-text-muted/40 group-hover/card:text-accent opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0"
      >
        <path d="M7 17L17 7" />
        <path d="M7 7h10v10" />
      </svg>
    </a>
  );
}

function GroupSection({
  group,
  apps,
  statuses,
  density,
}: {
  group?: GroupDef;
  apps: AppDef[];
  statuses: StatusMap;
  density: AppsDensity;
}) {
  if (apps.length === 0) return null;
  return (
    <div>
      {group && (
        <div className="flex items-center gap-2 px-1 mb-2">
          {group.color && (
            <span
              className="inline-block w-1.5 h-4 rounded-sm shrink-0"
              style={{ background: group.color }}
            />
          )}
          <span className="text-[10px] uppercase tracking-[0.08em] text-text-secondary font-semibold">
            {group.name}
          </span>
          <span className="text-[10px] text-text-muted/60 tabular-nums">{apps.length}</span>
          <span className="flex-1 h-px bg-border-subtle ml-1" />
        </div>
      )}
      <div
        className={
          density === "compact"
            ? "grid gap-2 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
            : density === "detailed"
              ? "grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]"
              : "grid gap-2 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]"
        }
      >
        {apps.map((app) => (
          <AppCard
            key={app.id}
            app={app}
            status={statuses[app.id]}
            density={density}
            groupColor={group?.color}
          />
        ))}
      </div>
    </div>
  );
}

function AppsWidget({ config }: WidgetProps<AppsConfig>) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[]; groups?: GroupDef[] }>(["config"]);
  const apps = cfg?.apps ?? [];
  const groupsList = cfg?.groups ?? [];
  const groupFilter = config?.groups;
  const density = (config?.density ?? "default") as AppsDensity;

  const { data: statuses = {} } = useQuery({
    queryKey: ["apps-status"],
    queryFn: api.getStatus,
    refetchInterval: 15_000,
  });

  const filteredApps = useMemo(() => {
    if (!groupFilter || groupFilter.length === 0) return apps;
    const set = new Set(groupFilter);
    return apps.filter((a) => (a.group ? set.has(a.group) : false));
  }, [apps, groupFilter]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string | null, AppDef[]>();
    for (const a of filteredApps) {
      const key = a.group ?? null;
      const arr = byGroup.get(key) ?? [];
      arr.push(a);
      byGroup.set(key, arr);
    }
    return byGroup;
  }, [filteredApps]);

  if (filteredApps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-[12px] p-2 text-center">
        No apps match this widget's filter.
      </div>
    );
  }

  // Render groups in YAML order, then any apps without a group.
  const ordered: { group?: GroupDef; apps: AppDef[] }[] = [];
  for (const g of groupsList) {
    const arr = grouped.get(g.id);
    if (arr && arr.length > 0) ordered.push({ group: g, apps: arr });
  }
  const ungrouped = grouped.get(null);
  if (ungrouped && ungrouped.length > 0) ordered.push({ apps: ungrouped });

  return (
    <div className="h-full overflow-auto p-2.5 space-y-3">
      {ordered.map((section, i) => (
        <GroupSection
          key={section.group?.id ?? `__nogroup_${i}`}
          group={section.group}
          apps={section.apps}
          statuses={statuses}
          density={density}
        />
      ))}
    </div>
  );
}

function AppsConfigPanel({
  config,
  save,
}: {
  config: AppsConfig;
  save: (patch: Partial<AppsConfig>) => void;
}) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ groups?: GroupDef[] }>(["config"]);
  const groups = cfg?.groups ?? [];
  const selected = new Set(config.groups ?? []);
  const density = config.density ?? "default";

  const toggleGroup = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save({ groups: Array.from(next) });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">
          Groups
        </div>
        {groups.length === 0 ? (
          <div className="text-[11px] text-text-muted">No groups defined in config.yaml.</div>
        ) : (
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === 0}
                onChange={() => save({ groups: [] })}
                className="accent-accent"
              />
              All groups
            </label>
            {groups.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  onChange={() => toggleGroup(g.id)}
                  className="accent-accent"
                />
                {g.color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: g.color }}
                  />
                )}
                {g.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">
          Density
        </div>
        <div className="flex gap-1">
          {(["compact", "default", "detailed"] as const).map((d) => (
            <button
              key={d}
              onClick={() => save({ density: d })}
              className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
                density === d
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border text-text-muted hover:text-text hover:border-border"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const def: WidgetDefinition<AppsConfig> = {
  type: "apps",
  title: "Apps",
  icon: <AppsIcon />,
  category: "infrastructure",
  description: "Clickable grid of apps with health pings.",
  minW: 2,
  minH: 2,
  maxW: 12,
  maxH: 12,
  defaultW: 6,
  defaultH: 4,
  defaultConfig: { density: "default" },
  Component: AppsWidget,
  ConfigPanel: AppsConfigPanel,
};

export default def;
