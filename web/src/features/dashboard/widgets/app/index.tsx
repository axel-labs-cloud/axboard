import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, GroupDef, StatusMap, HistoryMap } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import type {
  AppConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";
import { initials, hashColor, statusClasses } from "../apps/appVisual";
import { WakeButton, canWake } from "../WakeButton";

// ---------------------------------------------------------------------------
// App widget — single service per instance. The layout switches based on
// the widget's grid size: tiny → big icon only; wide → horizontal row;
// detailed → icon + name + description + response-time pill.
// Sizes allowed: 1x1, 1x2, 1x3, 2x1, 2x2, 2x3.
// ---------------------------------------------------------------------------

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

  const { data: history = {} as HistoryMap } = useQuery({
    queryKey: ["apps-history"],
    queryFn: api.getHistory,
    refetchInterval: 15_000,
    enabled: hasHealth,
  });

  if (!app) return <Empty />;

  const hist = history[app.id] ?? [];
  const uptimePct =
    hist.length > 0
      ? Math.round((hist.filter((p) => p.status === "healthy").length / hist.length) * 100)
      : null;
  const spark = hist.map((p) => p.response_ms || 0);

  // Visibility toggles. Default = visible; user unchecks to hide.
  const showStatus = (config?.showStatus ?? true) && hasHealth;
  const showResponseTime = (config?.showResponseTime ?? true) && hasHealth;
  const showLastChecked = (config?.showLastChecked ?? true) && hasHealth;
  const descText =
    (config?.descriptionOverride && config.descriptionOverride.trim()) ||
    app.description ||
    "";
  const showDescription = (config?.showDescription ?? true) && !!descText;

  const linkClass =
    "group/tile flex w-full h-full hover:bg-bg-hover transition-colors min-w-0 min-h-0";
  const sameTab = config?.openSameTab ?? false;
  const props = {
    href: app.url,
    target: sameTab ? undefined : "_blank",
    rel: sameTab ? undefined : "noreferrer noopener",
    title: app.description || app.name,
  };

  // Wake-on-LAN button: shown while the service is not healthy. It sits in a
  // relative shell as a sibling of the link (a <button> can't nest in an <a>).
  const wolBtn = canWake(app, status) ? (
    <WakeButton mac={app.wol!.mac} broadcast={app.wol!.broadcast} className="pointer-events-auto shadow" />
  ) : null;
  // shell wraps a layout's <a> with optional corner overlays.
  const shell = (inner: React.ReactNode, corner?: React.ReactNode) => (
    <div className="relative w-full h-full">
      {inner}
      {corner}
    </div>
  );
  const lastCheckedStr =
    status?.last_checked ? new Date(status.last_checked).toLocaleTimeString() : null;

  // 1×1 — icon only, centered. Status dot floats in the top-right corner.
  if (w === 1 && h === 1) {
    return shell(
      <a {...props} className={`${linkClass} items-center justify-center p-2 relative`}>
        <Icon app={app} className="w-3/4 h-3/4 max-w-[64px] max-h-[64px]" />
        {hasHealth && (
          <span className="absolute top-1 right-1.5">
            <StatusDot status={status} size="sm" />
          </span>
        )}
      </a>,
      wolBtn && <div className="absolute bottom-1 right-1 z-10">{wolBtn}</div>,
    );
  }

  // 1×2 / 1×3 — horizontal row: icon left, name (and optional description)
  // middle, response time + dot right. Icon sized to match 1×1 visually
  // (the 1×1 layout has p-2, so its effective icon size is ~50% of widget
  // height — using h-1/2 here keeps them consistent).
  if (h === 1) {
    return shell(
      <a {...props} className={`${linkClass} items-center gap-3 px-3`}>
        <div className="h-1/2 aspect-square shrink-0 max-h-[44px]">
          <Icon app={app} className="w-full h-full" />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <span className="text-text font-medium text-[14px] truncate leading-tight">
            {app.name}
          </span>
          {w >= 3 && showDescription && (
            <span className="text-text-muted text-[11px] truncate leading-snug">{descText}</span>
          )}
        </div>
        {w >= 3 && showResponseTime && status?.response_ms != null && (
          <span className="text-[10px] text-text-muted/80 font-mono tabular-nums shrink-0">
            {status.response_ms} ms
          </span>
        )}
        {showStatus && <StatusDot status={status} size="md" />}
      </a>,
      wolBtn && <div className="absolute top-1 right-1 z-10">{wolBtn}</div>,
    );
  }

  // 2×1 — vertical column: icon top, name + dot below.
  if (w === 1) {
    return shell(
      <a {...props} className={`${linkClass} flex-col items-center justify-center p-2 gap-1.5`}>
        <div className="h-1/2 aspect-square">
          <Icon app={app} className="w-full h-full" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0 max-w-full">
          <span className="text-text font-medium text-[12px] truncate">{app.name}</span>
          {showStatus && <StatusDot status={status} size="sm" />}
        </div>
      </a>,
      wolBtn && <div className="absolute top-1 right-1 z-10">{wolBtn}</div>,
    );
  }

  // 2×2 — square: big icon centered, name below. Status dot + wake move to the
  // top-right corner so the icon/name stay put.
  if (w === 2 && h === 2) {
    return shell(
      <a {...props} className={`${linkClass} flex-col items-center justify-center p-3 gap-2`}>
        <div className="h-1/2 aspect-square">
          <Icon app={app} className="w-full h-full" />
        </div>
        <div className="flex flex-col items-center gap-0.5 min-w-0 max-w-full">
          <span className="text-text font-medium text-[15px] truncate max-w-full">{app.name}</span>
          {showDescription && (
            <span className="text-text-muted text-[11px] truncate leading-snug max-w-full">
              {descText}
            </span>
          )}
        </div>
      </a>,
      <div className="absolute top-2 right-2.5 z-10 flex items-center gap-1.5 pointer-events-none">
        {showStatus && <StatusDot status={status} size="md" />}
        {wolBtn}
      </div>,
    );
  }

  // 2×3 — detail view: big icon left, name + description. Response time, last
  // checked, status dot and the wake button move to the top-right corner so the
  // icon and text keep their position.
  return shell(
    <a {...props} className={`${linkClass} items-center gap-4 px-4 py-3`}>
      <div className="h-full max-h-[100px] aspect-square shrink-0 py-1">
        <Icon app={app} className="w-full h-full" />
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1 pr-12">
        <span className="text-text font-semibold text-[16px] truncate">{app.name}</span>
        {showDescription && (
          <span className="text-text-muted text-[12px] truncate leading-snug">{descText}</span>
        )}
        {hasHealth && h >= 3 && spark.length >= 2 && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-[10px] text-text-muted mb-0.5">
              <span>Response trend</span>
              {uptimePct != null && (
                <span className="text-up font-mono tabular-nums">{uptimePct}% up</span>
              )}
            </div>
            <div className={statusColor(status?.status)}>
              <Spark points={spark} />
            </div>
          </div>
        )}
      </div>
    </a>,
    <div className="absolute top-3 right-3.5 z-10 flex items-center gap-2 pointer-events-none">
      {hasHealth && status && ((showResponseTime && status.response_ms != null) || (showLastChecked && lastCheckedStr)) && (
        <div className="flex flex-col items-end leading-tight font-mono tabular-nums text-[10px] text-text-muted/80">
          {showResponseTime && status.response_ms != null && <span>{status.response_ms} ms</span>}
          {showLastChecked && lastCheckedStr && <span>{lastCheckedStr}</span>}
        </div>
      )}
      {showStatus && <StatusDot status={status} size="lg" />}
      {wolBtn}
    </div>,
  );
}

