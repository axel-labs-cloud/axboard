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
import { useConfig } from "../../hooks/useConfig";
import { useDashboardHistory } from "./useDashboardHistory";
import { useDashboardShortcuts } from "./useDashboardShortcuts";
import { createEmptyLayout } from "./layoutMigrations";
import { getWidgetDefinition } from "./widgets/registry";
import { buildExportFile, downloadDashboardFile, parseDashboardFile, readFileAsText } from "./dashboardIO";
import { api } from "../../api/client";
import { useDownAlerts } from "../../hooks/useDownAlerts";
import { WidgetContextMenu } from "./WidgetContextMenu";
import { AddWidgetModal } from "./AddWidgetModal";
import { ServicesEditor } from "./widgets/apps/ServicesEditor";
import { Spotlight, type SpotlightAction } from "./Spotlight";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { THEMES } from "../../hooks/themes";
import { ConfigEditorModal } from "./ConfigEditorModal";
import { TemplatePickerModal } from "./TemplatePickerModal";
import type { DashboardTemplate } from "./templates";
import type { AlertsDef, BackgroundDef, HeaderDef } from "../../api/types";
import { backgroundLayerStyle } from "./appearance";
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
  accent?: string;
  background?: BackgroundDef;
  widgets?: ServerWidget[];
}

interface ServerTopBar {
  barStyle?: string;
  header?: HeaderDef;
}

interface ConfigPayload {
  topBar?: ServerTopBar;
  dashboards?: ServerDashboard[];
  alerts?: AlertsDef;
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
  theme: string;
  setTheme: (t: string) => void;
}

// URL slug for a dashboard name (e.g. "Dev Ops" → "dev-ops").
function dashSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
// The current path as a slug (empty for the base "/").
function urlSlug(): string {
  return decodeURIComponent(window.location.pathname.replace(/^\/+|\/+$/g, "")).toLowerCase();
}

