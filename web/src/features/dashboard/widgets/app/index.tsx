import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, GroupDef } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import type {
  AppConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// App widget — single service per instance. Pick one app from config.yaml.
// Renders as a big tile that scales with widget size.
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

function Icon({ app }: { app: AppDef }) {
  if (!app.icon) {
    return (
      <div
        className="w-full h-full rounded-md flex items-center justify-center text-text font-semibold leading-none"
        style={{ background: hashColor(app.name), fontSize: "clamp(10px, 32%, 28px)" }}
      >
        {initials(app.name)}
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center">
      <SimpleIcon slug={app.icon} fill />
    </div>
  );
}

function AppComponent({ config, w, h }: WidgetProps<AppConfig>) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[] }>(["config"]);
  const app = cfg?.apps?.find((a) => a.id === config?.appId);

  const { data: statuses = {} } = useQuery({
    queryKey: ["apps-status"],
    queryFn: api.getStatus,
    refetchInterval: 15_000,
    enabled: !!app && app.health?.type !== undefined && app.health?.type !== "none",
  });
  const status = app ? statuses[app.id] : undefined;

  if (!app) {
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

  const area = w * h;
  // Pull the icon size as a portion of the widget's MIN dimension via h-X and
  // w-X classes — keeps the icon square and proportional to the smaller side.
  const iconPortion = area >= 4 ? "60%" : area >= 2 ? "55%" : "50%";
  const showName = !(w === 1 && h === 1);
  const showStatus = !!app.health && app.health.type !== "none";

  return (
    <a
      href={app.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group/tile flex flex-col items-center justify-center w-full h-full gap-2 p-2 hover:bg-bg-hover transition-colors min-w-0 min-h-0"
      title={app.description || app.name}
    >
      <div
        className="flex items-center justify-center aspect-square shrink-0"
        style={{ height: iconPortion, maxWidth: iconPortion }}
      >
        <Icon app={app} />
      </div>
      {showName && (
        <div className="flex items-center gap-1.5 min-w-0 max-w-full">
          <span
            className="text-text font-medium truncate"
            style={{ fontSize: area >= 4 ? "14px" : area >= 2 ? "13px" : "12px" }}
          >
            {app.name}
          </span>
          {showStatus && (
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusClasses(status?.status)}`}
              title={
                status?.status
                  ? `${status.status}${status.response_ms ? ` · ${status.response_ms}ms` : ""}`
                  : "no health check"
              }
            />
          )}
        </div>
      )}
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
  description: "Single service tile. Pick one app to render as a big clickable button.",
  minW: 1,
  minH: 1,
  maxW: 6,
  maxH: 6,
  defaultW: 1,
  defaultH: 1,
  defaultConfig: {},
  Component: AppComponent,
  ConfigPanel: AppConfigPanel,
};

export default def;
