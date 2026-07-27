import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, GroupDef, StatusMap } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import type {
  AppsConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";
import { ServicesEditor } from "./ServicesEditor";
import { initials, hashColor, statusClasses, tileAlertClasses } from "./appVisual";

// ---------------------------------------------------------------------------
// Apps grid widget — Shortcut-style. Each instance shows a hand-picked
// subset of services from config.yaml, in a 2-per-grid-unit icon grid.
// User adds multiple instances (one per category, or however they want).
// ---------------------------------------------------------------------------

function Icon({ app, sizePortion }: { app: AppDef; sizePortion?: string }) {
  if (!app.icon) {
    return (
      <div
        className="rounded-md flex items-center justify-center text-text font-semibold leading-none"
        style={{
          width: sizePortion ?? "100%",
          height: sizePortion ?? "100%",
          background: hashColor(app.name),
          fontSize: "clamp(8px, 28%, 16px)",
        }}
      >
        {initials(app.name)}
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: sizePortion ?? "100%", height: sizePortion ?? "100%" }}
    >
      <SimpleIcon slug={app.icon} fill />
    </div>
  );
}

function Tile({
  app,
  status,
  showName,
  onCheck,
  sameTab,
}: {
  app: AppDef;
  status?: StatusMap[string];
  showName: boolean;
  onCheck?: () => void;
  sameTab?: boolean;
}) {
  const showStatus = !!app.health && app.health.type !== "none";
  return (
    <a
      href={app.url}
      target={sameTab ? undefined : "_blank"}
      rel={sameTab ? undefined : "noreferrer noopener"}
      onContextMenu={
        showStatus && onCheck
          ? (e) => {
              e.preventDefault();
              onCheck();
            }
          : undefined
      }
      className={`group/tile relative flex flex-col items-center justify-center min-w-0 min-h-0 rounded-md hover:bg-bg-hover transition-colors p-1 gap-1 ${tileAlertClasses(status?.status)}`}
      title={
        showStatus ? `${app.description || app.name} — right-click to check now` : app.description || app.name
      }
    >
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <Icon app={app} sizePortion="70%" />
      </div>
      {showName && (
        <div className="flex items-center gap-1 min-w-0 max-w-full">
          <span className="text-[10px] text-text-secondary truncate leading-tight">
            {app.name}
          </span>
          {showStatus && (
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${statusClasses(status?.status)}`}
            />
          )}
        </div>
      )}
      {!showName && showStatus && (
        <span
          className={`absolute top-1 right-1 inline-block w-1.5 h-1.5 rounded-full ${statusClasses(status?.status)}`}
        />
      )}
    </a>
  );
}

function AppsComponent({ config, w, h }: WidgetProps<AppsConfig>) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[] }>(["config"]);
  const allApps = cfg?.apps ?? [];

  // Resolve selected IDs to actual apps, preserving the user's chosen order.
  // Empty selection = nothing (the widget asks you to pick).
  //
  // Legacy fallback: if appIds is undefined but the old `groups` filter is
  // present, derive appIds from those groups. Lets v0.1 layouts keep working
  // without manual reconfiguration.
  const legacyGroups = (config as AppsConfig & { groups?: string[] })?.groups;
  const ids = useMemo(() => {
    if (config?.appIds) return config.appIds;
    if (legacyGroups && legacyGroups.length > 0) {
      const set = new Set(legacyGroups);
      return allApps.filter((a) => a.group && set.has(a.group)).map((a) => a.id);
    }
    return [];
  }, [config?.appIds, legacyGroups, allApps]);
  const apps = useMemo(() => {
    const byId = new Map(allApps.map((a) => [a.id, a] as const));
    return ids.map((id) => byId.get(id)).filter(Boolean) as AppDef[];
  }, [allApps, ids]);

  const showNames = config?.showNames ?? false;
  const anyHealth = apps.some((a) => a.health && a.health.type !== "none");

  // Right-click "check now": force an immediate health check, then re-poll
  // shortly after so the dot updates without waiting for the 15s interval.
  const checkNow = (id: string) => {
    api
      .forceCheck(id)
      .then(() => setTimeout(() => qc.invalidateQueries({ queryKey: ["apps-status"] }), 800))
      .catch(() => {});
  };
  const { data: statuses = {} } = useQuery({
    queryKey: ["apps-status"],
    queryFn: api.getStatus,
    refetchInterval: 15_000,
    enabled: anyHealth,
  });

  if (allApps.length === 0) {
    return (
      <EmptyMessage
        title="No services defined"
        hint="Add some via the Manage services button or directly in config.yaml."
      />
    );
  }

  if (apps.length === 0) {
    return (
      <EmptyMessage
        title="No services picked"
        hint="Open this widget's config and choose which services it should show."
      />
    );
  }

  // Single → big centered tile
  if (apps.length === 1) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-full h-full max-w-full max-h-full">
          <Tile
            app={apps[0]}
            status={statuses[apps[0].id]}
            showName={showNames || w * h >= 2}
            onCheck={() => checkNow(apps[0].id)}
            sameTab={config?.openSameTab}
          />
        </div>
      </div>
    );
  }

  // Grid: 1 icon per grid unit each direction. Icons stay readable;
  // resize the widget bigger to fit more apps, or split into multiple
  // Apps widgets. Excess tiles are clipped — no scrollbar.
  const cols = Math.max(1, w);
  const rows = Math.max(1, h);
  const maxSlots = cols * rows;
  const visible = apps.slice(0, maxSlots);

  return (
    <div
      className="grid w-full h-full p-1 gap-0.5"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {visible.map((app) => (
        <Tile
          key={app.id}
          app={app}
          status={statuses[app.id]}
          showName={showNames}
          onCheck={() => checkNow(app.id)}
          sameTab={config?.openSameTab}
        />
      ))}
    </div>
  );
}

function EmptyMessage({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-muted/60 gap-1.5 p-2 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <span className="text-[11px] font-medium text-text-secondary">{title}</span>
      <span className="text-[10px] text-text-muted/70 max-w-[200px] leading-snug">{hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config panel
// ---------------------------------------------------------------------------

function AppsConfigPanel({ config, save }: WidgetConfigProps<AppsConfig>) {
  const qc = useQueryClient();
  const cfg = qc.getQueryData<{ apps?: AppDef[]; groups?: GroupDef[] }>(["config"]);
  const apps = cfg?.apps ?? [];
  const groups = cfg?.groups ?? [];

  // Group apps by category for the picker.
  const grouped = useMemo(() => {
    const byGroup = new Map<string | null, AppDef[]>();
    for (const a of apps) {
      const k = a.group || null;
      const arr = byGroup.get(k) ?? [];
      arr.push(a);
      byGroup.set(k, arr);
    }
    const out: { group?: GroupDef; apps: AppDef[] }[] = [];
    for (const g of groups) {
      const arr = byGroup.get(g.id);
      if (arr && arr.length > 0) out.push({ group: g, apps: arr });
    }
    const ungrouped = byGroup.get(null);
    if (ungrouped && ungrouped.length > 0) out.push({ apps: ungrouped });
    return out;
  }, [apps, groups]);

  const selected = new Set(config?.appIds ?? []);

  const toggle = (id: string) => {
    const cur = config?.appIds ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    save({ appIds: next });
  };

  const pickAll = (groupId: string | undefined) => {
    const cur = config?.appIds ?? [];
    const inGroup = apps.filter((a) => (a.group || null) === (groupId ?? null));
    const allSelected = inGroup.every((a) => cur.includes(a.id));
    if (allSelected) {
      // Deselect this group.
      save({ appIds: cur.filter((id) => !inGroup.some((a) => a.id === id)) });
    } else {
      // Select all from this group, preserving existing.
      const set = new Set(cur);
      for (const a of inGroup) set.add(a.id);
      save({ appIds: Array.from(set) });
    }
  };

  const clearAll = () => save({ appIds: [] });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
            Services in this widget
          </label>
          <span className="text-[10px] text-text-muted">
            {(config?.appIds ?? []).length} selected
          </span>
        </div>

        {grouped.length === 0 ? (
          <div className="text-[11px] text-text-muted italic">
            No services defined. Use Manage services below.
          </div>
        ) : (
          <div className="max-h-[280px] overflow-auto rounded border border-border-subtle bg-bg-card/40">
            {grouped.map((section, i) => (
              <div key={section.group?.id ?? `__none_${i}`} className="border-b border-border-subtle last:border-b-0">
                <button
                  onClick={() => pickAll(section.group?.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-bg-hover text-left"
                  title="Toggle all in group"
                >
                  {section.group?.color && (
                    <span
                      className="inline-block w-1 h-3 rounded-sm shrink-0"
                      style={{ background: section.group.color }}
                    />
                  )}
                  <span className="text-[10px] uppercase tracking-[0.08em] text-text-secondary font-semibold flex-1 truncate">
                    {section.group?.name ?? "Ungrouped"}
                  </span>
                  <span className="text-[10px] text-text-muted/60 tabular-nums">
                    {section.apps.filter((a) => selected.has(a.id)).length}/{section.apps.length}
                  </span>
                </button>
                {section.apps.map((app) => {
                  const isSel = selected.has(app.id);
                  return (
                    <label
                      key={app.id}
                      className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-bg-hover"
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(app.id)}
                        className="accent-accent"
                      />
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        {app.icon ? (
                          <SimpleIcon slug={app.icon} fill />
                        ) : (
                          <div
                            className="w-full h-full rounded-sm flex items-center justify-center text-[8px] font-semibold text-text"
                            style={{ background: hashColor(app.name) }}
                          >
                            {initials(app.name)}
                          </div>
                        )}
                      </div>
                      <span className="text-[12px] text-text-secondary truncate flex-1">
                        {app.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {(config?.appIds ?? []).length > 0 && (
          <button
            onClick={clearAll}
            className="text-[10px] text-text-muted hover:text-text-secondary"
          >
            Clear selection
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={config?.showNames ?? false}
            onChange={(e) => save({ showNames: e.target.checked })}
            className="accent-accent"
          />
          Show names under icons
        </label>
        <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={config?.openSameTab ?? false}
            onChange={(e) => save({ openSameTab: e.target.checked })}
            className="accent-accent"
          />
          Open links in the same tab
        </label>
      </div>

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

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

const AppsIcon = (
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

const def: WidgetDefinition<AppsConfig> = {
  type: "apps",
  title: "Apps grid",
  icon: AppsIcon,
  category: "infrastructure",
  description: "Grid of hand-picked services. 2 icons per grid unit, like Shortcuts.",
  minW: 1,
  minH: 1,
  maxW: 24,
  maxH: 24,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: { appIds: [] },
  Component: AppsComponent,
  ConfigPanel: AppsConfigPanel,
};

export default def;