// Compact response-time sparkline; colored by the current status.
function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const W = 100;
  const H = 20;
  const step = W / (points.length - 1);
  const d = points
    .map((v, i) => `${(i * step).toFixed(1)},${(H - (v / max) * H).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-5">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function statusColor(s: string | undefined): string {
  return s === "down" ? "text-down" : s === "degraded" ? "text-degraded" : "text-up";
}

function AppConfigPanel({ config, save }: WidgetConfigProps<AppConfig>) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[]; groups?: GroupDef[] }>(["config"]);
  const apps = cfg?.apps ?? [];
  const groups = cfg?.groups ?? [];
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const selectedApp = apps.find((a) => a.id === config?.appId);
  const hasHealth = !!selectedApp?.health && selectedApp.health.type !== "none";

  // Apps grouped by category, for a nicer dropdown.
  const grouped = new Map<string | null, AppDef[]>();
  for (const a of apps) {
    const k = a.group || null;
    const arr = grouped.get(k) ?? [];
    arr.push(a);
    grouped.set(k, arr);
  }

  return (
    <div className="space-y-4">
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
          No apps defined. Add some in config.yaml or via Manage services.
        </div>
      )}

      {selectedApp && (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
                Description
              </label>
              <span className="text-[10px] text-text-muted/70">
                {selectedApp.description ? "(overrides app default)" : ""}
              </span>
            </div>
            <input
              value={config?.descriptionOverride ?? ""}
              onChange={(e) => save({ descriptionOverride: e.target.value })}
              placeholder={selectedApp.description || "(no default)"}
              className="w-full px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
              Show
            </label>
            <div className="space-y-1.5">
              <ToggleRow
                label="Description"
                checked={config?.showDescription ?? true}
                onChange={(v) => save({ showDescription: v })}
              />
              <ToggleRow
                label="Status monitor"
                checked={config?.showStatus ?? true}
                onChange={(v) => save({ showStatus: v })}
                disabled={!hasHealth}
                hint={hasHealth ? undefined : "no health check on this service"}
              />
              <ToggleRow
                label="Response time"
                checked={config?.showResponseTime ?? true}
                onChange={(v) => save({ showResponseTime: v })}
                disabled={!hasHealth}
                hint={hasHealth ? "shown in 2x3" : "no health check on this service"}
              />
              <ToggleRow
                label="Last checked"
                checked={config?.showLastChecked ?? true}
                onChange={(v) => save({ showLastChecked: v })}
                disabled={!hasHealth}
                hint={hasHealth ? "shown in 2x3" : "no health check on this service"}
              />
              <ToggleRow
                label="Open in same tab"
                checked={config?.openSameTab ?? false}
                onChange={(v) => save({ openSameTab: v })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-[12px] ${
        disabled ? "text-text-muted/50 cursor-not-allowed" : "text-text-secondary cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-accent"
      />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] text-text-muted/70 italic">{hint}</span>}
    </label>
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
