import { useState } from "react";
import type { GroupDef, StatusPageDef } from "../../api/types";

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
    if (p.enabled === false) c.enabled = false;
    return c;
  });
}

export function StatusPagesForm({
  pages,
  groups,
  onSave,
  onClose,
}: {
  pages: StatusPageDef[] | undefined;
  groups: GroupDef[];
  onSave: (pages: StatusPageDef[]) => void;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState<StatusPageDef[]>(() =>
    pages && pages.length ? structuredClone(pages) : [{ slug: "", title: "" }],
  );
  const [sel, setSel] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [saved, setSaved] = useState(false);

  const cur = draft[Math.min(sel, draft.length - 1)] ?? draft[0];
  const update = (patch: Partial<StatusPageDef>) => {
    setDraft((d) => d.map((p, i) => (i === sel ? { ...p, ...patch } : p)));
    setSaved(false);
  };
  const addPage = () => {
    setDraft((d) => [...d, { slug: `page-${d.length + 1}`, title: "New page" }]);
    setSel(draft.length);
    setSaved(false);
  };
  const removePage = (i: number) => {
    setDraft((d) => d.filter((_, j) => j !== i));
    setSel((s) => Math.max(0, s - (i <= s ? 1 : 0)));
    setSaved(false);
  };
  const save = () => {
    onSave(clean(draft));
    setSaved(true);
    setTimeout(() => setPreviewKey((k) => k + 1), 300); // reload preview after config lands
  };

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
            <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Preview{saved ? "" : " · save to refresh"}</span>
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
        <span className="text-[11px] text-text-muted">Public pages — anyone who can reach axboard can view them.</span>
        <div className="ml-auto flex items-center gap-2">
          {onClose && <button onClick={onClose} className="px-3 py-1.5 text-[12px] rounded text-text-muted hover:text-text">Close</button>}
          <button onClick={save} className="px-3 py-1.5 text-[12px] rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
            {saved ? "Saved ✓" : "Save"}
          </button>
        </div>
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
