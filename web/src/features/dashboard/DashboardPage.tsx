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

export function DashboardPage() {
  const qc = useQueryClient();
  const { dashboards } = useDashboards();

  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [configPos, setConfigPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
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
      const widgetConfigs: Record<string, AnyWidgetConfig> = {
        ...(current.widgetConfigs ?? {}),
      };
      for (const w of l.widgets) {
        if (w.config && Object.keys(w.config).length > 0) {
          widgetConfigs[w.i] = w.config;
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
      // No-op: widgets are sourced from config.yaml; removing is a YAML edit.
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
    if (!def?.ConfigPanel) return [];
    return [
      {
        label: "Configure",
        onClick: () => {
          setConfigPos({
            x: Math.min(contextMenu.x, window.innerWidth - 360),
            y: Math.min(contextMenu.y, window.innerHeight - 500),
          });
          setConfigId(contextMenu.widgetId);
        },
      },
    ];
  })();

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
      />

      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {editing && cell > 0 && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
              `,
              backgroundSize: `${cell + gap}px ${cell + gap}px`,
              backgroundPosition: `${gap}px ${gap}px`,
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
            style={{ height: containerH }}
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
                  <div className="w-full h-full overflow-hidden">
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
