import { useState } from "react";
import { getWidgetDefinition, listWidgetDefinitions } from "../registry";
import type { AnyWidgetConfig, TabGroupConfig, TabGroupTab, WidgetConfigProps, WidgetDefinition, WidgetProps, WidgetType } from "../types";

// ---------------------------------------------------------------------------
// Tabbed group — several widgets stacked in one card, switched by tabs. Each
// tab renders another registered widget via its own Component; the config panel
// reuses each widget's own ConfigPanel inline for a nested setup.
// ---------------------------------------------------------------------------

function TabGroupComponent({ config, w, h, editing }: WidgetProps<TabGroupConfig>) {
  const tabs = config?.tabs ?? [];
  const [active, setActive] = useState(0);

  if (tabs.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Add tabs (widgets) in config.</div>;
  }
  const idx = Math.min(active, tabs.length - 1);
  const tab = tabs[idx];
  const def = getWidgetDefinition(tab.type);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-1 px-1.5 pt-1.5 pb-1 border-b border-border-subtle overflow-x-auto">
        {tabs.map((t, i) => {
          const d = getWidgetDefinition(t.type);
          return (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`px-2 py-1 text-[11px] rounded whitespace-nowrap transition-colors shrink-0 ${
                i === idx ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text"
              }`}
            >
              {t.title?.trim() || d?.title || t.type}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        {def ? (
          <def.Component config={(tab.config ?? def.defaultConfig) as never} w={w} h={h} editing={editing} save={() => {}} />
        ) : (
          <div className="flex items-center justify-center h-full text-[11px] text-text-muted">Unknown widget: {tab.type}</div>
        )}
      </div>
    </div>
  );
}

function TabGroupConfigPanel({ config, save }: WidgetConfigProps<TabGroupConfig>) {
  const tabs = config?.tabs ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // Widgets selectable as tabs — exclude the group itself and layout-only ones.
  const choices = listWidgetDefinitions().filter((d) => d.type !== "tabgroup" && d.type !== "section");

  const setTab = (i: number, patch: Partial<TabGroupTab>) => save({ tabs: tabs.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const setTabConfig = (i: number, patch: Partial<AnyWidgetConfig>) =>
    save({ tabs: tabs.map((t, j) => (j === i ? { ...t, config: { ...(t.config ?? {}), ...patch } } : t)) });
  const addTab = (type: WidgetType) => {
    const d = getWidgetDefinition(type);
    save({ tabs: [...tabs, { type, config: (d?.defaultConfig ?? {}) as AnyWidgetConfig }] });
  };
  const removeTab = (i: number) => save({ tabs: tabs.filter((_, j) => j !== i) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tabs.length) return;
    const next = [...tabs];
    [next[i], next[j]] = [next[j], next[i]];
    save({ tabs: next });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Title</label>
        <input value={config?.title ?? ""} onChange={(e) => save({ title: e.target.value })} placeholder="Group" className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent" />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Tabs</label>
        {tabs.map((t, i) => {
          const d = getWidgetDefinition(t.type);
          const open = openIdx === i;
          return (
            <div key={i} className="rounded-lg border border-border-subtle overflow-hidden">
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-bg-card/50">
                <button onClick={() => setOpenIdx(open ? null : i)} className="text-text-muted hover:text-text shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}><path d="m9 18 6-6-6-6" /></svg>
                </button>
                <input
                  value={t.title ?? ""}
                  onChange={(e) => setTab(i, { title: e.target.value })}
                  placeholder={d?.title ?? t.type}
                  className="flex-1 min-w-0 px-1.5 py-1 rounded bg-bg-elevated border border-border text-[11.5px] text-text focus:outline-none focus:border-accent"
                />
                <button onClick={() => move(i, -1)} disabled={i === 0} title="Up" className="text-text-muted hover:text-text disabled:opacity-30 text-[12px]">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === tabs.length - 1} title="Down" className="text-text-muted hover:text-text disabled:opacity-30 text-[12px]">↓</button>
                <button onClick={() => removeTab(i)} aria-label="Remove" className="text-text-muted hover:text-down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
              </div>
              {open && d?.ConfigPanel && (
                <div className="p-2.5 border-t border-border-subtle">
                  <d.ConfigPanel config={(t.config ?? d.defaultConfig) as never} save={(patch: Partial<AnyWidgetConfig>) => setTabConfig(i, patch)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Add a tab</label>
        <select
          value=""
          onChange={(e) => { if (e.target.value) addTab(e.target.value as WidgetType); e.target.value = ""; }}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        >
          <option value="">Pick a widget…</option>
          {choices.map((d) => (
            <option key={d.type} value={d.type}>{d.title}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

const TabIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></svg>
);

const definition: WidgetDefinition<TabGroupConfig> = {
  type: "tabgroup",
  title: "Tabbed group",
  icon: TabIcon,
  category: "productivity",
  description: "Stack several widgets in one card, switched by tabs — big density win.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 10,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: TabGroupComponent,
  ConfigPanel: TabGroupConfigPanel,
};

export default definition;
