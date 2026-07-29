import { useEffect, useRef, useState } from "react";
import type { GroupDef, NoticeDef, StatusPageDef } from "../../api/types";

const SEVERITIES = ["info", "warning", "critical", "maintenance"] as const;
const SEV_COLOR: Record<string, string> = {
  info: "text-blue-400 border-blue-400/40",
  warning: "text-degraded border-degraded/40",
  critical: "text-down border-down/40",
  maintenance: "text-violet-400 border-violet-400/40",
};

// ---------------------------------------------------------------------------
// Status-pages editor — manage one or more public /status pages from the UI:
// title, header/footer text, theme, group filter, hide-branding, and a live
// iframe preview of the server-rendered page. Embedded as a tab in the Services
// editor.
// ---------------------------------------------------------------------------

function pageUrl(p: StatusPageDef): string {
  const s = (p.slug ?? "").trim().toLowerCase();
  return s && s !== "default" ? `/status/${encodeURIComponent(s)}` : "/status";
}

function clean(pages: StatusPageDef[]): StatusPageDef[] {
  return pages.map((p) => {
    const c: StatusPageDef = {};
    if (p.slug?.trim()) c.slug = p.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    if (p.title?.trim()) c.title = p.title.trim();
    if (p.header?.trim()) c.header = p.header;
    if (p.footer?.trim()) c.footer = p.footer;
    if (p.hide_branding) c.hide_branding = true;
    if (p.theme && p.theme !== "dark") c.theme = p.theme;
    if (p.groups?.length) c.groups = p.groups;
    if (p.apps?.length) c.apps = p.apps;
    if (p.enabled === false) c.enabled = false;
    const notices = (p.notices ?? []).filter((n) => n.title?.trim() || n.message?.trim());
    if (notices.length) c.notices = notices;
    return c;
  });
}

