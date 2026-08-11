import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import type { Config } from "../../api/types";
import { listWidgetDefinitions } from "./widgets/registry";
import type { WidgetType } from "./widgets/types";

const CATEGORY_LABELS: Record<string, string> = {
  productivity: "Productivity",
  system: "System",
  services: "Services",
  homeassistant: "Home Assistant",
  network: "Network",
  external: "External",
};
const CATEGORY_ORDER = ["services", "homeassistant", "system", "network", "productivity", "external"];
const catRank = (c: string) => {
  const i = CATEGORY_ORDER.indexOf(c);
  return i === -1 ? CATEGORY_ORDER.length : i;
};

interface Props {
  open: boolean;
  dashboardId: string | null;
  onClose: () => void;
  onCreated?: (newWidgetId: string) => void;
}

export function AddWidgetModal({ open, dashboardId, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const cached = qc.getQueryData<Config>(["config"]);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async (type: WidgetType) => {
      if (!cached || !dashboardId) throw new Error("config not loaded");
      const def = listWidgetDefinitions().find((d) => d.type === type);
      if (!def) throw new Error(`unknown widget type ${type}`);

      const newId = `w-${Date.now()}`;
      const next: Config = {
        ...cached,
        dashboards: (cached.dashboards ?? []).map((d) =>
          d.id === dashboardId
            ? {
                ...d,
                widgets: [
                  ...(d.widgets ?? []),
                  {
                    i: newId,
                    type: def.type,
                    title: def.title,
                    config: def.defaultConfig as Record<string, unknown>,
                  },
                ],
              }
            : d,
        ),
      };
      await api.putConfig(next);
      return newId;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["config"] });
      onCreated?.(newId);
      onClose();
    },
  });

  if (!open) return null;

  const defs = listWidgetDefinitions();
  const presentCats = Array.from(new Set(defs.map((d) => d.category))).sort((a, z) => catRank(a) - catRank(z));
  const categories = ["all", ...presentCats];
  const term = q.trim().toLowerCase();
  const filtered = defs.filter((d) => {
    if (cat !== "all" && d.category !== cat) return false;
    if (term && !`${d.title} ${d.description}`.toLowerCase().includes(term)) return false;
    return true;
  });
  // In the "All" view, break the wall into labelled per-category sections.
  const sections = (cat === "all" ? presentCats : [cat]).map((c) => ({
    cat: c,
    items: filtered.filter((d) => d.category === c),
  })).filter((s) => s.items.length > 0);
  const countFor = (c: string) => (c === "all" ? defs.length : defs.filter((d) => d.category === c).length);

  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="animate-pop-in bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
          <span className="text-[13px] font-semibold text-text">Add widget</span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text w-6 h-6 flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Filter row: category tabs + search */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle shrink-0 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors capitalize ${
                  cat === c ? "bg-accent/15 border-accent text-accent" : "bg-bg-card/40 border-border-subtle text-text-muted hover:text-text"
                }`}
              >
                {c === "all" ? "All" : CATEGORY_LABELS[c] ?? c}
                <span className="ml-1.5 text-[10px] opacity-60 tabular-nums">{countFor(c)}</span>
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search widgets…"
            className="ml-auto flex-1 min-w-[140px] max-w-[220px] px-2.5 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {sections.length === 0 && (
            <div className="text-center text-[12px] text-text-muted py-8">No widgets match.</div>
          )}
          {sections.map((section) => {
            // Collapse grouped variants (e.g. Lights single/multi) into one
            // expandable card; a group with a single matching variant shows plain.
            type Def = (typeof section.items)[number];
            const entries: ({ kind: "single"; def: Def } | { kind: "group"; name: string; defs: Def[] })[] = [];
            const seen = new Set<string>();
            for (const def of section.items) {
              if (!def.group) {
                entries.push({ kind: "single", def });
                continue;
              }
              if (seen.has(def.group)) continue;
              seen.add(def.group);
              const gdefs = section.items.filter((d) => d.group === def.group);
              if (gdefs.length === 1) entries.push({ kind: "single", def: gdefs[0] });
              else entries.push({ kind: "group", name: def.group, defs: gdefs });
            }
            const addCard = (def: Def) => (
              <button
                key={def.type}
                onClick={() => add.mutate(def.type)}
                disabled={add.isPending || !dashboardId}
                className="text-left flex items-start gap-3 p-3 rounded-lg border border-border-subtle bg-bg-card/40 hover:border-accent/40 hover:bg-bg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-md bg-bg-elevated flex items-center justify-center text-text-secondary shrink-0">{def.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-text font-medium">{def.title}</div>
                  <div className="text-[11px] text-text-muted leading-snug mt-0.5 line-clamp-2">{def.description}</div>
                </div>
              </button>
            );
            return (
              <div key={section.cat}>
                <div className="flex items-center gap-2 mb-2 px-0.5">
                  <span className="text-[10px] uppercase tracking-[0.1em] text-text-muted font-semibold">
                    {CATEGORY_LABELS[section.cat] ?? section.cat}
                  </span>
                  <span className="text-[10px] text-text-muted/60 tabular-nums">{section.items.length}</span>
                  <div className="flex-1 h-px bg-border-subtle" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 items-start">
                  {entries.map((entry) => {
                    if (entry.kind === "single") return addCard(entry.def);
                    const key = `${section.cat}:${entry.name}`;
                    const open = openGroup === key;
                    const first = entry.defs[0];
                    if (open) {
                      return (
                        <div key={key} className="rounded-lg border border-accent/40 bg-bg-card p-3 flex flex-col gap-2">
                          <button onClick={() => setOpenGroup(null)} className="flex items-center gap-3 text-left">
                            <div className="w-8 h-8 rounded-md bg-bg-elevated flex items-center justify-center text-text-secondary shrink-0">{first.icon}</div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12.5px] text-text font-medium">{entry.name}</div>
                              <div className="text-[10px] text-text-muted">Choose one</div>
                            </div>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-text-muted"><path d="m18 15-6-6-6 6" /></svg>
                          </button>
                          <div className="space-y-1">
                            {entry.defs.map((d) => (
                              <button
                                key={d.type}
                                onClick={() => add.mutate(d.type)}
                                disabled={add.isPending || !dashboardId}
                                className="w-full text-left px-2.5 py-1.5 rounded border border-border-subtle hover:border-accent/50 hover:bg-bg-elevated transition-colors disabled:opacity-40"
                              >
                                <div className="text-[11.5px] text-text font-medium">{d.variant}</div>
                                <div className="text-[10px] text-text-muted leading-snug line-clamp-1">{d.description}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={key}
                        onClick={() => setOpenGroup(key)}
                        className="text-left flex items-start gap-3 p-3 rounded-lg border border-border-subtle bg-bg-card/40 hover:border-accent/40 hover:bg-bg-card transition-colors"
                      >
                        <div className="w-8 h-8 rounded-md bg-bg-elevated flex items-center justify-center text-text-secondary shrink-0">{first.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] text-text font-medium flex items-center gap-1">
                            {entry.name}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-text-muted"><path d="m6 9 6 6 6-6" /></svg>
                          </div>
                          <div className="text-[11px] text-text-muted leading-snug mt-0.5">{entry.defs.map((d) => d.variant).join(" · ")}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {add.isError && (
          <div className="px-4 py-2 bg-rose-950/40 border-t border-rose-700/40 text-[11px] text-rose-200 shrink-0">
            {(add.error as Error).message}
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-border-subtle text-[10.5px] text-text-muted shrink-0">
          Adds an instance to the current dashboard. Writes{" "}
          <span className="font-mono text-text-secondary">config.yaml</span> — comments and
          formatting will be lost on save.
        </div>
      </div>
    </div>,
    document.body,
  );
}
