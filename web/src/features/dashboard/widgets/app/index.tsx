import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, GroupDef, StatusMap } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import type {
  AppConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// App widget — single service per instance. The layout switches based on
// the widget's grid size: tiny → big icon only; wide → horizontal row;
// detailed → icon + name + description + response-time pill.
// Sizes allowed: 1x1, 1x2, 1x3, 2x1, 2x2, 2x3.
// ---------------------------------------------------------------------------

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 35%, 25%)`;
}

function statusClasses(s: string | undefined): string {
  switch (s) {
    case "healthy":
      return "bg-emerald-400 status-pulse";
    case "degraded":
      return "bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.22)]";
    case "down":
      return "bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.22)]";
    default:
      return "bg-text-muted/60";
  }
}

function Icon({ app, className = "" }: { app: AppDef; className?: string }) {
  if (!app.icon) {
    return (
      <div
        className={`rounded-md flex items-center justify-center text-text font-semibold leading-none ${className}`}
        style={{ background: hashColor(app.name), fontSize: "clamp(10px, 32%, 28px)" }}
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
  size = "md",
}: {
  status?: StatusMap[string];
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "lg" ? "w-2.5 h-2.5" : size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";
  const title = status?.status
    ? `${status.status}${status.response_ms != null ? ` · ${status.response_ms} ms` : ""}${
        status.last_checked ? ` · ${new Date(status.last_checked).toLocaleTimeString()}` : ""
      }`
    : "no health check";
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${px} ${statusClasses(status?.status)}`}
      title={title}
    />
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-muted/50 gap-1.5 p-2 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </svg>
      <span className="text-[10px]">No app selected</span>
    </div>
  );
}

function AppComponent({ config, w, h }: WidgetProps<AppConfig>) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[] }>(["config"]);
  const app = cfg?.apps?.find((a) => a.id === config?.appId);

  const hasHealth = !!app?.health && app.health.type !== "none";
  const { data: statuses = {} } = useQuery({
    queryKey: ["apps-status"],
    queryFn: api.getStatus,
    refetchInterval: 15_000,
    enabled: hasHealth,
  });
  const status = app ? statuses[app.id] : undefined;

  if (!app) return <Empty />;

  const linkClass =
    "group/tile flex w-full h-full hover:bg-bg-hover transition-colors min-w-0 min-h-0";
  const props = {
    href: app.url,
    target: "_blank",
    rel: "noreferrer noopener",
    title: app.description || app.name,
  };

  // 1×1 — icon only, centered. Status dot floats in the top-right corner.
  if (w === 1 && h === 1) {
    return (
      <a {...props} className={`${linkClass} items-center justify-center p-2 relative`}>
        <Icon app={app} className="w-3/4 h-3/4 max-w-[64px] max-h-[64px]" />
        {hasHealth && (
          <span className="absolute top-1 right-1.5">
            <StatusDot status={status} size="sm" />
          </span>
        )}
      </a>
    );
  }

  // 1×2 / 1×3 — horizontal row: icon left, name (and optional description) middle, dot right.
  if (h === 1) {
    return (
      <a {...props} className={`${linkClass} items-center gap-3 px-3`}>
        <div className="h-3/4 aspect-square shrink-0">
          <Icon app={app} className="w-full h-full" />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <span className="text-text font-medium text-[14px] truncate leading-tight">
            {app.name}
          </span>
          {w >= 3 && app.description && (
            <span className="text-text-muted text-[11px] truncate leading-snug">
              {app.description}
            </span>
          )}
        </div>
        {hasHealth && <StatusDot status={status} size="md" />}
      </a>
    );
  }

  // 2×1 — vertical column: icon top, name + dot below.
  if (w === 1) {
    return (
      <a {...props} className={`${linkClass} flex-col items-center justify-center p-2 gap-1.5`}>
        <div className="h-1/2 aspect-square">
          <Icon app={app} className="w-full h-full" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0 max-w-full">
          <span className="text-text font-medium text-[12px] truncate">{app.name}</span>
          {hasHealth && <StatusDot status={status} size="sm" />}
        </div>
      </a>
    );
  }

  // 2×2 — square: big icon centered, name + dot below, optional description.
  if (w === 2 && h === 2) {
    return (
      <a {...props} className={`${linkClass} flex-col items-center justify-center p-3 gap-2`}>
        <div className="h-1/2 aspect-square">
          <Icon app={app} className="w-full h-full" />
        </div>
        <div className="flex flex-col items-center gap-0.5 min-w-0 max-w-full">
          <div className="flex items-center gap-2 min-w-0 max-w-full">
            <span className="text-text font-medium text-[15px] truncate">{app.name}</span>
            {hasHealth && <StatusDot status={status} size="md" />}
          </div>
          {app.description && (
            <span className="text-text-muted text-[11px] truncate leading-snug max-w-full">
              {app.description}
            </span>
          )}
        </div>
      </a>
    );
  }

  // 2×3 — detail view: big icon left, name + description + response time on right.
  return (
    <a {...props} className={`${linkClass} items-center gap-4 px-4 py-3`}>
      <div className="h-full max-h-[100px] aspect-square shrink-0 py-1">
        <Icon app={app} className="w-full h-full" />
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-text font-semibold text-[16px] truncate">{app.name}</span>
          {hasHealth && <StatusDot status={status} size="lg" />}
        </div>
        {app.description && (
          <span className="text-text-muted text-[12px] truncate leading-snug">
            {app.description}
          </span>
        )}
        {hasHealth && status && (
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-muted/80 font-mono">
            {status.response_ms != null && (
              <span className="tabular-nums">{status.response_ms} ms</span>
            )}
            {status.last_checked && (
              <span className="tabular-nums">
                {new Date(status.last_checked).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </div>
    </a>
  );
}

function AppConfigPanel({ config, save }: WidgetConfigProps<AppConfig>) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[]; groups?: GroupDef[] }>(["config"]);
  const apps = cfg?.apps ?? [];
  const groups = cfg?.groups ?? [];
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // Apps grouped by category, for a nicer dropdown.
  const grouped = new Map<string | null, AppDef[]>();
  for (const a of apps) {
    const k = a.group || null;
    const arr = grouped.get(k) ?? [];
    arr.push(a);
    grouped.set(k, arr);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Service
        </label>
        <select
          value={config?.appId ?? ""}
          onChange={(e) => save({ appId: e.target.value || undefined })}
          className="w-full px-2.5 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
        >
          <option value="">(none)</option>
          {Array.from(grouped.entries()).map(([gid, list]) => (
            <optgroup
              key={gid ?? "__none"}
              label={gid ? (groupById.get(gid)?.name ?? gid) : "Ungrouped"}
            >
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {apps.length === 0 && (
        <div className="text-[11px] text-text-muted italic">
          No apps defined. Add some in config.yaml or via the Apps widget's “Manage services” button.
        </div>
      )}
    </div>
  );
}

const AppIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const def: WidgetDefinition<AppConfig> = {
  type: "app",
  title: "App",
  icon: AppIcon,
  category: "infrastructure",
  description: "Single service tile. Layout adapts from 1x1 to 2x3.",
  minW: 1,
  minH: 1,
  maxW: 3,
  maxH: 2,
  defaultW: 1,
  defaultH: 1,
  defaultConfig: {},
  Component: AppComponent,
  ConfigPanel: AppConfigPanel,
};

export default def;
