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

// IconChip fills its parent (h-full aspect-square) — caller controls size
// via the container's height. This way the widget can scale icons with the
// grid cell size without measuring DOM.
function IconChip({ app, className = "" }: { app: AppDef; className?: string }) {
  if (!app.icon) {
    return (
      <div
        className={`rounded-md flex items-center justify-center text-text font-semibold leading-none ${className}`}
        style={{ background: hashColor(app.name), fontSize: "min(45%, 13px)" }}
      >
        {initials(app.name)}
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center ${className}`}>
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

// CompactIcon — bare icon tile, used in small density.
// Square: height fills the strip, width matches via aspect-square.
function CompactIcon({ app }: { app: AppDef }) {
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noreferrer noopener"
      title={app.description ? `${app.name} — ${app.description}` : app.name}
      className="h-full aspect-square flex-shrink-0 flex items-center justify-center rounded-md border border-transparent hover:border-accent/40 hover:bg-bg-card/40 transition-colors p-1"
    >
      <IconChip app={app} className="w-full h-full" />
    </a>
  );
}

// MediumCard — icon + name + status dot in a horizontal pill, used in
// medium density.
function MediumCard({ app, status }: { app: AppDef; status?: StatusMap[string] }) {
  const showStatus = app.health && app.health.type !== "none";
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noreferrer noopener"
      title={app.description || app.name}
      className="group/card relative h-full flex items-center gap-2 rounded-md border border-border-subtle bg-bg-card/70 px-2 hover:border-accent/40 hover:bg-bg-elevated transition-colors min-w-0 flex-shrink-0"
      style={{ minWidth: 130 }}
    >
      <div className="h-full py-1.5 aspect-square flex-shrink-0">
        <IconChip app={app} className="w-full h-full" />
      </div>
      <div className="min-w-0 flex-1 flex items-center gap-1.5">
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
    </a>
  );
}

function GroupLabelHorizontal({ group, count }: { group?: GroupDef; count: number }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 w-[112px] min-w-0">
      {group?.color && (
        <span
          className="inline-block w-1 h-4 rounded-sm shrink-0"
          style={{ background: group.color }}
        />
      )}
      <span className="text-[10px] uppercase tracking-[0.06em] text-text-secondary font-semibold truncate">
        {group?.name ?? "Ungrouped"}
      </span>
      <span className="text-[9.5px] text-text-muted/60 tabular-nums shrink-0">{count}</span>
    </div>
  );
}

function GroupLabelInline({ group, count }: { group?: GroupDef; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-0.5 shrink-0">
      {group?.color && (
        <span
          className="inline-block w-1.5 h-3 rounded-sm shrink-0"
          style={{ background: group.color }}
        />
      )}
      <span className="text-[10px] uppercase tracking-[0.08em] text-text-secondary font-semibold truncate">
        {group?.name ?? "Ungrouped"}
      </span>
      <span className="text-[10px] text-text-muted/60 tabular-nums shrink-0">{count}</span>
    </div>
  );
}

// CategoryStrip — one row representing a group. Layout differs by density.
function CategoryStrip({
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

  if (density === "compact") {
    // Horizontal: [color | label | count]  [icon icon icon icon ...]
    return (
      <div className="h-full flex items-center gap-2 px-2 min-w-0">
        <GroupLabelHorizontal group={group} count={apps.length} />
        <div className="flex gap-1 flex-1 min-w-0 overflow-hidden h-full items-center py-1">
          {apps.map((app) => (
            <CompactIcon key={app.id} app={app} />
          ))}
        </div>
      </div>
    );
  }

  // medium / default — label on top, cards below
  return (
    <div className="h-full flex flex-col gap-1 px-2 min-w-0 py-1.5">
      <GroupLabelInline group={group} count={apps.length} />
      <div className="flex gap-2 flex-1 min-w-0 overflow-hidden">
        {apps.map((app) => (
          <MediumCard key={app.id} app={app} status={statuses[app.id]} />
        ))}
      </div>
    </div>
  );
}

function AppsWidget({ config, h }: WidgetProps<AppsConfig>) {
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

  const ordered = useMemo<{ group?: GroupDef; apps: AppDef[] }[]>(() => {
    const byGroup = new Map<string | null, AppDef[]>();
    for (const a of filteredApps) {
      const key = a.group ?? null;
      const arr = byGroup.get(key) ?? [];
      arr.push(a);
      byGroup.set(key, arr);
    }
    const out: { group?: GroupDef; apps: AppDef[] }[] = [];
    for (const g of groupsList) {
      const arr = byGroup.get(g.id);
      if (arr && arr.length > 0) out.push({ group: g, apps: arr });
    }
    const ungrouped = byGroup.get(null);
    if (ungrouped && ungrouped.length > 0) out.push({ apps: ungrouped });
    return out;
  }, [filteredApps, groupsList]);

  if (filteredApps.length === 0) {
    const isFiltered = (groupFilter?.length ?? 0) > 0;
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-2">
        <div className="w-9 h-9 rounded-lg bg-bg-elevated/60 border border-border-subtle flex items-center justify-center text-text-muted">
          <AppsIcon />
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

  // Each density implies a number of strips per grid-H unit:
  //   compact (small)  → 2 strips per H, so 2H = 4 categories
  //   default (medium) → 1 strip per H, so 2H = 2 categories
  // The widget hides extra sections rather than scrolling.
  const stripsPerH = density === "compact" ? 2 : 1;
  const totalStrips = Math.max(1, Math.floor(h * stripsPerH));
  const visible = ordered.slice(0, totalStrips);

  return (
    <div className="h-full w-full overflow-hidden flex flex-col">
      {visible.map((section, i) => (
        <div
          key={section.group?.id ?? `__nogroup_${i}`}
          className="min-h-0 w-full"
          style={{ height: `${100 / totalStrips}%` }}
        >
          <CategoryStrip
            group={section.group}
            apps={section.apps}
            statuses={statuses}
            density={density}
          />
        </div>
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

      <ConfigField label="Size">
        <SegmentedControl
          value={density === "detailed" ? "default" : density}
          onChange={(d) => save({ density: d as AppsDensity })}
          options={[
            { value: "compact", label: "Small" },
            { value: "default", label: "Medium" },
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
