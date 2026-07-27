import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, Config, GroupDef, HealthType, DiscoveredService } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import { IconPicker } from "./IconPicker";
import { hashColor } from "./appVisual";

interface Props {
  open: boolean;
  onClose: () => void;
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

export function ServicesEditor({ open, onClose }: Props) {
  const qc = useQueryClient();
  const cached = qc.getQueryData<Config>(["config"]);

  const [apps, setApps] = useState<WorkingApp[]>([]);
  const [groups, setGroups] = useState<WorkingGroup[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [iconPickerFor, setIconPickerFor] = useState<number | null>(null);
  const [dragKey, setDragKey] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
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
    setSelectedKey(seedApps[0]?._key ?? null);
    setError(null);
    setDirty(false);
    setCollapsed(new Set());
    setPendingFocus(null);
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

  // Group services for the sidebar — include groups with services, then groups
  // without, then ungrouped (null).
  const groupedView = useMemo(() => {
    const byGroup = new Map<string | null, WorkingApp[]>();
    for (const a of apps) {
      const key = a.group || null;
      const arr = byGroup.get(key) ?? [];
      arr.push(a);
      byGroup.set(key, arr);
    }
    const sections: { group?: GroupDef; apps: WorkingApp[] }[] = [];
    for (const g of groups) {
      sections.push({ group: g, apps: byGroup.get(g.id) ?? [] });
    }
    const ungrouped = byGroup.get(null);
    if (ungrouped && ungrouped.length) sections.push({ apps: ungrouped });
    return sections;
  }, [apps, groups]);

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

  const moveTo = (sourceKey: number, targetKey: number) => {
    setApps((prev) => {
      const src = prev.findIndex((a) => a._key === sourceKey);
      const dst = prev.findIndex((a) => a._key === targetKey);
      if (src === -1 || dst === -1 || src === dst) return prev;
      const next = [...prev];
      const [moved] = next.splice(src, 1);
      // Adopt the target's group on drop.
      const target = prev[dst];
      if (target.group !== moved.group) moved.group = target.group;
      const insertAt = next.findIndex((a) => a._key === targetKey);
      next.splice(insertAt, 0, moved);
      return next;
    });
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
    // Collapse every existing group so the new one is the only thing in view.
    setCollapsed(new Set(groups.map((g) => g.id)));
    setPendingFocus(fresh.id);
    setDirty(true);
  };

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateGroup = (id: string, patch: Partial<GroupDef>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    setDirty(true);
  };

  const renameGroupId = (oldId: string, newId: string) => {
    const slug = slugify(newId);
    if (!slug || slug === oldId) return;
    if (groups.some((g) => g.id === slug)) {
      alert(`Group id "${slug}" already exists.`);
      return;
    }
    setGroups((prev) => prev.map((g) => (g.id === oldId ? { ...g, id: slug } : g)));
    // Repoint apps that referenced the old id.
    setApps((prev) => prev.map((a) => (a.group === oldId ? { ...a, group: slug } : a)));
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

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={() => {
        if (!dirty || confirm("Discard unsaved changes?")) onClose();
      }}
    >
      <div
        className="bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col ring-1 ring-white/5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-semibold text-text">Manage services</span>
            <span className="text-[11px] text-text-muted">
              {apps.length} {apps.length === 1 ? "service" : "services"} · {groups.length} groups
            </span>
            {dirty && (
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">
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
              Cancel
            </button>
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
          </div>
        </div>

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

        {/* Body */}
        <div className="flex-1 grid grid-cols-[minmax(320px,380px)_1fr] min-h-0">
          {/* Sidebar list */}
          <div className="border-r border-border-subtle overflow-auto">
            <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between gap-2 sticky top-0 bg-bg-elevated z-20">
              <span className="text-[11px] text-text-muted min-w-0 truncate">
                Drag the grip to reorder · drop on another group to move
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    const next = !discoverOpen;
                    setDiscoverOpen(next);
                    if (next) void runDiscover();
                  }}
                  className={`px-2 py-1 text-[11px] rounded border whitespace-nowrap flex items-center gap-1 ${
                    discoverOpen
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border text-text-secondary hover:text-text hover:border-text-muted"
                  }`}
                  title="Auto-discover services from the Docker/Podman socket"
                >
                  Discover
                </button>
                <button
                  onClick={() => setBulkText(bulkText == null ? "" : null)}
                  className={`px-2 py-1 text-[11px] rounded border whitespace-nowrap flex items-center gap-1 ${
                    bulkText != null
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border text-text-secondary hover:text-text hover:border-text-muted"
                  }`}
                  title="Bulk import services"
                >
                  Bulk
                </button>
                <button
                  onClick={addGroup}
                  className="px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted whitespace-nowrap flex items-center gap-1"
                  title="Add a new group"
                >
                  <PlusIcon /> Group
                </button>
              </div>
            </div>
            {discoverOpen && (
              <div className="px-3 py-2 border-b border-border-subtle bg-bg-card/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
                    Discovered {discovering ? "…" : `(${discovered.length})`}
                  </span>
                  <button
                    onClick={runDiscover}
                    disabled={discovering}
                    className="text-[10px] text-text-muted hover:text-text-secondary disabled:opacity-40"
                  >
                    Refresh
                  </button>
                </div>
                {discoverMsg && (
                  <div className="text-[10.5px] text-text-muted leading-snug">{discoverMsg}</div>
                )}
                {discovered.length > 0 && (
                  <>
                    <div className="max-h-52 overflow-auto space-y-1">
                      {discovered.map((svc) => (
                        <div
                          key={svc.url}
                          className="flex items-center gap-2 px-2 py-1 rounded border border-border-subtle bg-bg-card/60"
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
              <div className="px-3 py-2 border-b border-border-subtle bg-bg-card/40 space-y-2">
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder={'Paste a JSON array of {name,url,...}\nor one "Name, URL" per line.'}
                  className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono resize-y"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setBulkText(null)}
                    className="px-2 py-1 text-[11px] rounded border border-border text-text-secondary hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={importBulk}
                    className="px-2 py-1 text-[11px] rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
                  >
                    Import
                  </button>
                </div>
              </div>
            )}
            {groupedView.map((section, sIdx) => {
              const sectionKey = section.group?.id ?? `__none_${sIdx}`;
              const isCollapsed = section.group ? collapsed.has(section.group.id) : false;
              return (
                <div key={sectionKey} className="border-b border-border-subtle">
                  {section.group ? (
                    <GroupHeader
                      group={section.group}
                      count={section.apps.length}
                      collapsed={isCollapsed}
                      onToggleCollapsed={() => toggleCollapsed(section.group!.id)}
                      autoFocus={pendingFocus === section.group.id}
                      onAutoFocused={() => setPendingFocus(null)}
                      onAddApp={() => addApp(section.group?.id)}
                      onPatch={(patch) => updateGroup(section.group!.id, patch)}
                      onRenameId={(newId) => renameGroupId(section.group!.id, newId)}
                      onDelete={() => removeGroup(section.group!.id)}
                    />
                  ) : (
                    <div className="flex items-center justify-between px-3 py-2 bg-bg-card/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] uppercase tracking-[0.08em] text-text-secondary font-semibold truncate">
                          Ungrouped
                        </span>
                        <span className="text-[10px] text-text-muted">{section.apps.length}</span>
                      </div>
                      <button
                        onClick={() => addApp(undefined)}
                        title="Add ungrouped service"
                        className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-accent/10"
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  )}
                  {!isCollapsed &&
                    section.apps.map((app) => (
                      <SidebarRow
                        key={app._key}
                        app={app}
                        selected={selectedKey === app._key}
                        onSelect={() => setSelectedKey(app._key)}
                        onRemove={() => removeApp(app._key)}
                        onDragStart={() => setDragKey(app._key)}
                        onDragEnd={() => setDragKey(null)}
                        onDrop={() => {
                          if (dragKey !== null && dragKey !== app._key) moveTo(dragKey, app._key);
                          setDragKey(null);
                        }}
                        isDragging={dragKey === app._key}
                      />
                    ))}
                </div>
              );
            })}
          </div>

          {/* Form */}
          <div className="overflow-auto p-5">
            {selected ? (
              <ServiceForm
                app={selected}
                groups={groups}
                onPatch={(patch) => update(selected._key, patch)}
                onPickIcon={() => setIconPickerFor(selected._key)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-[12px]">
                Select a service on the left, or add a new one.
              </div>
            )}
          </div>
        </div>
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

function GroupHeader({
  group,
  count,
  collapsed,
  autoFocus,
  onToggleCollapsed,
  onAutoFocused,
  onAddApp,
  onPatch,
  onDelete,
}: {
  group: GroupDef;
  count: number;
  collapsed: boolean;
  autoFocus: boolean;
  onToggleCollapsed: () => void;
  onAutoFocused: () => void;
  onAddApp: () => void;
  onPatch: (patch: Partial<GroupDef>) => void;
  onRenameId: (newId: string) => void;
  onDelete: () => void;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const nameRef = useRef<HTMLInputElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);

  // Keep local input in sync if the prop changes from elsewhere.
  useEffect(() => setName(group.name), [group.name]);

  // Auto-focus + select the name when this group was just created.
  useEffect(() => {
    if (autoFocus && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
      onAutoFocused();
    }
  }, [autoFocus, onAutoFocused]);

  // Close the color popover on outside click.
  useEffect(() => {
    if (!colorOpen) return;
    const onDown = (e: MouseEvent) => {
      if (colorBtnRef.current && !colorBtnRef.current.contains(e.target as Node)) {
        setColorOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colorOpen]);

  const palette = [
    "#7c3aed",
    "#a855f7",
    "#3b82f6",
    "#06b6d4",
    "#10b981",
    "#22c55e",
    "#eab308",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
    "#94a3b8",
    "#64748b",
  ];

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-bg-card/30 border-b border-border-subtle sticky top-[33px] z-10">
      <button
        onClick={onToggleCollapsed}
        className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text shrink-0"
        title={collapsed ? "Expand" : "Collapse"}
      >
        <ChevronIcon open={!collapsed} />
      </button>

      <button
        ref={colorBtnRef}
        onClick={() => setColorOpen((o) => !o)}
        className="relative inline-flex items-center justify-center w-4 h-4 shrink-0 rounded ring-1 ring-white/10 hover:ring-white/30 transition-shadow"
        style={{ background: group.color ?? "var(--color-border)" }}
        title="Change group color"
      >
        {colorOpen && (
          <div
            className="absolute top-full left-0 mt-2 z-30 bg-bg-elevated border border-border rounded-lg p-3 shadow-2xl ring-1 ring-white/5 w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-2">
              Color
            </div>
            <div className="grid grid-cols-4 gap-2">
              {palette.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onPatch({ color: c });
                    setColorOpen(false);
                  }}
                  className={`w-9 h-9 rounded-md transition-transform hover:scale-105 ${
                    group.color === c ? "ring-2 ring-offset-2 ring-offset-bg-elevated ring-white" : ""
                  }`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <button
              onClick={() => {
                onPatch({ color: undefined });
                setColorOpen(false);
              }}
              className="block w-full mt-3 px-2 py-1.5 text-[11px] text-text-secondary hover:text-text rounded border border-border-subtle hover:border-text-muted/70 hover:bg-bg-hover transition-colors"
            >
              No color
            </button>
          </div>
        )}
      </button>

      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const v = name.trim();
          if (v && v !== group.name) onPatch({ name: v });
          else if (!v) setName(group.name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setName(group.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="flex-1 min-w-0 px-1.5 py-1 text-[12px] font-medium bg-transparent border border-transparent hover:border-border-subtle focus:border-accent/40 focus:bg-bg-card rounded text-text focus:outline-none transition-colors"
      />

      <span className="text-[10px] text-text-muted shrink-0 tabular-nums px-0.5">{count}</span>

      <button
        onClick={onAddApp}
        title="Add service to this group"
        className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-accent/10"
      >
        <PlusIcon />
      </button>
      <button
        onClick={onDelete}
        title="Delete group"
        className="w-6 h-6 flex items-center justify-center rounded text-text-muted/50 hover:text-rose-400 hover:bg-rose-400/10"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SidebarRow({
  app,
  selected,
  onSelect,
  onRemove,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging,
}: {
  app: WorkingApp;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => {
        onDragEnd();
        setDragOver(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDrop();
      }}
      className={`group/row flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
        selected
          ? "bg-accent/10 border-l-2 border-accent"
          : dragOver
            ? "bg-bg-hover border-l-2 border-accent/40"
            : "border-l-2 border-transparent hover:bg-bg-card/40"
      } ${isDragging ? "opacity-40" : ""}`}
      onClick={onSelect}
    >
      <span className="text-text-muted/50 cursor-grab active:cursor-grabbing" title="Drag to reorder">
        <GripIcon />
      </span>
      <div className="w-6 h-6 flex items-center justify-center shrink-0">
        {app.icon ? (
          <SimpleIcon slug={app.icon} fill />
        ) : (
          <div
            className="w-full h-full rounded-sm text-[8px] font-semibold flex items-center justify-center text-text"
            style={{ background: hashColor(app.name) }}
          >
            {(app.name.slice(0, 2) || "??").toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-text truncate">{app.name || "(unnamed)"}</div>
        <div className="text-[10px] text-text-muted truncate font-mono">{app.id}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${app.name}"?`)) onRemove();
        }}
        className="w-5 h-5 flex items-center justify-center rounded text-text-muted/40 hover:text-rose-400 hover:bg-rose-400/10 opacity-0 group-hover/row:opacity-100"
        title="Delete service"
      >
        <TrashIcon />
      </button>
    </div>
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
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-3">
        <button
          onClick={onPickIcon}
          className="w-14 h-14 rounded-md border border-border-subtle bg-bg-card/40 flex items-center justify-center hover:border-accent/40 transition-colors group/icon"
          title="Change icon"
        >
          {app.icon ? (
            <SimpleIcon slug={app.icon} fill />
          ) : (
            <div
              className="w-10 h-10 rounded-sm text-[11px] font-semibold flex items-center justify-center text-text"
              style={{ background: hashColor(app.name || "?") }}
            >
              {(app.name.slice(0, 2) || "??").toUpperCase()}
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0 space-y-1">
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
        <Field label="ID" hint="stable; used in layouts. Lowercase, kebab-case.">
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

      <Field label="Icon" hint="simple-icons (si:), selfh.st (sh:), URL, or empty for initials.">
        <div className="flex gap-2">
          <input
            value={app.icon ?? ""}
            onChange={(e) => onPatch({ icon: e.target.value || undefined })}
            placeholder="sh:proxmox  ·  si:gitlab  ·  https://…"
            className="flex-1 px-2.5 py-1.5 text-[12.5px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50 font-mono"
          />
          <button
            onClick={onPickIcon}
            className="px-3 py-1.5 text-[11px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted whitespace-nowrap"
          >
            Browse…
          </button>
        </div>
      </Field>

      <div className="border-t border-border-subtle pt-4">
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
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          {label}
        </label>
        {hint && <span className="text-[10px] text-text-muted/70">{hint}</span>}
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

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
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
