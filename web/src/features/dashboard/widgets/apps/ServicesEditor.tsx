import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AlertsDef, AppDef, Config, GroupDef, HealthType, DiscoveredService } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import { IconPicker } from "./IconPicker";
import { hashColor } from "./appVisual";
import { AlertsForm } from "../../AlertsPanel";
import { StatusPagesForm } from "../../StatusPagesPanel";
import type { StatusPageDef } from "../../../../api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  initialTab?: "services" | "alerts" | "status";
}

type WorkingApp = AppDef & { _key: number };
type WorkingGroup = GroupDef;

let nextKey = 1;
const keyed = (a: AppDef): WorkingApp => ({ ...a, _key: nextKey++ });

// Parse a bulk-import blob: either a JSON array of app objects, or newline-
// separated "Name, URL" / "Name | URL" lines. Ids are slugified from the name
// (deduped against existing ids). Returns {apps, error}.
function parseBulkApps(
  text: string,
  existingIds: Set<string>,
): { apps: AppDef[]; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { apps: [] };
  let raw: unknown[];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed);
      raw = Array.isArray(j) ? j : [j];
    } catch {
      return { apps: [], error: "Invalid JSON." };
    }
  } else {
    raw = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split(/\s*[|,]\s*/);
        return { name: parts[0], url: parts[1] ?? "" };
      });
  }
  const out: AppDef[] = [];
  const used = new Set(existingIds);
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const url = String(o.url ?? "").trim();
    if (!name || !url) continue;
    let id = String(o.id ?? "").trim() || slugify(name);
    let n = 2;
    while (used.has(id)) id = `${slugify(name)}-${n++}`;
    used.add(id);
    const app: AppDef = { id, name, url };
    if (o.icon) app.icon = String(o.icon);
    if (o.group) app.group = String(o.group);
    if (o.description) app.description = String(o.description);
    out.push(app);
  }
  return { apps: out };
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function ServicesEditor({ open, onClose, initialTab = "services" }: Props) {
  const qc = useQueryClient();
  const cached = qc.getQueryData<Config>(["config"]);
  const [tab, setTab] = useState<"services" | "alerts" | "status">(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const saveAlerts = async (a: AlertsDef) => {
    const cur = qc.getQueryData<Config>(["config"]);
    if (!cur) return;
    await api.putConfig({ ...cur, alerts: a });
    qc.invalidateQueries({ queryKey: ["config"] });
  };
  const saveStatusPages = async (pages: StatusPageDef[]) => {
    const cur = qc.getQueryData<Config>(["config"]);
    if (!cur) return;
    await api.putConfig({ ...cur, status_pages: pages });
    qc.invalidateQueries({ queryKey: ["config"] });
  };

  const [apps, setApps] = useState<WorkingApp[]>([]);
  const [groups, setGroups] = useState<WorkingGroup[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [iconPickerFor, setIconPickerFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null); // null=all, "__none"=ungrouped
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [bulkText, setBulkText] = useState<string | null>(null);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredService[]>([]);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);

  // Seed local state when the modal opens.
  useEffect(() => {
    if (!open) return;
    const seedApps = (cached?.apps ?? []).map(keyed);
    setApps(seedApps);
    setGroups(cached?.groups ?? []);
    setSelectedKey(null);
    setError(null);
    setDirty(false);
    setSearch("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      if (!cached) throw new Error("config not loaded");
      // Strip _key, normalise empty health blocks to undefined.
      const cleanApps = apps.map(({ _key, ...rest }) => {
        const cleaned: AppDef = { ...rest };
        if (cleaned.health && (cleaned.health.type === "none" || !cleaned.health.type)) {
          cleaned.health = undefined;
        }
        if (!cleaned.icon) delete cleaned.icon;
        if (!cleaned.description) delete cleaned.description;
        if (!cleaned.group) delete cleaned.group;
        return cleaned;
      });
      const next: Config = {
        ...cached,
        apps: cleanApps,
        groups,
      };
      await api.putConfig(next);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config"] });
      setDirty(false);
      onClose();
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    },
  });

  const update = (key: number, patch: Partial<AppDef>) => {
    setApps((prev) => prev.map((a) => (a._key === key ? { ...a, ...patch } : a)));
    setDirty(true);
  };

  const runDiscover = async () => {
    setDiscovering(true);
    setDiscoverMsg(null);
    try {
      const res = await api.discover();
      // Drop candidates already in the working list (by URL).
      const have = new Set(apps.map((a) => a.url.replace(/\/$/, "")));
      const fresh = res.services.filter((s) => !have.has(s.url.replace(/\/$/, "")));
      setDiscovered(fresh);
      setDiscoverMsg(
        res.error
          ? `Discovery unavailable: ${res.error}`
          : fresh.length === 0
            ? "No new services found (need axboard.url or Traefik Host() labels)."
            : null,
      );
    } catch (e) {
      setDiscoverMsg((e as Error).message);
    } finally {
      setDiscovering(false);
    }
  };

  const addDiscovered = (svc: DiscoveredService) => {
    const existing = new Set(apps.map((a) => a.id));
    let id = slugify(svc.name);
    let n = 2;
    while (existing.has(id)) id = `${slugify(svc.name)}-${n++}`;
    const app: AppDef = { id, name: svc.name, url: svc.url };
    if (svc.icon) app.icon = svc.icon;
    if (svc.group) app.group = svc.group;
    setApps((prev) => [...prev, keyed(app)]);
    setDiscovered((prev) => prev.filter((s) => s.url !== svc.url));
    setDirty(true);
  };

  const importBulk = () => {
    if (bulkText == null) return;
    const { apps: parsed, error: err } = parseBulkApps(
      bulkText,
      new Set(apps.map((a) => a.id)),
    );
    if (err) {
      setError(err);
      return;
    }
    if (parsed.length === 0) {
      setError("Nothing to import — expected a JSON array or 'Name, URL' lines.");
      return;
    }
    setApps((prev) => [...prev, ...parsed.map(keyed)]);
    setDirty(true);
    setBulkText(null);
    setError(null);
  };

  const addApp = (groupId?: string) => {
    const id = `service-${Date.now()}`;
    const fresh: WorkingApp = {
      _key: nextKey++,
      id,
      name: "New service",
      url: "https://",
      group: groupId,
    };
    setApps((prev) => [...prev, fresh]);
    setSelectedKey(fresh._key);
    setDirty(true);
  };

  const removeApp = (key: number) => {
    setApps((prev) => prev.filter((a) => a._key !== key));
    if (selectedKey === key) setSelectedKey(null);
    setDirty(true);
  };

  // ---- Group management ----

  const addGroup = () => {
    const baseId = "group";
    let i = 1;
    while (groups.some((g) => g.id === `${baseId}-${i}`)) i++;
    const fresh: GroupDef = {
      id: `${baseId}-${i}`,
      name: `New group ${i}`,
      color: ["#7c3aed", "#06b6d4", "#22c55e", "#ec4899", "#f59e0b", "#94a3b8"][groups.length % 6],
    };
    setGroups((prev) => [...prev, fresh]);
    setGroupsOpen(true);
    setDirty(true);
  };

  const updateGroup = (id: string, patch: Partial<GroupDef>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    setDirty(true);
  };


  const removeGroup = (id: string) => {
    const inGroup = apps.filter((a) => a.group === id);
    if (inGroup.length > 0) {
      const ok = confirm(
        `Delete group? ${inGroup.length} ${
          inGroup.length === 1 ? "service" : "services"
        } will become ungrouped.`,
      );
      if (!ok) return;
    }
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setApps((prev) => prev.map((a) => (a.group === id ? { ...a, group: undefined } : a)));
    setDirty(true);
  };

  const selected = selectedKey !== null ? apps.find((a) => a._key === selectedKey) : null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((a) => {
      if (groupFilter === "__none" && a.group) return false;
      if (groupFilter && groupFilter !== "__none" && a.group !== groupFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.url.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    });
  }, [apps, search, groupFilter]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={() => {
        if (!dirty || confirm("Discard unsaved changes?")) onClose();
      }}
    >
      <div
        className="animate-pop-in relative bg-bg-elevated border border-border rounded-xl shadow-2xl shadow-black/50 w-full max-w-6xl h-[82vh] flex flex-col ring-1 ring-white/5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle bg-bg-card/40">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-accent/12 ring-1 ring-accent/25 flex items-center justify-center text-accent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card/70 p-1">
              {(["services", "alerts", "status"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3.5 py-1.5 text-[12px] font-medium rounded-md capitalize transition-colors ${
                    tab === t
                      ? "bg-bg-elevated text-text shadow-sm ring-1 ring-border-subtle"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {t === "status" ? "Status pages" : t}
                </button>
              ))}
            </div>
            {tab === "services" && (
              <span className="text-[11px] text-text-muted">
                {apps.length} {apps.length === 1 ? "service" : "services"} · {groups.length} groups
              </span>
            )}
            {tab === "services" && dirty && (
              <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-degraded/15 text-degraded font-medium ring-1 ring-degraded/25">
                Unsaved
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!dirty || confirm("Discard unsaved changes?")) onClose();
              }}
              className="px-3 py-1.5 text-[12px] rounded border border-border text-text-secondary hover:text-text"
            >
              {tab === "services" ? "Cancel" : "Close"}
            </button>
            {tab === "services" && (
              <button
                onClick={() => {
                  setError(null);
                  save.mutate();
                }}
                disabled={!dirty || save.isPending}
                className="px-3 py-1.5 text-[12px] rounded border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
            )}
          </div>
        </div>

        {tab === "alerts" && (
          <AlertsForm
            alerts={cached?.alerts}
            onSave={saveAlerts}
            apps={apps.filter((a) => a.health && a.health.type !== "none").map((a) => ({ id: a.id, name: a.name }))}
          />
        )}

        {tab === "status" && (
          <StatusPagesForm
            pages={cached?.status_pages}
            groups={groups}
            apps={apps.filter((a) => a.health && a.health.type !== "none").map((a) => ({ id: a.id, name: a.name, group: a.group }))}
            onSave={saveStatusPages}
          />
        )}

        {tab === "services" && (
          <>
        {error && (
          <div className="px-5 py-2 bg-rose-950/40 border-b border-rose-700/40 text-[11px] text-rose-200 font-mono">
            {error}
          </div>
        )}

        <div className="px-5 py-2 border-b border-border-subtle text-[10.5px] text-text-muted">
          Saving writes <span className="font-mono text-text-secondary">config.yaml</span> on disk.
          Comments and formatting in the file will be lost — this is the documented contract for
          UI edits.
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border-subtle flex-wrap">
          <button
            onClick={() => addApp()}
            className="px-3 py-1.5 text-[12px] rounded-md border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 flex items-center gap-1.5 font-medium"
          >
            <PlusIcon /> Add service
          </button>
          <ToolbarToggle
            active={discoverOpen}
            onClick={() => {
              const n = !discoverOpen;
              setDiscoverOpen(n);
              if (n) void runDiscover();
            }}
          >
            Discover
          </ToolbarToggle>
          <ToolbarToggle active={bulkText != null} onClick={() => setBulkText(bulkText == null ? "" : null)}>
            Bulk import
          </ToolbarToggle>
          <ToolbarToggle active={groupsOpen} onClick={() => setGroupsOpen((o) => !o)}>
            Groups
          </ToolbarToggle>
          <div className="flex items-center rounded-md border border-border-subtle overflow-hidden">
            {(["grid", "table"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                title={`${m} view`}
                className={`px-2 py-1.5 flex items-center justify-center transition-colors ${viewMode === m ? "bg-bg-elevated text-accent" : "text-text-muted hover:text-text"}`}
              >
                {m === "grid" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services…"
              className="w-52 pl-8 pr-2 py-1.5 text-[12px] rounded-md bg-bg-card border border-border-subtle text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>

        {/* Contextual panels */}
        {discoverOpen && (
          <div className="px-5 py-3 border-b border-border-subtle bg-bg-card/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-secondary font-medium">
                Discovered from Docker/Podman {discovering ? "…" : `· ${discovered.length}`}
              </span>
              <button
                onClick={runDiscover}
                disabled={discovering}
                className="text-[11px] text-text-muted hover:text-text-secondary disabled:opacity-40"
              >
                Refresh
              </button>
            </div>
            {discoverMsg && <div className="text-[10.5px] text-text-muted leading-snug">{discoverMsg}</div>}
            {discovered.length > 0 && (
              <>
                <div className="max-h-44 overflow-auto grid gap-1.5 grid-cols-2">
                  {discovered.map((svc) => (
                    <div
                      key={svc.url}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border-subtle bg-bg-card/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] text-text truncate">{svc.name}</div>
                        <div className="text-[10px] text-text-muted truncate font-mono">{svc.url}</div>
                      </div>
                      <button
                        onClick={() => addDiscovered(svc)}
                        className="px-2 py-0.5 text-[11px] rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => discovered.forEach(addDiscovered)}
                  className="w-full px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted"
                >
                  Add all {discovered.length}
                </button>
              </>
            )}
          </div>
        )}
        {bulkText != null && (
          <div className="px-5 py-3 border-b border-border-subtle bg-bg-card/40 space-y-2">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={4}
              autoFocus
              placeholder={'Paste a JSON array of {name,url,…}\nor one "Name, URL" per line.'}
              className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono resize-y"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setBulkText(null)}
                className="px-2.5 py-1 text-[11px] rounded border border-border text-text-secondary hover:text-text"
              >
                Cancel
              </button>
              <button
                onClick={importBulk}
                className="px-2.5 py-1 text-[11px] rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
              >
                Import
              </button>
            </div>
          </div>
        )}
        {groupsOpen && (
          <GroupsManager
            groups={groups}
            onAdd={addGroup}
            onPatch={updateGroup}
            onDelete={removeGroup}
          />
        )}

        {/* Group filter chips */}
        {groups.length > 0 && (
          <div className="flex items-center gap-1.5 px-5 py-2 border-b border-border-subtle overflow-x-auto">
            <FilterChip active={groupFilter === null} onClick={() => setGroupFilter(null)}>
              All
            </FilterChip>
            {groups.map((g) => (
              <FilterChip key={g.id} active={groupFilter === g.id} onClick={() => setGroupFilter(g.id)} color={g.color}>
                {g.name}
              </FilterChip>
            ))}
            <FilterChip active={groupFilter === "__none"} onClick={() => setGroupFilter("__none")}>
              Ungrouped
            </FilterChip>
          </div>
        )}

        {/* Card grid */}
        <div className="flex-1 overflow-auto p-5">
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-text-muted">
              <span className="text-[13px]">{apps.length === 0 ? "No services yet" : "No matches"}</span>
              {apps.length === 0 && (
                <button onClick={() => addApp()} className="text-[12px] text-accent hover:underline">
                  Add your first service
                </button>
              )}
            </div>
          ) : viewMode === "table" ? (
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-text-muted bg-bg-card/40">
                    <th className="text-left font-semibold px-3 py-2">Name</th>
                    <th className="text-left font-semibold px-3 py-2">Group</th>
                    <th className="text-left font-semibold px-3 py-2">Check</th>
                    <th className="text-left font-semibold px-3 py-2 max-md:hidden">URL / target</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filtered.map((app) => {
                    const g = groups.find((x) => x.id === app.group);
                    return (
                      <tr key={app._key} onClick={() => setSelectedKey(app._key)} className="cursor-pointer hover:bg-bg-hover transition-colors">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <SimpleIcon slug={app.icon || app.name} size={16} className="rounded shrink-0" />
                            <span className="text-text-secondary truncate">{app.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {g ? (
                            <span className="inline-flex items-center gap-1.5 text-text-muted">
                              {g.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />}
                              {g.name}
                            </span>
                          ) : (
                            <span className="text-text-muted/50">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {app.health && app.health.type !== "none" ? (
                            <span className="font-mono text-text-muted">{app.health.type}{app.health.interval ? ` · ${app.health.interval}` : ""}{app.health.retries ? ` · ${app.health.retries}r` : ""}</span>
                          ) : (
                            <span className="text-text-muted/50">none</span>
                          )}
                        </td>
                        <td className="px-3 py-2 max-md:hidden">
                          <span className="font-mono text-text-muted truncate block max-w-[280px]">{app.health?.url || app.health?.host || app.url}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${app.name}"?`)) removeApp(app._key); }}
                            className="text-text-muted hover:text-down"
                            title="Delete"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}
            >
              {filtered.map((app) => (
                <ServiceCard
                  key={app._key}
                  app={app}
                  group={groups.find((g) => g.id === app.group)}
                  selected={selectedKey === app._key}
                  onClick={() => setSelectedKey(app._key)}
                  onRemove={() => {
                    if (confirm(`Delete "${app.name}"?`)) removeApp(app._key);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Centered editor dialog */}
        {selected && (
          <div
            className="absolute inset-0 z-20 bg-black/45 flex items-center justify-center p-6"
            onClick={() => setSelectedKey(null)}
          >
            <div
              className="w-[460px] max-w-full max-h-full bg-bg-elevated border border-border rounded-xl shadow-2xl shadow-black/50 flex flex-col animate-pop-in overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle bg-bg-card/40 shrink-0">
                <span className="text-[13px] font-semibold text-text">Edit service</span>
                <button
                  onClick={() => setSelectedKey(null)}
                  className="text-text-muted hover:text-text w-6 h-6 flex items-center justify-center rounded hover:bg-bg-hover"
                  title="Close"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-5">
                <ServiceForm
                  app={selected}
                  groups={groups}
                  onPatch={(patch) => update(selected._key, patch)}
                  onPickIcon={() => setIconPickerFor(selected._key)}
                />
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      <IconPicker
        open={iconPickerFor !== null}
        current={iconPickerFor !== null ? apps.find((a) => a._key === iconPickerFor)?.icon : ""}
        onClose={() => setIconPickerFor(null)}
        onSelect={(slug) => {
          if (iconPickerFor !== null) update(iconPickerFor, { icon: slug });
        }}
      />
    </div>,
    document.body,
  );
}

function IconUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onUploaded(await api.uploadIcon(f));
          } catch (err) {
            alert(`Upload failed: ${(err as Error).message}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="px-3 py-1.5 text-[11px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted whitespace-nowrap disabled:opacity-50"
        title="Upload an image file as the icon"
      >
        {busy ? "…" : "Upload"}
      </button>
    </>
  );
}

function ServiceForm({
  app,
  groups,
  onPatch,
  onPickIcon,
}: {
  app: WorkingApp;
  groups: GroupDef[];
  onPatch: (patch: Partial<AppDef>) => void;
  onPickIcon: () => void;
}) {
  // When name changes, auto-update the id IF the id was a Date-based default
  // (i.e. matches "service-NNNNNNNN"). Don't touch a user-chosen id.
  const autoSlug = /^service-\d+$/.test(app.id);
  const onNameChange = (name: string) => {
    if (autoSlug) onPatch({ name, id: slugify(name) || app.id });
    else onPatch({ name });
  };

  const healthType = (app.health?.type ?? "none") as HealthType;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <button
          onClick={onPickIcon}
          className="w-11 h-11 shrink-0 rounded-md border border-border-subtle bg-bg-card/40 flex items-center justify-center overflow-hidden hover:border-accent/40 transition-colors"
          title="Change icon"
        >
          {app.icon ? (
            <SimpleIcon slug={app.icon} fill />
          ) : (
            <div
              className="w-full h-full text-[11px] font-semibold flex items-center justify-center text-text"
              style={{ background: hashColor(app.name || "?") }}
            >
              {(app.name.slice(0, 2) || "??").toUpperCase()}
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <Field label="Name">
            <input
              value={app.name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
            />
          </Field>
        </div>
      </div>

      <Field label="URL">
        <input
          value={app.url}
          onChange={(e) => onPatch({ url: e.target.value })}
          placeholder="https://service.example.com"
          className="w-full px-2.5 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50 font-mono"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ID" hint="lowercase, stable">
          <input
            value={app.id}
            onChange={(e) => onPatch({ id: slugify(e.target.value) || e.target.value })}
            className="w-full px-2.5 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50 font-mono"
          />
        </Field>

        <Field label="Group">
          <select
            value={app.group ?? ""}
            onChange={(e) => onPatch({ group: e.target.value || undefined })}
            className="w-full px-2 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
          >
            <option value="">(ungrouped)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description" hint="One short line; shown in detailed density.">
        <input
          value={app.description ?? ""}
          onChange={(e) => onPatch({ description: e.target.value || undefined })}
          className="w-full px-2.5 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
        />
      </Field>

      <Field label="Icon" hint="si: · sh: · URL · or Upload">
        <div className="flex gap-2">
          <input
            value={app.icon ?? ""}
            onChange={(e) => onPatch({ icon: e.target.value || undefined })}
            placeholder="sh:proxmox  ·  si:gitlab  ·  https://…"
            className="flex-1 px-2.5 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50 font-mono"
          />
          <IconUpload onUploaded={(url) => onPatch({ icon: url })} />
          <button
            onClick={onPickIcon}
            className="px-3 py-1.5 text-[11px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted whitespace-nowrap"
          >
            Browse…
          </button>
        </div>
      </Field>

      <div className="rounded-lg border border-border-subtle bg-bg-card/40 p-3.5">
        <Field label="Health check">
          <div className="space-y-2">
            <select
              value={healthType}
              onChange={(e) => {
                const t = e.target.value as HealthType;
                if (t === "none") onPatch({ health: undefined });
                else if (t === "http")
                  onPatch({ health: { type: "http", url: app.url, interval: "60s" } });
                else if (t === "ping")
                  onPatch({ health: { type: "ping", host: hostFromURL(app.url), interval: "60s" } });
                else
                  onPatch({
                    health: { type: "tcp", host: hostFromURL(app.url), port: 80, interval: "60s" },
                  });
              }}
              className="w-full px-2 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
            >
              <option value="none">None</option>
              <option value="http">HTTP — match status code</option>
              <option value="tcp">TCP — port open</option>
              <option value="ping">Ping — ICMP reachable</option>
            </select>

            {healthType === "http" && (
              <>
                <HealthUrlField
                  serviceUrl={app.url}
                  health={app.health!}
                  onChange={(url) =>
                    onPatch({ health: { ...app.health!, type: "http", url } })
                  }
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={app.health?.expect_status ?? ""}
                    onChange={(e) =>
                      onPatch({
                        health: {
                          ...app.health!,
                          type: "http",
                          expect_status: Number(e.target.value) || undefined,
                        },
                      })
                    }
                    placeholder="200"
                    className="w-24 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
                  />
                  <input
                    value={app.health?.interval ?? ""}
                    onChange={(e) =>
                      onPatch({ health: { ...app.health!, type: "http", interval: e.target.value } })
                    }
                    placeholder="60s"
                    className="w-24 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-text-muted w-24 shrink-0">Body contains</span>
                  <input
                    value={app.health?.body_contains ?? ""}
                    onChange={(e) => onPatch({ health: { ...app.health!, type: "http", body_contains: e.target.value } })}
                    placeholder="keyword (optional) — degraded if missing"
                    className="flex-1 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
                  />
                </div>
              </>
            )}

            {healthType === "tcp" && (
              <div className="flex gap-2">
                <input
                  value={app.health?.host ?? ""}
                  onChange={(e) =>
                    onPatch({ health: { ...app.health!, type: "tcp", host: e.target.value } })
                  }
                  placeholder="host.example.com"
                  className="flex-1 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50 font-mono"
                />
                <input
                  type="number"
                  value={app.health?.port ?? ""}
                  onChange={(e) =>
                    onPatch({
                      health: { ...app.health!, type: "tcp", port: Number(e.target.value) || 0 },
                    })
                  }
                  placeholder="port"
                  className="w-20 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
                />
              </div>
            )}

            {healthType === "ping" && (
              <div className="flex gap-2">
                <input
                  value={app.health?.host ?? ""}
                  onChange={(e) =>
                    onPatch({ health: { ...app.health!, type: "ping", host: e.target.value } })
                  }
                  placeholder="host.example.com or 10.0.0.5"
                  className="flex-1 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50 font-mono"
                />
                <input
                  value={app.health?.interval ?? ""}
                  onChange={(e) =>
                    onPatch({ health: { ...app.health!, type: "ping", interval: e.target.value } })
                  }
                  placeholder="60s"
                  className="w-24 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
                />
              </div>
            )}

            {healthType !== "none" && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-text-muted w-16 shrink-0">Every</span>
                  {(["5s", "30s", "1m", "5m", "1h"] as const).map((iv) => (
                    <button
                      key={iv}
                      onClick={() => onPatch({ health: { ...app.health!, interval: iv } })}
                      className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                        (app.health?.interval || "") === iv ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                  <input
                    value={app.health?.interval ?? ""}
                    onChange={(e) => onPatch({ health: { ...app.health!, interval: e.target.value } })}
                    placeholder="custom"
                    className="w-20 px-2 py-1 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-text-muted w-16 shrink-0">Retries</span>
                  <input
                    type="number"
                    min={0}
                    value={app.health?.retries ?? ""}
                    onChange={(e) => onPatch({ health: { ...app.health!, retries: Number(e.target.value) || undefined } })}
                    placeholder="0"
                    className="w-20 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
                  />
                  <span className="text-[10px] text-text-muted">failures before “down” (avoids flapping)</span>
                </div>
              </>
            )}
          </div>
        </Field>
      </div>
    </div>
  );
}

function HealthUrlField({
  serviceUrl,
  health,
  onChange,
}: {
  serviceUrl: string;
  health: NonNullable<AppDef["health"]>;
  onChange: (url: string) => void;
}) {
  // UI-only "same URL" toggle. The persisted health.url is either the
  // service URL (when same) or whatever the user typed (when different).
  // We can't derive "same" from value alone because an empty health.url
  // also looks "same" — so track it as local state seeded from the data.
  const [sameURL, setSameURL] = useState<boolean>(
    !health.url || health.url === serviceUrl,
  );

  return (
    <>
      <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={sameURL}
          onChange={(e) => {
            const next = e.target.checked;
            setSameURL(next);
            onChange(next ? serviceUrl : health.url || "");
          }}
          className="accent-accent"
        />
        Use the service URL for the health check
      </label>
      {!sameURL && (
        <input
          value={health.url ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://service:port/health"
          className="w-full px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50 font-mono"
        />
      )}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[11.5px] text-text-secondary font-medium">{label}</label>
        {hint && <span className="text-[10px] text-text-muted/80">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function hostFromURL(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
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
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ToolbarToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 text-[12px] rounded-md border transition-colors ${
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border text-text-secondary hover:text-text hover:border-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border-subtle text-text-muted hover:text-text-secondary hover:border-border"
      }`}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function ServiceCard({
  app,
  group,
  selected,
  onClick,
  onRemove,
}: {
  app: WorkingApp;
  group?: GroupDef;
  selected: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  let host = app.url;
  try {
    host = new URL(app.url).host || app.url;
  } catch {
    /* keep raw */
  }
  return (
    <div
      onClick={onClick}
      className={`group/card relative cursor-pointer rounded-lg border p-3 bg-bg-card transition-[border-color,box-shadow] shadow-[0_1px_2px_rgba(0,0,0,0.25)] ${
        selected ? "border-accent ring-1 ring-accent/40" : "border-border-subtle hover:border-border"
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded text-text-muted/40 hover:text-danger hover:bg-danger/10 opacity-0 group-hover/card:opacity-100"
        title="Delete service"
      >
        <TrashIcon />
      </button>
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-md bg-bg-elevated flex items-center justify-center shrink-0 overflow-hidden">
          {app.icon ? (
            <SimpleIcon slug={app.icon} fill />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-[11px] font-semibold text-text"
              style={{ background: hashColor(app.name || "?") }}
            >
              {(app.name.slice(0, 2) || "??").toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <div className="text-[12.5px] text-text font-medium truncate">{app.name || "(unnamed)"}</div>
          <div className="text-[10.5px] text-text-muted truncate font-mono">{host}</div>
        </div>
      </div>
      {group && (
        <div className="mt-2.5 inline-flex items-center gap-1.5 text-[10px] text-text-muted">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: group.color ?? "var(--color-border)" }}
          />
          {group.name}
        </div>
      )}
    </div>
  );
}

function GroupsManager({
  groups,
  onAdd,
  onPatch,
  onDelete,
}: {
  groups: GroupDef[];
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<GroupDef>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="px-5 py-3 border-b border-border-subtle bg-bg-card/40">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-text-secondary font-medium">Groups</span>
        <button onClick={onAdd} className="text-[11px] text-accent hover:underline flex items-center gap-1">
          <PlusIcon /> Add group
        </button>
      </div>
      {groups.length === 0 ? (
        <div className="text-[11px] text-text-muted">No groups yet.</div>
      ) : (
        <div className="grid gap-1.5 grid-cols-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border-subtle bg-bg-card/60"
            >
              <input
                type="color"
                value={g.color ?? "#7c3aed"}
                onChange={(e) => onPatch(g.id, { color: e.target.value })}
                className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"
                title="Group color"
              />
              <input
                defaultValue={g.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== g.name) onPatch(g.id, { name: v });
                }}
                className="flex-1 min-w-0 bg-transparent text-[12px] text-text focus:outline-none"
              />
              <button
                onClick={() => {
                  if (confirm(`Delete group "${g.name}"? Its services become ungrouped.`)) onDelete(g.id);
                }}
                className="w-5 h-5 flex items-center justify-center rounded text-text-muted/50 hover:text-danger hover:bg-danger/10 shrink-0"
                title="Delete group"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
