import { useState, useCallback, useRef, useEffect, useMemo } from "react";
// IMPORTANT: import from "react-grid-layout/legacy", NOT "react-grid-layout".
// The default v2 export silently ignores compactType / preventCollision /
// isDraggable / draggableHandle and gravity-snaps widgets to the top.
// /legacy keeps the v1 API.
import RGL from "react-grid-layout/legacy";
const ReactGridLayout = RGL as unknown as React.ComponentType<any>;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardTabBar } from "./DashboardTabBar";
import { useDashboards } from "./useDashboards";
import { useDashboardHistory } from "./useDashboardHistory";
import { useDashboardShortcuts } from "./useDashboardShortcuts";
import { createEmptyLayout } from "./layoutMigrations";
import { getWidgetDefinition } from "./widgets/registry";
import { downloadDashboardFile } from "./dashboardIO";
import { WidgetContextMenu } from "./WidgetContextMenu";
import { AddWidgetModal } from "./AddWidgetModal";
import { ServicesEditor } from "./widgets/apps/ServicesEditor";
import { Spotlight } from "./Spotlight";
import type {
  AnyWidgetConfig,
  DashboardLayout,
  GridItem,
  Widget,
  WidgetDefinition,
} from "./widgets/types";
import "react-grid-layout/css/styles.css";

interface ContextMenuState {
  widgetId: string;
  x: number;
  y: number;
}

interface ServerWidget {
  i: string;
  type: string;
  title: string;
  config?: AnyWidgetConfig;
}

interface ServerDashboard {
  id: string;
  name: string;
  default?: boolean;
  widgets?: ServerWidget[];
}

interface ConfigPayload {
  dashboards?: ServerDashboard[];
}

interface StatePayload {
  layouts?: Record<string, GridItem[]>;
  widgetConfigs?: Record<string, AnyWidgetConfig>;
  lastActive?: string;
}

// Return only the keys of `merged` whose value differs from `base`. Used to
// persist widget-config OVERRIDES into state.yaml as a delta against the
// config.yaml base. Persisting the full merged config (the old behavior) meant
// that after the first drag/resize, every widget's entire config was copied
// into state.yaml and — because state overrides win in the merge — later
// hand-edits to config.yaml were silently masked. A delta only shadows the
// keys the UI actually changed, so unshadowed keys keep flowing from config.yaml.
function diffConfig(
  merged: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(merged)) {
    if (JSON.stringify(merged[k]) !== JSON.stringify(base[k])) out[k] = merged[k];
  }
  return out;
}

function assembleLayout(
  dash: ServerDashboard | undefined,
  state: StatePayload | undefined,
): DashboardLayout {
  if (!dash) return createEmptyLayout();
  const overrides = state?.widgetConfigs ?? {};
  const widgets: Widget[] = (dash.widgets ?? []).map((w) => ({
    i: w.i,
    type: w.type as Widget["type"],
    title: w.title,
    config: { ...(w.config ?? {}), ...(overrides[w.i] ?? {}) },
  }));
  const stateLayouts = state?.layouts?.[dash.id] ?? [];
  // Backfill any widget without a layout entry into the first free row.
  const known = new Set(stateLayouts.map((l) => l.i));
  let nextY = stateLayouts.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  const items: GridItem[] = [...stateLayouts];
  for (const w of widgets) {
    if (!known.has(w.i)) {
      const def = getWidgetDefinition(w.type);
      items.push({
        i: w.i,
        x: 0,
        y: nextY,
        w: def?.defaultW ?? 3,
        h: def?.defaultH ?? 2,
      });
      nextY += def?.defaultH ?? 2;
    }
  }
  return {
    version: 1,
    widgets,
    layouts: { lg: items },
  };
}

interface DashboardPageProps {
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
}