export function StatusPagesForm({
  pages,
  groups,
  apps = [],
  onSave,
  onClose,
}: {
  pages: StatusPageDef[] | undefined;
  groups: GroupDef[];
  apps?: { id: string; name: string; group?: string }[];
  onSave: (pages: StatusPageDef[]) => void;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState<StatusPageDef[]>(() =>
    pages && pages.length ? structuredClone(pages) : [{ slug: "", title: "" }],
  );
  const [sel, setSel] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);

  // Auto-save (debounced) so the server-rendered preview always reflects the
  // current draft — no manual save needed to preview a new/edited page.
  const first = useRef(true);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      onSave(clean(draft));
      window.setTimeout(() => setPreviewKey((k) => k + 1), 250);
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const cur = draft[Math.min(sel, draft.length - 1)] ?? draft[0];
  const update = (patch: Partial<StatusPageDef>) => setDraft((d) => d.map((p, i) => (i === sel ? { ...p, ...patch } : p)));
  const addPage = () => {
    setDraft((d) => [...d, { slug: `page-${d.length + 1}`, title: "New page" }]);
    setSel(draft.length);
  };
  const removePage = (i: number) => {
    setDraft((d) => d.filter((_, j) => j !== i));
    setSel((s) => Math.max(0, s - (i <= s ? 1 : 0)));
  };

  // Per-service selection. An empty list means "all"; the first untick
  // materialises the full list minus that service. Re-ticking everything
  // collapses back to "all" (empty).
  const appSel = new Set(cur?.apps ?? []);
  const toggleApp = (id: string) => {
    const next = new Set(appSel.size ? appSel : apps.map((a) => a.id));
    next.has(id) ? next.delete(id) : next.add(id);
    update({ apps: next.size === apps.length ? [] : [...next] });
  };
  // Notices.
  const notices = cur?.notices ?? [];
  const setNotices = (n: NoticeDef[]) => update({ notices: n });
  const addNotice = () => setNotices([...notices, { severity: "info", title: "", message: "" }]);
  const updNotice = (i: number, patch: Partial<NoticeDef>) => setNotices(notices.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const delNotice = (i: number) => setNotices(notices.filter((_, j) => j !== i));

  const groupSel = new Set(cur?.groups ?? []);
  const toggleGroup = (id: string) => {
    const next = new Set(groupSel);
    next.has(id) ? next.delete(id) : next.add(id);
    update({ groups: [...next] });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* Left: page list + editor */}
        <div className="min-h-0 overflow-auto pr-1 space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {draft.map((p, i) => (
              <button
                key={i}
                onClick={() => setSel(i)}
                className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
                  i === sel ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
                }`}
              >
                {p.title?.trim() || (p.slug?.trim() ? `/${p.slug}` : "/status")}
              </button>
            ))}
            <button onClick={addPage} className="px-2 py-1 text-[11px] rounded border border-dashed border-border text-text-muted hover:text-text">
              + Page
            </button>
          </div>

          {cur && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <F label="Title" value={cur.title ?? ""} onChange={(v) => update({ title: v })} placeholder="Service status" />
                <F label="Slug (URL)" value={cur.slug ?? ""} onChange={(v) => update({ slug: v })} placeholder="empty = /status" />
              </div>
              <T label="Header text (under the title)" value={cur.header ?? ""} onChange={(v) => update({ header: v })} placeholder="e.g. Real-time status of our services" />
              <T label="Footer text (blank = default / branding)" value={cur.footer ?? ""} onChange={(v) => update({ footer: v })} placeholder="© 2026 Axel Labs" />

              <div className="flex items-center gap-4">
                <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Theme</label>
                <div className="flex gap-1">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => update({ theme: t })}
                      className={`px-2.5 py-1 text-[11px] rounded border capitalize transition-colors ${
                        (cur.theme ?? "dark") === t ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {groups.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Include groups (none = all)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => toggleGroup(g.id)}
                        className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                          groupSel.has(g.id) ? "bg-accent/15 border-accent text-accent" : "bg-bg-card border-border text-text-muted hover:text-text"
                        }`}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {apps.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
                    Include services (none = all){groupSel.size > 0 ? " · in selected groups" : ""}
                  </label>
                  <div className="max-h-44 overflow-auto rounded border border-border-subtle divide-y divide-border-subtle">
                    {(groupSel.size > 0 ? apps.filter((a) => a.group && groupSel.has(a.group)) : apps).map((a) => (
                      <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-text-secondary cursor-pointer hover:bg-bg-hover">
                        <input type="checkbox" checked={appSel.size === 0 || appSel.has(a.id)} onChange={() => toggleApp(a.id)} className="accent-accent" />
                        <span className="flex-1 truncate">{a.name}</span>
                        {a.group && <span className="text-[10px] text-text-muted">{groups.find((g) => g.id === a.group)?.name ?? a.group}</span>}
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-text-muted">Groups pick whole categories; untick a service to hide just it.</p>
                </div>
              )}

              {/* Manual announcements / incidents / maintenance banners. */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Notices / announcements</label>
                  <button onClick={addNotice} className="text-[11px] text-accent hover:underline">+ Notice</button>
                </div>
                {notices.length === 0 && <p className="text-[10px] text-text-muted">Post a maintenance window, incident, or upcoming-change banner.</p>}
                {notices.map((n, i) => (
                  <div key={i} className="rounded border border-border-subtle p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-1 flex-wrap flex-1">
                        {SEVERITIES.map((sv) => (
                          <button
                            key={sv}
                            onClick={() => updNotice(i, { severity: sv })}
                            className={`px-1.5 py-0.5 text-[10px] rounded border capitalize transition-colors ${
                              (n.severity ?? "info") === sv ? SEV_COLOR[sv] + " bg-white/5" : "border-border text-text-muted hover:text-text"
                            }`}
                          >
                            {sv}
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer">
                        <input type="checkbox" checked={n.active !== false} onChange={(e) => updNotice(i, { active: e.target.checked })} className="accent-accent" />
                        on
                      </label>
                      <button onClick={() => delNotice(i)} className="text-text-muted hover:text-down text-[12px] px-1">✕</button>
                    </div>
                    <input value={n.title ?? ""} onChange={(e) => updNotice(i, { title: e.target.value })} placeholder="Title (e.g. Scheduled maintenance)" className="w-full px-2 py-1 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent" />
                    <textarea value={n.message ?? ""} onChange={(e) => updNotice(i, { message: e.target.value })} placeholder="Message…" rows={2} className="w-full px-2 py-1 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent resize-y" />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 pt-0.5">
                <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
                  <input type="checkbox" checked={cur.hide_branding ?? false} onChange={(e) => update({ hide_branding: e.target.checked })} className="accent-accent" />
                  Hide “Powered by axboard”
                </label>
                <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
                  <input type="checkbox" checked={cur.enabled !== false} onChange={(e) => update({ enabled: e.target.checked })} className="accent-accent" />
                  Enabled
                </label>
              </div>

              {draft.length > 1 && (
                <button onClick={() => removePage(sel)} className="text-[11px] text-text-muted hover:text-down">Delete this page</button>
              )}
            </div>
          )}
        </div>

        {/* Right: live preview */}
        <div className="min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Live preview</span>
            <a href={cur ? pageUrl(cur) : "/status"} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">Open ↗</a>
          </div>
          <iframe
            key={previewKey}
            src={cur ? pageUrl(cur) : "/status"}
            title="Status preview"
            className="flex-1 w-full rounded-lg border border-border-subtle bg-white/5"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-border-subtle shrink-0">
        <span className="text-[11px] text-text-muted">Saved automatically · public — anyone who can reach axboard can view these pages.</span>
        {onClose && <button onClick={onClose} className="ml-auto px-3 py-1.5 text-[12px] rounded text-text-muted hover:text-text">Close</button>}
      </div>
    </div>
  );
}

function F({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent" />
    </label>
  );
}
function T({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent resize-y" />
    </label>
  );
}
