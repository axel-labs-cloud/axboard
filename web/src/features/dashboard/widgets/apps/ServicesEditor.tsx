import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import type { AppDef, Config, GroupDef } from "../../../../api/types";
import { SimpleIcon } from "../../SimpleIcon";
import { IconPicker } from "./IconPicker";

interface Props {
  open: boolean;
  onClose: () => void;
}

type WorkingApp = AppDef & { _key: number };
type WorkingGroup = GroupDef;

let nextKey = 1;
const keyed = (a: AppDef): WorkingApp => ({ ...a, _key: nextKey++ });

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

  // Seed local state when the modal opens.
  useEffect(() => {
    if (!open) return;
    const seedApps = (cached?.apps ?? []).map(keyed);
    setApps(seedApps);
    setGroups(cached?.groups ?? []);
    setSelectedKey(seedApps[0]?._key ?? null);
    setError(null);
    setDirty(false);
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

  const selected = selectedKey !== null ? apps.find((a) => a._key === selectedKey) : null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={() => {
        if (!dirty || confirm("Discard unsaved changes?")) onClose();
      }}
    >
      <div
        className="bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col ring-1 ring-white/5"
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
        <div className="flex-1 grid grid-cols-[minmax(280px,340px)_1fr] min-h-0">
          {/* Sidebar list */}
          <div className="border-r border-border-subtle overflow-auto">
            {groupedView.map((section, sIdx) => (
              <div key={section.group?.id ?? `__none_${sIdx}`} className="border-b border-border-subtle">
                <div className="flex items-center justify-between px-3 py-2 sticky top-0 bg-bg-elevated z-10">
                  <div className="flex items-center gap-2 min-w-0">
                    {section.group?.color && (
                      <span
                        className="inline-block w-1.5 h-3.5 rounded-sm shrink-0"
                        style={{ background: section.group.color }}
                      />
                    )}
                    <span className="text-[10px] uppercase tracking-[0.08em] text-text-secondary font-semibold truncate">
                      {section.group?.name ?? "Ungrouped"}
                    </span>
                    <span className="text-[10px] text-text-muted">{section.apps.length}</span>
                  </div>
                  <button
                    onClick={() => addApp(section.group?.id)}
                    title="Add service to this group"
                    className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-accent/10"
                  >
                    <PlusIcon />
                  </button>
                </div>
                {section.apps.map((app) => (
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
            ))}
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
    </div>
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

  const healthType = (app.health?.type ?? "none") as "http" | "tcp" | "none";

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
                const t = e.target.value as "http" | "tcp" | "none";
                if (t === "none") onPatch({ health: undefined });
                else if (t === "http")
                  onPatch({ health: { type: "http", url: app.url, interval: "60s" } });
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
            </select>

            {healthType === "http" && (
              <>
                <input
                  value={app.health?.url ?? ""}
                  onChange={(e) =>
                    onPatch({ health: { ...app.health!, type: "http", url: e.target.value } })
                  }
                  placeholder="https://service/health"
                  className="w-full px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50 font-mono"
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
          </div>
        </Field>
      </div>
    </div>
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

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 35%, 25%)`;
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