export function DashboardPage({ theme, setTheme }: DashboardPageProps) {
  const qc = useQueryClient();
  const { dashboards } = useDashboards();

  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [configPos, setConfigPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [manageServicesOpen, setManageServicesOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  // Cmd/Ctrl+K opens the spotlight from anywhere on the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (!isCmdK) return;
      // Don't intercept when the user is typing in an input that's not the
      // spotlight itself — e.g. service editor URL field.
      const tgt = e.target as HTMLElement | null;
      const inInput =
        tgt &&
        (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);
      if (inInput) return;
      e.preventDefault();
      setSpotlightOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(1200);
  const [containerH, setContainerH] = useState(800);

  const { data: state } = useQuery({
    queryKey: ["state"],
    queryFn: async () => {
      const r = await fetch("/api/state");
      if (!r.ok) return {} as StatePayload;
      return (await r.json()) as StatePayload;
    },
  });

  useEffect(() => {
    if (activeDashboardId === null && dashboards.length > 0) {
      const last = state?.lastActive;
      const target =
        (last && dashboards.find((d) => d.id === last)) ||
        dashboards.find((d) => d.default) ||
        dashboards[0];
      setActiveDashboardId(target.id);
    }
  }, [dashboards, activeDashboardId, state?.lastActive]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setContainerW(rect.width);
      setContainerH(rect.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!editing) {
      setConfigId(null);
      setConfigPos(null);
      setContextMenu(null);
      setSelectedWidgetId(null);
    }
  }, [editing]);

  // 24-col grid. Cells track a precise (non-floored) column width so the
  // edit-mode grid overlay aligns with RGL's widget positions.
  // gap is the visible margin around every widget on all sides (RGL applies
  // it both between widgets and around the outer edge). Bumped from 6 so
  // widgets sit visibly inside their grid cells.
  const cols = 24;
  const gap = 12;
  const cell = (containerW - gap * (cols + 1)) / cols;

  const layoutQueryKey = ["dashboard-layout", activeDashboardId] as const;

  const { data: rawLayout } = useQuery({
    queryKey: layoutQueryKey,
    queryFn: () => {
      const cfg = qc.getQueryData<ConfigPayload>(["config"]);
      const dash = cfg?.dashboards?.find((d) => d.id === activeDashboardId);
      return assembleLayout(dash, state);
    },
    enabled: activeDashboardId !== null,
  });

  // Re-assemble on config/state change.
  useEffect(() => {
    if (activeDashboardId === null) return;
    const cfg = qc.getQueryData<ConfigPayload>(["config"]);
    const dash = cfg?.dashboards?.find((d) => d.id === activeDashboardId);
    qc.setQueryData(layoutQueryKey, assembleLayout(dash, state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, dashboards, activeDashboardId]);

  const layout: DashboardLayout = rawLayout ?? createEmptyLayout();

  const save = useMutation({
    mutationFn: async (l: DashboardLayout) => {
      if (activeDashboardId === null) return;
      const current = qc.getQueryData<StatePayload>(["state"]) ?? {};
      // Base configs come from config.yaml (the ["config"] query). We persist
      // only the delta of each widget's effective config against its base, so
      // state.yaml never masks config.yaml — see diffConfig().
      const cfg = qc.getQueryData<ConfigPayload>(["config"]);
      const dash = cfg?.dashboards?.find((d) => d.id === activeDashboardId);
      const baseConfigs: Record<string, Record<string, unknown>> = {};
      for (const bw of dash?.widgets ?? []) {
        baseConfigs[bw.i] = (bw.config ?? {}) as Record<string, unknown>;
      }
      const widgetConfigs: Record<string, AnyWidgetConfig> = {
        ...(current.widgetConfigs ?? {}),
      };
      for (const w of l.widgets) {
        const delta = diffConfig(
          (w.config ?? {}) as Record<string, unknown>,
          baseConfigs[w.i] ?? {},
        );
        if (Object.keys(delta).length > 0) {
          widgetConfigs[w.i] = delta as AnyWidgetConfig;
        } else {
          delete widgetConfigs[w.i];
        }
      }
      const next: StatePayload = {
        ...current,
        layouts: {
          ...(current.layouts ?? {}),
          [activeDashboardId]: l.layouts.lg,
        },
        widgetConfigs,
        lastActive: activeDashboardId,
      };
      qc.setQueryData(["state"], next);
      await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    },
  });

  const history = useDashboardHistory(layout);
  useEffect(() => {
    history.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashboardId]);

  const persistLocal = useCallback(
    (next: DashboardLayout) => {
      qc.setQueryData(layoutQueryKey, next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, activeDashboardId],
  );

  const persistRemote = useCallback(
    (next: DashboardLayout) => {
      qc.setQueryData(layoutQueryKey, next);
      save.mutate(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, save, activeDashboardId],
  );

  const persistWithHistory = useCallback(
    (next: DashboardLayout) => {
      history.pushSnapshot(layout);
      persistRemote(next);
    },
    [history, layout, persistRemote],
  );

  const dragStartLayoutRef = useRef<DashboardLayout | null>(null);

  // RGL's onDragStop / onResizeStop are called with the FINAL layout as the
  // first argument. Order of fire vs onLayoutChange is undefined across RGL
  // versions and /legacy mode, so don't rely on the cache being up-to-date
  // from a prior onLayoutChange — use what RGL hands us directly.
  const layoutRef = useRef<DashboardLayout>(layout);
  layoutRef.current = layout;

  const onLayoutChange = useCallback(
    (nl: GridItem[]) => {
      if (!editing) return;
      persistLocal({ ...layoutRef.current, layouts: { lg: nl } });
    },
    [persistLocal, editing],
  );

  const onDragStart = useCallback(() => {
    dragStartLayoutRef.current = layoutRef.current;
  }, []);

  const onDragStop = useCallback(
    (nl: GridItem[]) => {
      if (dragStartLayoutRef.current) {
        history.pushSnapshot(dragStartLayoutRef.current);
        dragStartLayoutRef.current = null;
      }
      persistRemote({ ...layoutRef.current, layouts: { lg: nl } });
    },
    [history, persistRemote],
  );

  const onResizeStart = useCallback(() => {
    dragStartLayoutRef.current = layoutRef.current;
  }, []);

  const onResizeStop = useCallback(
    (nl: GridItem[]) => {
      if (dragStartLayoutRef.current) {
        history.pushSnapshot(dragStartLayoutRef.current);
        dragStartLayoutRef.current = null;
      }
      persistRemote({ ...layoutRef.current, layouts: { lg: nl } });
    },
    [history, persistRemote],
  );

  const updateConfig = (id: string, patch: Partial<AnyWidgetConfig>) =>
    persistWithHistory({
      ...layout,
      widgets: layout.widgets.map((w) =>
        w.i === id ? { ...w, config: { ...w.config, ...patch } } : w,
      ),
    });

  const handleUndo = useCallback(() => {
    const restored = history.undo();
    if (restored) persistRemote(restored);
  }, [history, persistRemote]);

  const handleRedo = useCallback(() => {
    const restored = history.redo();
    if (restored) persistRemote(restored);
  }, [history, persistRemote]);

  const handleExport = () => {
    const dash = dashboards.find((d) => d.id === activeDashboardId);
    downloadDashboardFile(dash?.name ?? "dashboard", layout);
  };

  // ---- Dashboard CRUD (writes config.yaml — comments lost on save) ----
  const writeConfigAndRefresh = useCallback(
    async (mutate: (cfg: ConfigPayload) => ConfigPayload) => {
      const cur = qc.getQueryData<ConfigPayload>(["config"]);
      if (!cur) return;
      const next = mutate(cur);
      qc.setQueryData(["config"], next);
      try {
        await fetch("/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        qc.invalidateQueries({ queryKey: ["config"] });
      } catch (e) {
        // Roll back optimistic update on failure.
        qc.setQueryData(["config"], cur);
        // eslint-disable-next-line no-console
        console.error("Failed to write config:", e);
      }
    },
    [qc],
  );

  const handleAddDashboard = useCallback(() => {
    if (dashboards.length >= 5) {
      alert("Maximum 5 dashboards. Delete one before adding another.");
      return;
    }
    const name = window.prompt("New dashboard name:", "New dashboard");
    if (!name || !name.trim()) return;
    const id = `dash-${Date.now()}`;
    writeConfigAndRefresh((cfg) => ({
      ...cfg,
      dashboards: [
        ...(cfg.dashboards ?? []),
        { id, name: name.trim(), default: false, widgets: [] },
      ],
    }));
    setActiveDashboardId(id);
  }, [dashboards.length, writeConfigAndRefresh]);

  const handleRenameDashboard = useCallback(
    (id: string, name: string) => {
      if (!name.trim()) return;
      writeConfigAndRefresh((cfg) => ({
        ...cfg,
        dashboards: (cfg.dashboards ?? []).map((d) =>
          d.id === id ? { ...d, name: name.trim() } : d,
        ),
      }));
    },
    [writeConfigAndRefresh],
  );

  const handleDeleteDashboard = useCallback(
    (id: string) => {
      const dash = dashboards.find((d) => d.id === id);
      if (!dash) return;
      if (dashboards.length <= 1) {
        alert("Can't delete the last dashboard.");
        return;
      }
      if (!confirm(`Delete dashboard "${dash.name}"? Its layout will be discarded.`)) return;
      writeConfigAndRefresh((cfg) => ({
        ...cfg,
        dashboards: (cfg.dashboards ?? []).filter((d) => d.id !== id),
      }));
      if (activeDashboardId === id) {
        const remaining = dashboards.filter((d) => d.id !== id);
        setActiveDashboardId(remaining[0]?.id ?? null);
      }
    },
    [dashboards, activeDashboardId, writeConfigAndRefresh],
  );

  // Remove a widget entirely. Widget existence lives in config.yaml, so this
  // writes config (comments lost — same caveat as add). It also prunes the
  // widget's layout entry and any config override from state.yaml so no
  // orphaned rows linger. Not undoable via the layout history stack (that only
  // tracks state.yaml layouts, not config), so we gate it behind a confirm.
  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      if (!activeDashboardId) return;
      const widget = layout.widgets.find((w) => w.i === widgetId);
      const label = widget?.title || "this widget";
      if (!confirm(`Remove "${label}"? This can't be undone.`)) return;

      // 1. Drop the widget from config.yaml (source of truth for existence).
      writeConfigAndRefresh((cfg) => ({
        ...cfg,
        dashboards: (cfg.dashboards ?? []).map((d) =>
          d.id === activeDashboardId
            ? { ...d, widgets: (d.widgets ?? []).filter((w) => w.i !== widgetId) }
            : d,
        ),
      }));

      // 2. Prune the layout entry + config override from state.yaml.
      const current = qc.getQueryData<StatePayload>(["state"]) ?? {};
      const nextConfigs = { ...(current.widgetConfigs ?? {}) };
      delete nextConfigs[widgetId];
      const nextState: StatePayload = {
        ...current,
        layouts: {
          ...(current.layouts ?? {}),
          [activeDashboardId]: (current.layouts?.[activeDashboardId] ?? []).filter(
            (it) => it.i !== widgetId,
          ),
        },
        widgetConfigs: nextConfigs,
      };
      qc.setQueryData(["state"], nextState);
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextState),
        // eslint-disable-next-line no-console
      }).catch((e) => console.error("Failed to persist state after remove:", e));

      // 3. Clear any UI referencing the now-gone widget.
      setSelectedWidgetId(null);
      setConfigId(null);
      setContextMenu(null);
    },
    [activeDashboardId, layout.widgets, qc, writeConfigAndRefresh],
  );

  useDashboardShortcuts({
    editing,
    selectedWidgetId,
    toggleEdit: () => setEditing((e) => !e),
    onEscape: () => {
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      if (configId) {
        setConfigId(null);
        return;
      }
      if (editing) setEditing(false);
    },
    undo: handleUndo,
    redo: handleRedo,
    selectDashboard: (index) => {
      const target = dashboards[index];
      if (target) setActiveDashboardId(target.id);
    },
    removeWidget: () => {
      if (editing && selectedWidgetId) handleRemoveWidget(selectedWidgetId);
    },
  });

  const decoratedGridItems: GridItem[] = useMemo(
    () =>
      (layout.layouts.lg || []).map((it) => {
        const widget = layout.widgets.find((x) => x.i === it.i);
        const def = widget ? getWidgetDefinition(widget.type) : undefined;
        return {
          ...it,
          minW: def?.minW ?? 1,
          minH: def?.minH ?? 1,
          maxW: def?.maxW ?? 12,
          maxH: def?.maxH ?? 8,
          static: !editing,
        };
      }),
    [layout, editing],
  );

  const configWidget = configId ? layout.widgets.find((w) => w.i === configId) : null;
  const configDef = configWidget ? getWidgetDefinition(configWidget.type) : null;

  const openConfig = (id: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const panelW = 340;
    const x =
      window.innerWidth - rect.right > panelW + 20
        ? rect.right + 8
        : rect.left - panelW - 8;
    setConfigPos({
      x: Math.max(8, x),
      y: Math.max(8, Math.min(rect.top, window.innerHeight - 500)),
    });
    setConfigId(id);
  };

  const onWidgetContextMenu = (id: string, e: React.MouseEvent) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedWidgetId(id);
    setContextMenu({ widgetId: id, x: e.clientX, y: e.clientY });
  };

  const contextMenuItems = (() => {
    if (!contextMenu) return [];
    const widget = layout.widgets.find((w) => w.i === contextMenu.widgetId);
    if (!widget) return [];
    const def = getWidgetDefinition(widget.type);
    const items: {
      label: string;
      shortcut?: string;
      onClick: () => void;
      danger?: boolean;
      icon?: React.ReactNode;
    }[] = [];
    if (def?.ConfigPanel) {
      items.push({
        label: "Configure",
        onClick: () => {
          setConfigPos({
            x: Math.min(contextMenu.x, window.innerWidth - 360),
            y: Math.min(contextMenu.y, window.innerHeight - 500),
          });
          setConfigId(contextMenu.widgetId);
        },
      });
    }
    items.push({
      label: "Remove widget",
      shortcut: "Del",
      danger: true,
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      ),
      onClick: () => handleRemoveWidget(contextMenu.widgetId),
    });
    return items;
  })();

  // Total height the grid needs to show every widget — including any dragged
  // below the initial viewport. Previously the grid was clamped to the
  // container height (autoSize off, height=containerH) with no scroll, so a
  // widget placed lower with free placement was unreachable. We size the grid
  // (and the edit overlay) to the actual content and let the container scroll.
  // In edit mode a few rows of headroom give empty grid to drag into.
  const gridH = useMemo(() => {
    const maxRow = (layout.layouts.lg || []).reduce(
      (m, it) => Math.max(m, it.y + it.h),
      0,
    );
    const contentH = maxRow * (cell + gap) + gap;
    const headroom = editing ? 3 * (cell + gap) : 0;
    return Math.max(contentH + headroom, containerH);
  }, [layout.layouts, cell, gap, editing, containerH]);

  return (
    <div className="p-6 h-full flex flex-col min-h-0">
      <DashboardTabBar
        dashboards={dashboards.map((d) => ({
          id: d.id,
          name: d.name,
          is_default: !!d.default,
        }))}
        activeId={activeDashboardId}
        editing={editing}
        onSelect={(id) => setActiveDashboardId(id)}
        onToggleEdit={() => setEditing(!editing)}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExport={handleExport}
        onAddWidget={() => setAddWidgetOpen(true)}
        onManageServices={() => setManageServicesOpen(true)}
        onAddDashboard={handleAddDashboard}
        onRenameDashboard={handleRenameDashboard}
        onDeleteDashboard={handleDeleteDashboard}
        onOpenSpotlight={() => setSpotlightOpen(true)}
        theme={theme}
        setTheme={setTheme}
      />

      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden">
        {editing && cell > 0 && (
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
              // Span the full scrollable content height, not just the viewport
              // (an inset-0 overlay would stay pinned to the visible area).
              height: gridH,
              backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
              `,
              backgroundSize: `${cell + gap}px ${cell + gap}px`,
              // Offset by half-gap so lines fall in the middle of the gap
              // between widgets — widgets then sit centered inside each
              // visual grid cell, with equal margin on all four sides.
              backgroundPosition: `${gap / 2}px ${gap / 2}px`,
              backgroundRepeat: "repeat",
            }}
          />
        )}
        {cell > 0 && (
          <ReactGridLayout
            layout={decoratedGridItems}
            onLayoutChange={onLayoutChange}
            onDragStart={onDragStart}
            onDragStop={onDragStop}
            onResizeStart={onResizeStart}
            onResizeStop={onResizeStop}
            cols={cols}
            rowHeight={cell}
            margin={[gap, gap]}
            width={containerW}
            compactType={null}
            preventCollision
            autoSize={false}
            style={{ height: gridH }}
            isDraggable={editing}
            isResizable={editing}
            draggableHandle=".wdrag"
          >
            {layout.widgets.map((widget) => {
              const gi = decoratedGridItems.find((l) => l.i === widget.i);
              const w = gi?.w || 1;
              const h = gi?.h || 1;
              const def = getWidgetDefinition(widget.type);
              const selected = configId === widget.i || selectedWidgetId === widget.i;
              return (
                <div
                  key={widget.i}
                  onContextMenu={(e) => onWidgetContextMenu(widget.i, e)}
                  className={`group/w relative rounded-lg border bg-bg-card/80 backdrop-blur-sm overflow-hidden shadow-sm shadow-black/20 ${
                    selected
                      ? "border-accent ring-1 ring-accent/30"
                      : editing
                        ? "border-accent/20"
                        : "border-border-subtle"
                  }`}
                >
                  {editing && (
                    <WidgetHoverHeader
                      title={widget.title}
                      hasConfig={!!def?.ConfigPanel}
                      onConfig={(e) => openConfig(widget.i, e)}
                    />
                  )}
                  <div
                    className={`w-full h-full overflow-hidden ${
                      editing ? "pointer-events-none" : ""
                    }`}
                  >
                    <WidgetSurface
                      widget={widget}
                      def={def}
                      w={w}
                      h={h}
                      editing={editing}
                      save={(patch) => updateConfig(widget.i, patch)}
                    />
                  </div>
                </div>
              );
            })}
          </ReactGridLayout>
        )}
      </div>

      {editing && configWidget && configDef?.ConfigPanel && configPos && (
        <ConfigPanelHost
          title={configWidget.title}
          pos={configPos}
          onClose={() => setConfigId(null)}
        >
          <configDef.ConfigPanel
            config={configWidget.config ?? configDef.defaultConfig}
            save={(patch) => updateConfig(configWidget.i, patch)}
          />
        </ConfigPanelHost>
      )}

      {contextMenu && (
        <WidgetContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      <AddWidgetModal
        open={addWidgetOpen}
        dashboardId={activeDashboardId}
        onClose={() => setAddWidgetOpen(false)}
      />
      <ServicesEditor
        open={manageServicesOpen}
        onClose={() => setManageServicesOpen(false)}
      />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}

function WidgetSurface({
  widget,
  def,
  w,
  h,
  editing,
  save,
}: {
  widget: Widget;
  def?: WidgetDefinition<any>;
  w: number;
  h: number;
  editing: boolean;
  save: (patch: Partial<AnyWidgetConfig>) => void;
}) {
  if (!def) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-[11px] px-2 text-center">
        Unknown widget type: <span className="font-mono ml-1">{widget.type}</span>
      </div>
    );
  }
  const Component = def.Component;
  return (
    <Component
      config={widget.config ?? def.defaultConfig}
      w={w}
      h={h}
      editing={editing}
      save={save}
    />
  );
}

function WidgetHoverHeader({
  title,
  hasConfig,
  onConfig,
}: {
  title: string;
  hasConfig: boolean;
  onConfig: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="wdrag absolute top-0 inset-x-0 h-6 z-[100] opacity-0 group-hover/w:opacity-100 transition-opacity flex items-center justify-between px-1.5 bg-bg-elevated/90 backdrop-blur-sm border-b border-border cursor-grab active:cursor-grabbing">
      <div className="flex items-center gap-1.5 min-w-0">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5 text-text-muted shrink-0">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
        <span className="text-[10px] text-text-muted select-none truncate">{title}</span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {hasConfig && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfig(e);
            }}
            className="w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-indigo-400/10"
            title="Configure"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function ConfigPanelHost({
  title,
  pos,
  onClose,
  children,
}: {
  title: string;
  pos: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed z-50 w-[340px] bg-bg-elevated/95 backdrop-blur-md border border-border rounded-lg shadow-2xl shadow-black/40 ring-1 ring-white/5"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
            Configure
          </span>
          <span className="text-text-muted/40">·</span>
          <span className="text-[12px] font-medium text-text truncate">{title}</span>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text w-5 h-5 flex items-center justify-center"
          title="Close"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="p-3.5 max-h-[60vh] overflow-auto">{children}</div>
    </div>
  );
}