export function DashboardPage({ theme, setTheme }: DashboardPageProps) {
  const qc = useQueryClient();
  const { dashboards } = useDashboards();
  const { data: fullConfig } = useConfig();

  // Kiosk mode — hide all chrome and lock to view mode, for a wall display.
  // Toggleable from the menu; also honored via the ?kiosk=1 URL param.
  const [kiosk, setKiosk] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("kiosk"),
  );

  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Keep the URL in sync so a kiosk view survives reload / can be bookmarked,
  // and let Escape leave kiosk mode.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (kiosk) url.searchParams.set("kiosk", "1");
    else url.searchParams.delete("kiosk");
    window.history.replaceState({}, "", url);
    if (!kiosk) return;
    setEditing(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKiosk(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kiosk]);
  const [configId, setConfigId] = useState<string | null>(null);
  const [configPos, setConfigPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [deletedStash, setDeletedStash] = useState<{
    widget: Widget;
    item?: GridItem;
    dashboardId: string;
  } | null>(null);
  const deletedTimer = useRef<number | null>(null);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [manageServicesOpen, setManageServicesOpen] = useState(false);
  const [servicesTab, setServicesTab] = useState<"services" | "alerts" | "status">("services");
  const openServices = useCallback((tab: "services" | "alerts" | "status" = "services") => {
    setServicesTab(tab);
    setManageServicesOpen(true);
  }, []);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [configEditorOpen, setConfigEditorOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("axboard-alerts") === "1",
  );
  useDownAlerts(alertsEnabled);

  // Board density is remembered per theme — each look keeps its own spacing.
  const [densityMap, setDensityMap] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("axboard-density-map") || "{}");
    } catch {
      return {};
    }
  });
  const legacyDensity =
    (typeof window !== "undefined" && window.localStorage.getItem("axboard-density")) || "cozy";
  const density = densityMap[theme] || legacyDensity;
  const setDensity = useCallback(
    (d: string) => {
      setDensityMap((m) => {
        const next = { ...m, [theme]: d };
        try {
          window.localStorage.setItem("axboard-density-map", JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [theme],
  );

  const toggleAlerts = useCallback(async () => {
    if (!alertsEnabled) {
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        if (p !== "granted") return;
      }
      setAlertsEnabled(true);
      window.localStorage.setItem("axboard-alerts", "1");
    } else {
      setAlertsEnabled(false);
      window.localStorage.setItem("axboard-alerts", "0");
    }
  }, [alertsEnabled]);

  // Cmd/Ctrl+K opens the spotlight; `?` opens the shortcuts cheat sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const inInput =
        tgt &&
        (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);
      if (inInput) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSpotlightOpen(true);
      } else if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
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

  // Initial selection: the URL path wins (so /dev opens the "Dev" dashboard),
  // then the last-active, then the default. The base dashboard lives at "/".
  useEffect(() => {
    if (activeDashboardId === null && dashboards.length > 0) {
      const path = urlSlug();
      const byUrl = path ? dashboards.find((d) => dashSlug(d.name) === path || d.id === path) : null;
      const last = state?.lastActive;
      const target =
        byUrl ||
        (last && dashboards.find((d) => d.id === last)) ||
        dashboards.find((d) => d.default) ||
        dashboards[0];
      setActiveDashboardId(target.id);
    }
  }, [dashboards, activeDashboardId, state?.lastActive]);

  // Keep the URL in sync with the active dashboard (default → "/", others →
  // "/<slug>"), and re-select on browser back/forward or manual URL edits.
  useEffect(() => {
    if (!activeDashboardId || dashboards.length === 0) return;
    const dash = dashboards.find((d) => d.id === activeDashboardId);
    if (!dash) return;
    const target = dash.default ? "/" : `/${dashSlug(dash.name)}`;
    if (window.location.pathname !== target) window.history.replaceState(null, "", target);
  }, [activeDashboardId, dashboards]);

  useEffect(() => {
    const onPop = () => {
      const path = urlSlug();
      const d = path
        ? dashboards.find((x) => dashSlug(x.name) === path || x.id === path)
        : dashboards.find((x) => x.default) || dashboards[0];
      if (d) setActiveDashboardId(d.id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dashboards]);

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
  // Board density controls the inter-widget gap (and page padding below).
  const gap = density === "compact" ? 6 : density === "spacious" ? 20 : 12;
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

  const [copiedShare, setCopiedShare] = useState(false);
  const handleCopyDashboard = useCallback(async () => {
    const dash = dashboards.find((d) => d.id === activeDashboardId);
    const json = JSON.stringify(buildExportFile(dash?.name ?? "dashboard", layout), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      // Clipboard blocked (non-secure context) — fall back to a download.
      downloadDashboardFile(dash?.name ?? "dashboard", layout);
    }
  }, [dashboards, activeDashboardId, layout]);

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

  // Appearance edits fire rapidly (sliders, color pickers). Instead of a PUT +
  // full ["config"] invalidation per change (which refetches and re-renders the
  // whole grid — janky), we update the cache instantly and debounce the PUT,
  // and skip invalidation entirely (the optimistic cache is authoritative).
  const putTimer = useRef<number | null>(null);
  const writeConfigDebounced = useCallback(
    (mutate: (cfg: ConfigPayload) => ConfigPayload) => {
      const cur = qc.getQueryData<ConfigPayload>(["config"]);
      if (!cur) return;
      qc.setQueryData(["config"], mutate(cur));
      if (putTimer.current) clearTimeout(putTimer.current);
      putTimer.current = window.setTimeout(() => {
        putTimer.current = null;
        const body = qc.getQueryData<ConfigPayload>(["config"]);
        if (!body) return;
        fetch("/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => qc.invalidateQueries({ queryKey: ["config"] }));
      }, 350);
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

  // Set (or clear, with "") the active dashboard's accent color.
  const handleSetAccent = useCallback(
    (color: string) => {
      if (!activeDashboardId) return;
      writeConfigAndRefresh((cfg) => ({
        ...cfg,
        dashboards: (cfg.dashboards ?? []).map((d) =>
          d.id === activeDashboardId ? { ...d, accent: color || undefined } : d,
        ),
      }));
    },
    [activeDashboardId, writeConfigAndRefresh],
  );

  // Patch appearance fields on the active dashboard (background / bar style /
  // header widgets) through the same config write-path the accent picker uses.
  const patchActiveDashboard = useCallback(
    (patch: Partial<ServerDashboard>) => {
      if (!activeDashboardId) return;
      writeConfigDebounced((cfg) => ({
        ...cfg,
        dashboards: (cfg.dashboards ?? []).map((d) =>
          d.id === activeDashboardId ? { ...d, ...patch } : d,
        ),
      }));
    },
    [activeDashboardId, writeConfigDebounced],
  );
  const handleSetBackground = useCallback(
    (bg: BackgroundDef | undefined) => patchActiveDashboard({ background: bg }),
    [patchActiveDashboard],
  );
  // Top bar is global: patch cfg.topBar (not the active dashboard).
  const patchTopBar = useCallback(
    (patch: Partial<ServerTopBar>) =>
      writeConfigDebounced((cfg) => ({ ...cfg, topBar: { ...(cfg.topBar ?? {}), ...patch } })),
    [writeConfigDebounced],
  );
  const handleSetBarStyle = useCallback(
    (style: string) => patchTopBar({ barStyle: style || undefined }),
    [patchTopBar],
  );
  const handleSetHeader = useCallback(
    (header: HeaderDef | undefined) => patchTopBar({ header }),
    [patchTopBar],
  );

  // Reorder dashboards (drag a tab onto another): move `fromId` to `toId`'s slot.
  const handleReorderDashboards = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      writeConfigAndRefresh((cfg) => {
        const list = [...(cfg.dashboards ?? [])];
        const from = list.findIndex((d) => d.id === fromId);
        const to = list.findIndex((d) => d.id === toId);
        if (from < 0 || to < 0) return cfg;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        return { ...cfg, dashboards: list };
      });
    },
    [writeConfigAndRefresh],
  );

  // Import a .axboard.json file as a NEW dashboard (non-destructive — never
  // overwrites an existing one). Widget ids are regenerated so an import can't
  // collide with widgets already on other dashboards. Writes config.yaml
  // (widgets) + state.yaml (layout).
  const handleImportFile = useCallback(
    async (file: File) => {
      let parsed;
      try {
        parsed = parseDashboardFile(await readFileAsText(file));
      } catch (e) {
        alert(`Import failed: ${(e as Error).message}`);
        return;
      }
      if (dashboards.length >= 5) {
        alert("Maximum 5 dashboards. Delete one before importing.");
        return;
      }
      const id = `dash-${Date.now()}`;
      const idMap = new Map<string, string>();
      parsed.layout.widgets.forEach((w, i) => idMap.set(w.i, `w-${Date.now()}-${i}`));
      const widgets = parsed.layout.widgets.map((w) => ({
        i: idMap.get(w.i) as string,
        type: w.type,
        title: w.title,
        config: (w.config ?? {}) as AnyWidgetConfig,
      }));
      const layoutItems = (parsed.layout.layouts.lg ?? []).map((it) => ({
        ...it,
        i: idMap.get(it.i) ?? it.i,
      }));

      // 1. config.yaml — append the new dashboard with its widgets.
      writeConfigAndRefresh((cfg) => ({
        ...cfg,
        dashboards: [
          ...(cfg.dashboards ?? []),
          { id, name: parsed.name, default: false, widgets },
        ],
      }));

      // 2. state.yaml — seed the layout for the new dashboard.
      const current = qc.getQueryData<StatePayload>(["state"]) ?? {};
      const nextState: StatePayload = {
        ...current,
        layouts: { ...(current.layouts ?? {}), [id]: layoutItems },
      };
      qc.setQueryData(["state"], nextState);
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextState),
        // eslint-disable-next-line no-console
      }).catch((e) => console.error("Failed to persist state after import:", e));

      setActiveDashboardId(id);
    },
    [dashboards.length, qc, writeConfigAndRefresh],
  );

  // Full backup: download config.yaml + state.yaml as one JSON file.
  const handleBackup = useCallback(async () => {
    const [cfg, st] = await Promise.all([api.getConfig(), api.getState()]);
    const payload = { format: "axboard-backup", version: 1, config: cfg, state: st };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `axboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, []);

  // Full restore: replace everything (config + state) from a backup file.
  const handleRestoreFile = useCallback(
    async (file: File) => {
      let parsed: { format?: string; config?: unknown; state?: unknown };
      try {
        parsed = JSON.parse(await readFileAsText(file));
      } catch {
        alert("Not a valid JSON file.");
        return;
      }
      if (!parsed || parsed.format !== "axboard-backup" || !parsed.config) {
        alert("This is not an axboard backup file.");
        return;
      }
      if (
        !confirm(
          "Restore this backup? It REPLACES all current dashboards, widgets, apps, groups, and layouts.",
        )
      )
        return;
      try {
        await api.putConfig(parsed.config as never);
        if (parsed.state) await api.putState(parsed.state as never);
      } catch (e) {
        alert(`Restore failed: ${(e as Error).message}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ["config"] });
      qc.invalidateQueries({ queryKey: ["state"] });
    },
    [qc],
  );

  // Create a new dashboard from a built-in template (fresh widget ids).
  const handleCreateFromTemplate = useCallback(
    (tpl: DashboardTemplate) => {
      if (dashboards.length >= 5) return;
      const id = `dash-${Date.now()}`;
      const widgets = tpl.widgets.map((w, i) => ({
        i: `w-${Date.now()}-${i}`,
        type: w.type,
        title: w.title,
        config: (w.config ?? {}) as AnyWidgetConfig,
      }));
      const layoutItems: GridItem[] = tpl.widgets.map((w, i) => ({
        i: widgets[i].i,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
      }));
      writeConfigAndRefresh((cfg) => ({
        ...cfg,
        dashboards: [...(cfg.dashboards ?? []), { id, name: tpl.name, default: false, widgets }],
      }));
      const current = qc.getQueryData<StatePayload>(["state"]) ?? {};
      const next: StatePayload = {
        ...current,
        layouts: { ...(current.layouts ?? {}), [id]: layoutItems },
      };
      qc.setQueryData(["state"], next);
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        // eslint-disable-next-line no-console
      }).catch((e) => console.error("Failed to persist state after template:", e));
      setActiveDashboardId(id);
      setTemplatePickerOpen(false);
    },
    [dashboards.length, qc, writeConfigAndRefresh],
  );

  // Helper: persist a state object to state.yaml + cache.
  const persistState = useCallback(
    (next: StatePayload) => {
      qc.setQueryData(["state"], next);
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        // eslint-disable-next-line no-console
      }).catch((e) => console.error("Failed to persist state:", e));
    },
    [qc],
  );

  // Duplicate a widget onto the same dashboard (offset one row down).
  const handleDuplicateWidget = useCallback(
    (widgetId: string) => {
      if (!activeDashboardId) return;
      const src = layout.widgets.find((w) => w.i === widgetId);
      if (!src) return;
      const newId = `w-${Date.now()}`;
      writeConfigAndRefresh((cfg) => ({
        ...cfg,
        dashboards: (cfg.dashboards ?? []).map((d) =>
          d.id === activeDashboardId
            ? {
                ...d,
                widgets: [
                  ...(d.widgets ?? []),
                  { i: newId, type: src.type, title: src.title, config: (src.config ?? {}) as AnyWidgetConfig },
                ],
              }
            : d,
        ),
      }));
      const srcItem = layout.layouts.lg.find((l) => l.i === widgetId);
      const newItem: GridItem = srcItem
        ? { ...srcItem, i: newId, y: srcItem.y + srcItem.h }
        : { i: newId, x: 0, y: 0, w: 3, h: 2 };
      const current = qc.getQueryData<StatePayload>(["state"]) ?? {};
      persistState({
        ...current,
        layouts: {
          ...(current.layouts ?? {}),
          [activeDashboardId]: [...(current.layouts?.[activeDashboardId] ?? []), newItem],
        },
      });
      setContextMenu(null);
    },
    [activeDashboardId, layout, qc, writeConfigAndRefresh, persistState],
  );

  // Remove a widget. Widget existence lives in config.yaml, so this writes
  // config and prunes the state.yaml layout entry + override. It stashes the
  // removed widget for an 8-second undo window (a toast), so no confirm dialog.
  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      if (!activeDashboardId) return;
      const widget = layout.widgets.find((w) => w.i === widgetId);
      if (!widget) return;
      const current = qc.getQueryData<StatePayload>(["state"]) ?? {};
      const item =
        (current.layouts?.[activeDashboardId] ?? []).find((it) => it.i === widgetId) ??
        layout.layouts.lg.find((it) => it.i === widgetId);

      // Stash for undo (widget carries its effective config).
      setDeletedStash({ widget, item, dashboardId: activeDashboardId });
      if (deletedTimer.current) window.clearTimeout(deletedTimer.current);
      deletedTimer.current = window.setTimeout(() => setDeletedStash(null), 8000);

      writeConfigAndRefresh((cfg) => ({
        ...cfg,
        dashboards: (cfg.dashboards ?? []).map((d) =>
          d.id === activeDashboardId
            ? { ...d, widgets: (d.widgets ?? []).filter((w) => w.i !== widgetId) }
            : d,
        ),
      }));

      const nextConfigs = { ...(current.widgetConfigs ?? {}) };
      delete nextConfigs[widgetId];
      persistState({
        ...current,
        layouts: {
          ...(current.layouts ?? {}),
          [activeDashboardId]: (current.layouts?.[activeDashboardId] ?? []).filter(
            (it) => it.i !== widgetId,
          ),
        },
        widgetConfigs: nextConfigs,
      });

      setSelectedWidgetId(null);
      setConfigId(null);
      setContextMenu(null);
    },
    [activeDashboardId, layout, qc, writeConfigAndRefresh, persistState],
  );

  // Undo the last widget removal within the toast window.
  const handleUndoDelete = useCallback(() => {
    const stash = deletedStash;
    if (!stash) return;
    setDeletedStash(null);
    if (deletedTimer.current) window.clearTimeout(deletedTimer.current);
    writeConfigAndRefresh((cfg) => ({
      ...cfg,
      dashboards: (cfg.dashboards ?? []).map((d) =>
        d.id === stash.dashboardId
          ? {
              ...d,
              widgets: [
                ...(d.widgets ?? []),
                {
                  i: stash.widget.i,
                  type: stash.widget.type,
                  title: stash.widget.title,
                  config: (stash.widget.config ?? {}) as AnyWidgetConfig,
                },
              ],
            }
          : d,
      ),
    }));
    const current = qc.getQueryData<StatePayload>(["state"]) ?? {};
    const arr = [...(current.layouts?.[stash.dashboardId] ?? [])];
    if (stash.item && !arr.some((it) => it.i === stash.widget.i)) arr.push(stash.item);
    persistState({
      ...current,
      layouts: { ...(current.layouts ?? {}), [stash.dashboardId]: arr },
    });
  }, [deletedStash, qc, writeConfigAndRefresh, persistState]);

  useDashboardShortcuts({
    editing,
    selectedWidgetId,
    toggleEdit: () => {
      if (!kiosk) setEditing((e) => !e);
    },
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
      label: "Duplicate",
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
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      ),
      onClick: () => handleDuplicateWidget(contextMenu.widgetId),
    });
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
    // The bottom-most widget ends at maxRow*(cell+gap). Don't add a trailing
    // gap in view mode — it would push a board that fills the viewport exactly
    // just over, spawning a phantom scrollbar. Edit mode keeps drag headroom.
    const contentH = maxRow * (cell + gap);
    const headroom = editing ? 3 * (cell + gap) + gap : 0;
    return Math.max(contentH + headroom, containerH);
  }, [layout.layouts, cell, gap, editing, containerH]);

  // Below ~900px the 24-col drag grid gets too cramped to use, so fall back to
  // a read-only responsive stack: one column on phones, two on small tablets.
  // Desktop keeps the full editable grid. Empty dashboards get a prompt.
  const isStacked = containerW > 0 && containerW < 900;
  const stackColumns = containerW < 560 ? 1 : 2;
  const isEmpty = layout.widgets.length === 0;
  const activeDash = dashboards.find((d) => d.id === activeDashboardId);
  const activeAccent = activeDash?.accent;
  const activeBackground = activeDash?.background;
  // Top bar (style + header) is global — shared across all dashboards.
  const activeBarStyle = fullConfig?.topBar?.barStyle;
  const activeHeader = fullConfig?.topBar?.header;

  // Apply the active dashboard's accent to the document root so it overrides
  // the theme's --color-accent everywhere — including portalled UI (drawer,
  // modals, spotlight), which the page-root style wouldn't reach.
  useEffect(() => {
    const root = document.documentElement;
    if (activeAccent) root.style.setProperty("--color-accent", activeAccent);
    else root.style.removeProperty("--color-accent");
  }, [activeAccent]);

  // Arrow keys nudge the selected widget by one grid cell in edit mode.
  useEffect(() => {
    if (!editing) return;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const onKey = (e: KeyboardEvent) => {
      if (!selectedWidgetId) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      const d = deltas[e.key];
      if (!d) return;
      e.preventDefault();
      const items = (layoutRef.current.layouts.lg || []).map((it) =>
        it.i === selectedWidgetId
          ? {
              ...it,
              x: Math.max(0, Math.min(cols - it.w, it.x + d[0])),
              y: Math.max(0, it.y + d[1]),
            }
          : it,
      );
      persistWithHistory({ ...layoutRef.current, layouts: { lg: items } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, selectedWidgetId, persistWithHistory, cols]);

  // Commands surfaced in the ⌘K spotlight (type to filter by label).
  const spotlightActions: SpotlightAction[] = useMemo(() => {
    const acts: SpotlightAction[] = [
      { label: editing ? "Exit edit mode" : "Edit dashboard", run: () => setEditing((e) => !e) },
      { label: "Add widget", run: () => setAddWidgetOpen(true) },
      { label: "Configure", run: () => openServices("services") },
      { label: "New dashboard from template", run: () => setTemplatePickerOpen(true) },
      { label: "Edit config.yaml", run: () => setConfigEditorOpen(true) },
      { label: "Back up everything", run: () => handleBackup() },
    ];
    for (const t of THEMES) {
      acts.push({ label: `Theme: ${t.label}`, subtitle: "Switch color theme", run: () => setTheme(t.id) });
    }
    for (const d of dashboards) {
      acts.push({ label: `Go to ${d.name}`, subtitle: "Dashboard", run: () => setActiveDashboardId(d.id) });
    }
    return acts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, dashboards, setTheme, handleBackup]);

  const bgBase = backgroundLayerStyle(activeBackground, "base");
  const bgDim = backgroundLayerStyle(activeBackground, "dim");
  const padN = kiosk ? 3 : density === "compact" ? 3 : density === "spacious" ? 8 : 6;
  // Flush is a mode (independent of bar style): break out of the page padding
  // to touch the window edges + top.
  const flushBar = !!activeHeader?.barFlush;
  const flushWrap = flushBar
    ? padN === 3
      ? "-mx-3 -mt-3 mb-3"
      : padN === 8
        ? "-mx-8 -mt-8 mb-5"
        : "-mx-6 -mt-6 mb-4"
    : "";

  return (
    <div
      className={`${
        kiosk ? "p-3" : density === "compact" ? "p-3" : density === "spacious" ? "p-8" : "p-6"
      } h-full flex flex-col min-h-0 relative`}
      // Per-dashboard accent overrides the theme --color-accent for everything
      // inside this subtree (all `*-accent` utilities read the variable).
      style={activeAccent ? ({ "--color-accent": activeAccent } as React.CSSProperties) : undefined}
    >
      {/* Per-dashboard background layer(s) behind the grid. */}
      {bgBase && (
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute" style={{ inset: 0, ...bgBase }} />
          {bgDim && <div className="absolute inset-0" style={bgDim} />}
        </div>
      )}
      {!kiosk && (
      <div className={flushWrap}>
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
        onCopyDashboard={handleCopyDashboard}
        copiedShare={copiedShare}
        onImportFile={handleImportFile}
        onBackup={handleBackup}
        onRestoreFile={handleRestoreFile}
        activeAccent={activeAccent}
        onSetAccent={handleSetAccent}
        background={activeBackground}
        onSetBackground={handleSetBackground}
        barStyle={activeBarStyle}
        onSetBarStyle={handleSetBarStyle}
        header={activeHeader}
        onSetHeader={handleSetHeader}
        apps={fullConfig?.apps ?? []}
        onReorderDashboards={handleReorderDashboards}
        onEditConfig={() => setConfigEditorOpen(true)}
        onNewFromTemplate={() => setTemplatePickerOpen(true)}
        alertsEnabled={alertsEnabled}
        onToggleAlerts={toggleAlerts}
        onEnterKiosk={() => setKiosk(true)}
        density={density}
        onSetDensity={setDensity}
        onAddWidget={() => setAddWidgetOpen(true)}
        onManageServices={() => openServices("services")}
        onAddDashboard={handleAddDashboard}
        onRenameDashboard={handleRenameDashboard}
        onDeleteDashboard={handleDeleteDashboard}
        onOpenSpotlight={() => setSpotlightOpen(true)}
        theme={theme}
        setTheme={setTheme}
      />
      </div>
      )}

      <div
        ref={containerRef}
        className={`flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden transition-shadow ${
          editing ? "rounded-lg ring-1 ring-inset ring-accent/15" : ""
        }`}
      >
        {isStacked ? (
          <ResponsiveStack
            widgets={layout.widgets}
            items={layout.layouts.lg || []}
            columns={stackColumns}
          />
        ) : (
        <>
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
        {isEmpty ? (
          <EmptyDashboard
            onAddWidget={() => setAddWidgetOpen(true)}
            onNewFromTemplate={() => setTemplatePickerOpen(true)}
            onManageServices={() => openServices("services")}
          />
        ) : cell > 0 ? (
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
                  className={`group/w widget-card widget-card--blur relative overflow-hidden transition-[border-color,box-shadow] shadow-[0_1px_2px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.03)] ${
                    selected
                      ? "border-accent ring-1 ring-accent/40"
                      : editing
                        ? "border-border hover:border-accent/40"
                        : "border-border-subtle hover:border-border"
                  }`}
                >
                  {editing && (
                    <WidgetHoverHeader
                      title={widget.title}
                      hasConfig={!!def?.ConfigPanel}
                      onConfig={(e) => openConfig(widget.i, e)}
                      onDuplicate={() => handleDuplicateWidget(widget.i)}
                      onRemove={() => handleRemoveWidget(widget.i)}
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
        ) : null}
        </>
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
        initialTab={servicesTab}
      />
      {kiosk && (
        <button
          onClick={() => setKiosk(false)}
          title="Exit kiosk (Esc)"
          className="fixed top-3 right-3 z-[200] w-8 h-8 flex items-center justify-center rounded-md bg-bg-elevated/70 border border-border-subtle text-text-muted hover:text-text hover:bg-bg-elevated opacity-30 hover:opacity-100 transition-opacity"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <Spotlight
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        actions={spotlightActions}
      />
      <ConfigEditorModal open={configEditorOpen} onClose={() => setConfigEditorOpen(false)} />
      <TemplatePickerModal
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onPick={handleCreateFromTemplate}
        atLimit={dashboards.length >= 5}
      />

      {deletedStash && (
        <div className="animate-slide-up fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-2.5 rounded-lg bg-bg-elevated border border-border shadow-2xl ring-1 ring-white/5">
          <span className="text-[12px] text-text-secondary">
            Removed <span className="text-text font-medium">{deletedStash.widget.title}</span>
          </span>
          <button
            onClick={handleUndoDelete}
            className="text-[12px] font-medium text-accent hover:underline"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

// Read-only responsive rendering for narrow viewports (phones/tablets). Widgets
// keep their heights from the layout and flow in `columns` columns in the
// dashboard's visual order (top-to-bottom, left-to-right); wide widgets span
// the full row. No drag/edit.
function ResponsiveStack({
  widgets,
  items,
  columns,
}: {
  widgets: Widget[];
  items: GridItem[];
  columns: number;
}) {
  if (widgets.length === 0) {
    return <EmptyDashboard onAddWidget={() => {}} onNewFromTemplate={() => {}} onManageServices={() => {}} />;
  }
  // Order by grid position so the stack matches the on-screen arrangement.
  const ordered = [...widgets].sort((a, b) => {
    const ga = items.find((l) => l.i === a.i);
    const gb = items.find((l) => l.i === b.i);
    return (ga?.y ?? 0) - (gb?.y ?? 0) || (ga?.x ?? 0) - (gb?.x ?? 0);
  });
  return (
    <div
      className="grid gap-3 py-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {ordered.map((widget) => {
        const gi = items.find((l) => l.i === widget.i);
        const h = gi?.h ?? 2;
        const wUnits = gi?.w ?? 3;
        // A widget wider than half the grid takes the full row on tablet.
        const span = columns > 1 && wUnits >= 12 ? columns : 1;
        const def = getWidgetDefinition(widget.type);
        return (
          <div
            key={widget.i}
            className="widget-card widget-card--blur border-border-subtle overflow-hidden shadow-sm shadow-black/20"
            style={{ gridColumn: `span ${span}`, height: Math.max(120, h * 64) }}
          >
            <WidgetSurface
              widget={widget}
              def={def}
              w={span >= columns ? 6 : 4}
              h={h}
              editing={false}
              save={() => {}}
            />
          </div>
        );
      })}
    </div>
  );
}

function EmptyDashboard({
  onAddWidget,
  onNewFromTemplate,
  onManageServices,
}: {
  onAddWidget: () => void;
  onNewFromTemplate: () => void;
  onManageServices: () => void;
}) {
  const cards: { label: string; desc: string; icon: React.ReactNode; onClick: () => void; primary?: boolean }[] = [
    {
      label: "Add a widget",
      desc: "Clock, apps grid, weather, charts…",
      onClick: onAddWidget,
      primary: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M17.5 14.5v6M14.5 17.5h6" />
        </svg>
      ),
    },
    {
      label: "Start from a template",
      desc: "A ready-made starter layout.",
      onClick: onNewFromTemplate,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
        </svg>
      ),
    },
    {
      label: "Add services",
      desc: "Health-checked app cards.",
      onClick: onManageServices,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="2" y="4" width="20" height="7" rx="2" /><rect x="2" y="13" width="20" height="7" rx="2" />
          <path d="M6 7.5h.01M6 16.5h.01" />
        </svg>
      ),
    },
  ];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-5 px-6">
      <div>
        <div className="text-text text-[15px] font-semibold">Let's build your dashboard</div>
        <div className="text-text-muted text-[12px] mt-1">Pick a starting point — everything's drag-and-drop.</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full max-w-lg">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={c.onClick}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
              c.primary
                ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
                : "border-border-subtle bg-bg-card/40 text-text-secondary hover:border-border hover:text-text"
            }`}
          >
            {c.icon}
            <span className="text-[12px] font-medium">{c.label}</span>
            <span className="text-[10.5px] text-text-muted leading-snug">{c.desc}</span>
          </button>
        ))}
      </div>
      <div className="text-text-muted/70 text-[11px]">
        Tip: press <kbd className="px-1 py-0.5 rounded bg-bg-elevated border border-border-subtle font-mono text-[10px]">?</kbd> for shortcuts
      </div>
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
  onDuplicate,
  onRemove,
}: {
  title: string;
  hasConfig: boolean;
  onConfig: (e: React.MouseEvent) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="wdrag absolute top-0 inset-x-0 h-6 z-[100] opacity-80 group-hover/w:opacity-100 transition-opacity flex items-center justify-between px-1.5 bg-bg-elevated/90 backdrop-blur-sm border-b border-border cursor-grab active:cursor-grabbing">
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-indigo-400/10"
          title="Duplicate widget"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger/10"
          title="Remove widget (Del)"
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
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
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
      className="animate-pop-in fixed z-50 w-[340px] origin-top bg-bg-elevated border border-border rounded-xl shadow-2xl shadow-black/50 ring-1 ring-white/5 overflow-hidden"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-card/40">
        <div className="flex items-center gap-2 min-w-0">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5 text-accent shrink-0"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="text-[13px] font-medium text-text truncate">{title}</span>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text w-6 h-6 flex items-center justify-center rounded hover:bg-bg-hover -mr-1"
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
      <div className="p-4 max-h-[60vh] overflow-auto">{children}</div>
    </div>
  );
}
