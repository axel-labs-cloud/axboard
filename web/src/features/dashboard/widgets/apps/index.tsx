import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, GroupDef, StatusMap } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import type { AppsConfig, AppsDensity, WidgetDefinition, WidgetProps } from "../types";
import { ServicesEditor } from "./ServicesEditor";

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
      return "bg-emerald-400 status-pulse";
    case "degraded":
      return "bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.22)]";
    case "down":
      return "bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.22)]";
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
        className="rounded-md flex items-center justify-center text-text text-[11px] font-semibold shrink-0"
        style={{ width: size, height: size, background: hashColor(app.name) }}
      >
        {initials(app.name)}
      </div>
    );
  }
  return (
    <div className="shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
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
};

function AppCard({ app, status, density }: CardProps) {
  const showStatus = density !== "compact" && app.health && app.health.type !== "none";
  const showDetailed = density === "detailed";
  const iconSize = density === "compact" ? 28 : density === "detailed" ? 40 : 34;
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group/card relative flex items-center gap-3 rounded-md border border-border-subtle bg-bg-card/70 px-2.5 py-2 hover:border-accent/40 hover:bg-bg-elevated hover:-translate-y-px hover:shadow-lg hover:shadow-black/30 transition-all min-w-0"
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
          <AppCard key={app.id} app={app} status={statuses[app.id]} density={density} />
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
    const isFiltered = (groupFilter?.length ?? 0) > 0;
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-2">
        <div className="w-9 h-9 rounded-lg bg-bg-elevated/60 border border-border-subtle flex items-center justify-center text-text-muted">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <div className="text-text-secondary text-[12px] font-medium">
          {isFiltered ? "No apps match" : "No apps configured"}
        </div>
        <div className="text-text-muted text-[10.5px] leading-snug max-w-[200px]">
          {isFiltered
            ? "Adjust the group filter in the widget config, or add apps to these groups in config.yaml."
            : "Add apps under the `apps:` key in config.yaml."}
        </div>
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
    <div className="space-y-5">
      <ConfigField label="Groups">
        {groups.length === 0 ? (
          <div className="text-[11px] text-text-muted italic px-1">
            No groups defined in config.yaml.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <ChipToggle active={selected.size === 0} onClick={() => save({ groups: [] })}>
              All
            </ChipToggle>
            {groups.map((g) => (
              <ChipToggle
                key={g.id}
                active={selected.has(g.id)}
                onClick={() => toggleGroup(g.id)}
                accentColor={g.color}
              >
                {g.name}
              </ChipToggle>
            ))}
          </div>
        )}
      </ConfigField>

      <ConfigField label="Density">
        <SegmentedControl
          value={density}
          onChange={(d) => save({ density: d as AppsDensity })}
          options={[
            { value: "compact", label: "Compact" },
            { value: "default", label: "Default" },
            { value: "detailed", label: "Detailed" },
          ]}
        />
      </ConfigField>

      <div className="pt-2 border-t border-border-subtle">
        <ManageServicesButton />
      </div>
    </div>
  );
}

function ManageServicesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 text-[12px] rounded border border-border-subtle bg-bg-card/40 text-text-secondary hover:text-text hover:border-accent/40 hover:bg-bg-card transition-colors flex items-center justify-center gap-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
        Manage services…
      </button>
      <ServicesEditor open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ConfigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipToggle({
  active,
  onClick,
  accentColor,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accentColor?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
        active
          ? "border-accent/50 bg-accent/15 text-text"
          : "border-border-subtle bg-bg-card/40 text-text-muted hover:text-text-secondary hover:border-border"
      }`}
    >
      {accentColor && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: accentColor }}
        />
      )}
      {children}
    </button>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex p-0.5 rounded-md border border-border-subtle bg-bg-card/40">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 text-[11px] rounded transition-colors ${
            value === o.value
              ? "bg-bg-elevated text-text shadow-sm"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
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
