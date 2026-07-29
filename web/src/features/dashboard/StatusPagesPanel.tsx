import { useEffect, useRef, useState } from "react";
import type { GroupDef, NoticeDef, StatusPageDef } from "../../api/types";

const COLORS = ["#0b0d13", "#111827", "#0f172a", "#1e293b", "#18181b", "#1a1a2e", "#0c4a6e", "#134e4a", "#3b0764", "#f6f7f9"];
const GRADIENTS = [
  "linear-gradient(135deg,#0f172a,#1e293b)",
  "linear-gradient(135deg,#111827,#0b1220)",
  "linear-gradient(135deg,#1e1b4b,#0f172a)",
  "linear-gradient(135deg,#0c4a6e,#082f49)",
  "linear-gradient(135deg,#134e4a,#042f2e)",
  "linear-gradient(135deg,#3b0764,#1e1b4b)",
  "linear-gradient(160deg,#0b0d13,#1f2937,#0b0d13)",
  "radial-gradient(circle at 30% 20%,#1e293b,#0b0d13)",
];
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
    if (p.width && p.width !== "narrow") c.width = p.width;
    if (p.accent?.trim()) c.accent = p.accent.trim();
    if (p.background?.type) {
      const b = p.background;
      c.background = { type: b.type };
      if (b.color) c.background.color = b.color;
      if (b.gradient) c.background.gradient = b.gradient;
      if (b.image) c.background.image = b.image;
      if (b.blur) c.background.blur = b.blur;
      if (b.dim) c.background.dim = b.dim;
    }
    if (p.groups?.length) c.groups = p.groups;
    if (p.apps?.length) c.apps = p.apps;
    if (p.enabled === false) c.enabled = false;
    if (p.public === true) c.public = true;
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
  // Appearance.
  const bg = cur?.background ?? {};
  const setBg = (patch: Partial<typeof bg>) => update({ background: { ...cur?.background, ...patch } });
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

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Theme</label>
                  <div className="flex gap-1">
                    {(["dark", "light"] as const).map((t) => (
                      <button key={t} onClick={() => update({ theme: t })} className={`px-2.5 py-1 text-[11px] rounded border capitalize transition-colors ${(cur.theme ?? "dark") === t ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Width</label>
                  <div className="flex gap-1">
                    {(["narrow", "wide", "full"] as const).map((wv) => (
                      <button key={wv} onClick={() => update({ width: wv })} className={`px-2.5 py-1 text-[11px] rounded border capitalize transition-colors ${(cur.width ?? "narrow") === wv ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"}`}>{wv}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Accent</label>
                  <input type="color" value={cur.accent || "#818cf8"} onChange={(e) => update({ accent: e.target.value })} className="w-7 h-7 rounded bg-transparent border border-border cursor-pointer" />
                  {cur.accent && <button onClick={() => update({ accent: undefined })} className="text-[10px] text-text-muted hover:text-text">reset</button>}
                </div>
              </div>

              {/* Background */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Background</label>
                <div className="flex gap-1 flex-wrap">
                  {([["", "None"], ["color", "Color"], ["gradient", "Gradient"], ["image", "Image"]] as const).map(([t, lbl]) => (
                    <button key={t} onClick={() => setBg({ type: t || undefined })} className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${(bg.type ?? "") === t ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"}`}>{lbl}</button>
                  ))}
                </div>
                {bg.type === "color" && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLORS.map((c) => (
                      <button key={c} onClick={() => setBg({ color: c })} title={c} className={`w-7 h-7 rounded border ${bg.color === c ? "ring-2 ring-accent border-accent" : "border-border"}`} style={{ background: c }} />
                    ))}
                    <input type="color" value={bg.color || "#0b0d13"} onChange={(e) => setBg({ color: e.target.value })} className="w-8 h-7 rounded bg-transparent border border-border cursor-pointer" title="custom" />
                  </div>
                )}
                {bg.type === "gradient" && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5 flex-wrap">
                      {GRADIENTS.map((g) => (
                        <button
                          key={g}
                          onClick={() => setBg({ gradient: g })}
                          title={g}
                          className={`w-9 h-7 rounded border ${bg.gradient === g ? "ring-2 ring-accent border-accent" : "border-border"}`}
                          style={{ background: g }}
                        />
                      ))}
                    </div>
                    <input value={bg.gradient ?? ""} onChange={(e) => setBg({ gradient: e.target.value })} placeholder="linear-gradient(135deg,#1e293b,#0f172a)" className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent" />
                  </div>
                )}
                {bg.type === "image" && (
                  <div className="space-y-2">
                    <input value={bg.image ?? ""} onChange={(e) => setBg({ image: e.target.value })} placeholder="https://…/bg.jpg or data: URI" className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent" />
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-[11px] text-text-muted flex-1">
                        Blur
                        <input type="range" min={0} max={20} value={bg.blur ?? 0} onChange={(e) => setBg({ blur: parseInt(e.target.value) })} className="flex-1 accent-accent" />
                        <span className="w-6 tabular-nums">{bg.blur ?? 0}</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] text-text-muted flex-1">
                        Dim
                        <input type="range" min={0} max={90} value={bg.dim ?? 0} onChange={(e) => setBg({ dim: parseInt(e.target.value) })} className="flex-1 accent-accent" />
                        <span className="w-8 tabular-nums">{bg.dim ?? 0}%</span>
                      </label>
                    </div>
                  </div>
                )}
                {(bg.type === "color" || bg.type === "gradient") && (
                  <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    Dim
                    <input type="range" min={0} max={90} value={bg.dim ?? 0} onChange={(e) => setBg({ dim: parseInt(e.target.value) })} className="flex-1 accent-accent" />
                    <span className="w-8 tabular-nums">{bg.dim ?? 0}%</span>
                  </label>
                )}
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
                <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer" title="When login is enabled: serve this page publicly (no sign-in). Off = requires a logged-in user. No effect when auth is disabled.">
                  <input type="checkbox" checked={cur.public === true} onChange={(e) => update({ public: e.target.checked })} className="accent-accent" />
                  Public (no login)
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
