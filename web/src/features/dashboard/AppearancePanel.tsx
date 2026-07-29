import { useState } from "react";
import { createPortal } from "react-dom";
import type { AppDef, BackgroundDef, HeaderDef } from "../../api/types";
import { api } from "../../api/client";
import { SimpleIcon } from "./SimpleIcon";
import { ACCENT_PRESETS, BAR_STYLES, GRADIENT_PRESETS } from "./appearance";
import { loadCustomCss, saveCustomCss } from "../../hooks/customCss";
import { THEMES } from "../../hooks/themes";
import {
  CUSTOM_VARS,
  DEFAULT_CUSTOM_VARS,
  loadCustomThemes,
  saveCustomThemes,
  type CustomTheme,
} from "../../hooks/customThemes";
import { loadWidgetStyle, saveWidgetStyle, type WidgetStyle } from "../../hooks/widgetStyle";
import { FONT_OPTIONS, loadFont, saveFont } from "../../hooks/fontStyle";

// ---------------------------------------------------------------------------
// AppearancePanel — a right-side drawer (transparent scrim so the live
// background stays visible while you edit) for the active dashboard's
// background, top-bar style, branding, header widgets and bookmark launchers.
// Changes persist immediately (debounced) via the callbacks.
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
  background?: BackgroundDef;
  onSetBackground: (bg: BackgroundDef | undefined) => void;
  barStyle?: string;
  onSetBarStyle: (style: string) => void;
  header?: HeaderDef;
  onSetHeader: (header: HeaderDef | undefined) => void;
  apps: AppDef[];
  theme: string;
  setTheme: (t: string) => void;
  accent?: string;
  onSetAccent: (color: string) => void;
  density: string;
  onSetDensity: (d: string) => void;
}

const BG_TYPES: { id: BackgroundDef["type"] | "none"; label: string }[] = [
  { id: "none", label: "None" },
  { id: "color", label: "Color" },
  { id: "gradient", label: "Gradient" },
  { id: "image", label: "Image" },
];

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-1.5">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border-subtle pt-3.5 first:border-t-0 first:pt-0">
      <div className="text-[12px] font-semibold text-text-secondary mb-2">{title}</div>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  );
}

const RADIUS_PRESETS: { label: string; value: number }[] = [
  { label: "Square", value: 0 },
  { label: "Soft", value: 6 },
  { label: "Rounded", value: 12 },
  { label: "Pill", value: 20 },
];

function FontSection() {
  const [font, setFont] = useState<string>(() => loadFont());
  const pick = (id: string) => {
    setFont(id);
    saveFont(id);
  };
  return (
    <Section title="Font">
      <div className="grid grid-cols-3 gap-1.5">
        {FONT_OPTIONS.map((f) => (
          <button
            key={f.id}
            onClick={() => pick(f.id)}
            style={f.stack ? { fontFamily: f.stack } : undefined}
            className={`px-2 py-2 rounded text-[12px] border transition-colors ${
              font === f.id ? "bg-accent/15 border-accent text-accent" : "bg-bg-elevated border-border text-text-muted hover:text-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function WidgetStyleSection() {
  const [ws, setWs] = useState<WidgetStyle>(() => loadWidgetStyle());
  const update = (p: Partial<WidgetStyle>) => {
    const next = { ...ws, ...p };
    setWs(next);
    saveWidgetStyle(next); // applies + persists immediately (live preview)
  };
  return (
    <Section title="Widget style">
      <div className="space-y-3">
        <div>
          <Label>Opacity · {ws.opacity}%</Label>
          <input type="range" min={20} max={100} value={ws.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} className="w-full accent-accent" />
        </div>
        <div>
          <Label>Backdrop blur · {ws.blur}px</Label>
          <input type="range" min={0} max={24} value={ws.blur} onChange={(e) => update({ blur: Number(e.target.value) })} className="w-full accent-accent" />
        </div>
        <div>
          <Label>Corners</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {RADIUS_PRESETS.map((r) => (
              <button key={r.value} onClick={() => update({ radius: r.value })} className={`px-2 py-1.5 text-[11px] border transition-colors ${ws.radius === r.value ? "bg-accent/15 border-accent text-accent" : "bg-bg-elevated border-border text-text-muted hover:text-text"}`} style={{ borderRadius: Math.min(r.value, 8) }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <Check label="Show widget border" checked={ws.border} onChange={(v) => update({ border: v })} />
      </div>
    </Section>
  );
}

function CustomCssSection() {
  const [css, setCss] = useState<string>(() => loadCustomCss());
  return (
    <Section title="Custom CSS">
      <p className="text-[10px] text-text-muted mb-1.5 leading-snug">Advanced — injected globally. Target theme vars or any selector.</p>
      <textarea
        value={css}
        onChange={(e) => { setCss(e.target.value); saveCustomCss(e.target.value); }}
        spellCheck={false}
        placeholder={":root { --color-accent: #f0f; }\n.widget-card { box-shadow: 0 0 0 1px #0ff; }"}
        rows={5}
        className="w-full px-2 py-1.5 rounded bg-bg-elevated border border-border text-[11px] text-text font-mono focus:outline-none focus:border-accent resize-y"
      />
    </Section>
  );
}

function ThemesTab({
  theme,
  setTheme,
  density,
  onSetDensity,
}: {
  theme: string;
  setTheme: (t: string) => void;
  density: string;
  onSetDensity: (d: string) => void;
}) {
  const [customs, setCustoms] = useState<CustomTheme[]>(() => loadCustomThemes());
  const [draft, setDraft] = useState<CustomTheme | null>(null);

  const persist = (next: CustomTheme[]) => {
    setCustoms(next);
    saveCustomThemes(next);
  };
  const exportThemes = () => {
    const blob = new Blob([JSON.stringify(customs, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "axboard-themes.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importThemes = async (file: File) => {
    try {
      const list = JSON.parse(await file.text());
      if (!Array.isArray(list)) throw new Error("not a list");
      const byId = new Map(customs.map((c) => [c.id, c]));
      for (const t of list) if (t?.id && t?.vars) byId.set(t.id, t as CustomTheme);
      persist([...byId.values()]);
    } catch {
      alert("Invalid theme file.");
    }
  };
  const startNew = () =>
    setDraft({ id: `custom-${Date.now().toString(36)}`, label: "My theme", vars: { ...DEFAULT_CUSTOM_VARS } });
  const startEdit = (t: CustomTheme) => setDraft({ ...t, vars: { ...DEFAULT_CUSTOM_VARS, ...t.vars } });
  const saveDraft = () => {
    if (!draft) return;
    const exists = customs.some((c) => c.id === draft.id);
    persist(exists ? customs.map((c) => (c.id === draft.id ? draft : c)) : [...customs, draft]);
    setTheme(draft.id); // apply immediately
    setDraft(null);
  };
  const remove = (id: string) => {
    persist(customs.filter((c) => c.id !== id));
    if (theme === id) setTheme("midnight");
  };

  return (
    <div className="p-4 space-y-4">
      <Section title="Built-in themes">
        <div className="grid grid-cols-3 gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              title={t.label}
              className={`flex flex-col items-center gap-1 rounded-md p-1.5 border transition-colors ${
                theme === t.id ? "border-accent/50 bg-accent/10" : "border-border-subtle hover:border-border hover:bg-bg-hover"
              }`}
            >
              <span className="w-full h-6 rounded flex items-center justify-end px-1 ring-1 ring-black/20" style={{ background: t.bg }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.accent }} />
                <span className="w-2.5 h-4 rounded-sm ml-0.5" style={{ background: t.surface }} />
              </span>
              <span className="text-[10px] text-text-secondary truncate max-w-full">{t.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Board density">
        <div className="inline-flex p-0.5 rounded-md border border-border-subtle bg-bg-card w-full">
          {(["compact", "cozy", "spacious"] as const).map((d) => (
            <button
              key={d}
              onClick={() => onSetDensity(d)}
              className={`flex-1 px-2 py-1 text-[11px] rounded capitalize transition-colors ${
                density === d ? "bg-bg-elevated text-text shadow-sm" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-1.5">Remembered per theme.</p>
      </Section>

      <Section title="Custom themes">
        {customs.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {customs.map((t) => (
              <div key={t.id} className={`relative rounded-md p-1.5 border ${theme === t.id ? "border-accent/50 bg-accent/10" : "border-border-subtle"}`}>
                <button onClick={() => setTheme(t.id)} title={t.label} className="w-full flex flex-col items-center gap-1">
                  <span className="w-full h-6 rounded flex items-center justify-end px-1 ring-1 ring-black/20" style={{ background: t.vars["--color-bg"] }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.vars["--color-accent"] }} />
                    <span className="w-2.5 h-4 rounded-sm ml-0.5" style={{ background: t.vars["--color-bg-card"] }} />
                  </span>
                  <span className="text-[10px] text-text-secondary truncate max-w-full">{t.label}</span>
                </button>
                <div className="flex justify-center gap-2 mt-1">
                  <button onClick={() => startEdit(t)} className="text-[10px] text-text-muted hover:text-text">edit</button>
                  <button onClick={() => remove(t.id)} className="text-[10px] text-text-muted hover:text-danger">delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {draft ? (
          <div className="rounded-lg border border-border p-3 space-y-3 bg-bg-elevated/40">
            <input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Theme name"
              className="w-full px-2 py-1.5 rounded bg-bg-elevated border border-border text-[12px] text-text focus:outline-none focus:border-accent"
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {CUSTOM_VARS.map((v) => (
                <label key={v.key} className="flex items-center gap-2 text-[11px] text-text-secondary">
                  <input
                    type="color"
                    value={draft.vars[v.key] ?? "#000000"}
                    onChange={(e) => setDraft({ ...draft, vars: { ...draft.vars, [v.key]: e.target.value } })}
                    className="w-6 h-6 rounded bg-transparent border border-border cursor-pointer shrink-0"
                  />
                  <span className="truncate">{v.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveDraft} className="flex-1 px-2 py-1.5 rounded bg-accent/15 border border-accent text-accent text-[12px]">Save & apply</button>
              <button onClick={() => setDraft(null)} className="px-3 py-1.5 rounded border border-border text-text-muted hover:text-text text-[12px]">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={startNew} className="w-full px-2 py-2 rounded border border-dashed border-border text-text-muted hover:text-text hover:border-text-muted text-[12px] transition-colors">
            + New custom theme
          </button>
        )}
        <div className="flex gap-3 mt-2">
          <button onClick={exportThemes} disabled={customs.length === 0} className="text-[11px] text-text-muted hover:text-text disabled:opacity-40">Export</button>
          <label className="text-[11px] text-text-muted hover:text-text cursor-pointer">
            Import
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importThemes(f); e.target.value = ""; }} />
          </label>
        </div>
      </Section>

      <FontSection />
      <WidgetStyleSection />
      <CustomCssSection />
    </div>
  );
}

export function AppearancePanel(props: Props) {
  const { open, onClose, background, onSetBackground, barStyle, onSetBarStyle, header, onSetHeader, apps, theme, setTheme, accent, onSetAccent, density, onSetDensity } = props;
  const [tab, setTab] = useState<"dashboard" | "themes">("dashboard");
  const bg = background ?? {};
  const type = bg.type ?? "none";
  const hdr = header ?? {};
  const patchBg = (p: Partial<BackgroundDef>) => onSetBackground({ ...bg, ...p });
  const patchHeader = (p: Partial<HeaderDef>) => onSetHeader({ ...hdr, ...p });

  const [cityQ, setCityQ] = useState(hdr.weatherCity ?? "");
  const [cityHits, setCityHits] = useState<{ name: string; country?: string; latitude: number; longitude: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const searchCity = async () => {
    if (!cityQ.trim()) return;
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQ.trim())}&count=5`);
    const d = await r.json();
    setCityHits(d.results ?? []);
  };
  const uploadBg = async (file: File) => {
    setUploading(true);
    try {
      const url = await api.uploadIcon(file);
      patchBg({ type: "image", image: url });
    } catch (e) {
      alert(`Upload failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setUploading(false);
    }
  };
  const [logoBusy, setLogoBusy] = useState(false);
  const uploadLogo = async (file: File) => {
    setLogoBusy(true);
    try {
      patchHeader({ brandLogo: await api.uploadIcon(file) });
    } catch (e) {
      alert(`Upload failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLogoBusy(false);
    }
  };

  const links = hdr.links ?? [];
  const toggleLink = (id: string) =>
    patchHeader({ links: links.includes(id) ? links.filter((x) => x !== id) : [...links, id] });

  if (!open) return null;

  return createPortal(
    // Transparent scrim — no dim/blur so the live background is visible while
    // editing. Clicking the scrim (not the drawer) closes.
    <div
      className="fixed inset-0 z-[100]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute right-0 top-0 h-full w-[360px] max-w-[92vw] bg-bg-card/95 backdrop-blur-sm border-l border-border shadow-2xl overflow-auto flex flex-col">
        <div className="sticky top-0 bg-bg-card/95 z-10 border-b border-border-subtle">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[14px] font-semibold text-text">Appearance</h2>
            <button onClick={onClose} className="text-text-muted hover:text-text text-lg leading-none px-1">×</button>
          </div>
          <div className="flex px-2 gap-1">
            {(["dashboard", "themes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-[12px] rounded-t border-b-2 -mb-px transition-colors capitalize ${
                  tab === t ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === "themes" && <ThemesTab theme={theme} setTheme={setTheme} density={density} onSetDensity={onSetDensity} />}

        <div className={`p-4 space-y-4 ${tab === "dashboard" ? "" : "hidden"}`}>
          {/* -------- Accent (per-dashboard) -------- */}
          <Section title="Accent color">
            <div className="flex flex-wrap gap-1.5 items-center">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => onSetAccent(c)}
                  title={c}
                  style={{ background: c }}
                  className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${accent === c ? "ring-2 ring-offset-1 ring-offset-bg-card ring-accent border-transparent" : "border-black/20"}`}
                />
              ))}
              <label className="w-6 h-6 rounded-full border border-border overflow-hidden cursor-pointer relative" title="Custom">
                <input type="color" value={accent ?? "#818cf8"} onChange={(e) => onSetAccent(e.target.value)} className="absolute inset-0 w-[150%] h-[150%] -translate-x-2 -translate-y-2 cursor-pointer" />
              </label>
              {accent && (
                <button onClick={() => onSetAccent("")} className="text-[11px] text-text-muted hover:text-text ml-1">reset</button>
              )}
            </div>
          </Section>

          {/* -------- Background -------- */}
          <Section title="Background">
            <div className="flex gap-1 mb-3">
              {BG_TYPES.map((t) => {
                const active = type === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => (t.id === "none" ? onSetBackground(undefined) : patchBg({ type: t.id }))}
                    className={`flex-1 px-2 py-1.5 rounded text-[11px] border transition-colors ${
                      active ? "bg-accent/15 border-accent text-accent" : "bg-bg-elevated border-border text-text-muted hover:text-text"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {type === "color" && (
              <div className="flex items-center gap-2">
                <input type="color" value={bg.color ?? "#0b1120"} onChange={(e) => patchBg({ color: e.target.value })} className="w-10 h-8 rounded bg-transparent border border-border cursor-pointer" />
                <input value={bg.color ?? ""} onChange={(e) => patchBg({ color: e.target.value })} placeholder="#0b1120 or any CSS color" className="flex-1 px-2 py-1.5 rounded bg-bg-elevated border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent" />
              </div>
            )}

            {type === "gradient" && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {GRADIENT_PRESETS.map((g) => (
                    <button key={g.name} onClick={() => patchBg({ gradient: g.value })} title={g.name} style={{ background: g.value }} className={`h-9 rounded border transition-transform hover:scale-105 ${bg.gradient === g.value ? "border-accent ring-1 ring-accent" : "border-border"}`} />
                  ))}
                </div>
                <input value={bg.gradient ?? ""} onChange={(e) => patchBg({ gradient: e.target.value })} placeholder="custom: linear-gradient(...)" className="w-full px-2 py-1.5 rounded bg-bg-elevated border border-border text-[11px] text-text font-mono focus:outline-none focus:border-accent" />
              </div>
            )}

            {type === "image" && (
              <div className="space-y-2.5">
                <div className="flex gap-1.5">
                  <input value={bg.image ?? ""} onChange={(e) => patchBg({ image: e.target.value })} placeholder="https://…/photo.jpg" className="flex-1 min-w-0 px-2 py-1.5 rounded bg-bg-elevated border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent" />
                  <label className={`px-3 py-1.5 text-[11px] rounded border border-border cursor-pointer whitespace-nowrap ${uploading ? "opacity-50" : "text-text-secondary hover:text-text"}`}>
                    {uploading ? "…" : "Upload"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBg(f); e.target.value = ""; }} />
                  </label>
                </div>
                {bg.image && (
                  <div className="relative h-16 rounded border border-border-subtle bg-cover bg-center" style={{ backgroundImage: `url("${bg.image}")` }}>
                    <button
                      onClick={() => patchBg({ image: undefined })}
                      title="Remove image"
                      className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded bg-black/60 text-white/90 hover:bg-black/80 text-sm leading-none"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div>
                  <Label>Fit</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["cover", "contain", "tile"] as const).map((f) => (
                      <button key={f} onClick={() => patchBg({ fit: f })} className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${(bg.fit ?? "cover") === f ? "bg-accent/15 border-accent text-accent" : "bg-bg-elevated border-border text-text-muted hover:text-text"}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Blur · {bg.blur ?? 0}px</Label>
                  <input type="range" min={0} max={20} value={bg.blur ?? 0} onChange={(e) => patchBg({ blur: Number(e.target.value) })} className="w-full accent-accent" />
                </div>
                <div>
                  <Label>Dim · {bg.dim ?? 0}%</Label>
                  <input type="range" min={0} max={80} value={bg.dim ?? 0} onChange={(e) => patchBg({ dim: Number(e.target.value) })} className="w-full accent-accent" />
                </div>
              </div>
            )}

            {type !== "none" && (
              <div className="mt-3">
                <Label>Opacity · {bg.opacity && bg.opacity > 0 ? bg.opacity : 100}%</Label>
                <input type="range" min={20} max={100} value={bg.opacity && bg.opacity > 0 ? bg.opacity : 100} onChange={(e) => patchBg({ opacity: Number(e.target.value) })} className="w-full accent-accent" />
              </div>
            )}
          </Section>

          {/* -------- Top-bar style -------- */}
          <Section title="Top bar style">
            <div className="grid grid-cols-2 gap-1.5">
              {BAR_STYLES.map((s) => {
                const active = (barStyle ?? "default") === s.id;
                return (
                  <button key={s.id} onClick={() => onSetBarStyle(s.id)} className={`px-2 py-2 rounded text-[11px] border transition-colors ${active ? "bg-accent/15 border-accent text-accent" : "bg-bg-elevated border-border text-text-muted hover:text-text"}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer mt-2.5">
              <input type="checkbox" checked={!!hdr.barFlush} onChange={(e) => patchHeader({ barFlush: e.target.checked })} className="accent-accent" />
              Flush (edge-to-edge)
            </label>
          </Section>

          {/* -------- Branding -------- */}
          <Section title="Branding">
            <div className="space-y-2.5">
              <div className="flex gap-4">
                <Check label="Hide logo" checked={!!hdr.hideLogo} onChange={(v) => patchHeader({ hideLogo: v })} />
                <Check label="Hide name" checked={!!hdr.hideName} onChange={(v) => patchHeader({ hideName: v })} />
              </div>
              {!hdr.hideName && (
                <input value={hdr.brandText ?? ""} onChange={(e) => patchHeader({ brandText: e.target.value })} placeholder="axboard (custom name)" className="w-full px-2 py-1.5 rounded bg-bg-elevated border border-border text-[12px] text-text focus:outline-none focus:border-accent" />
              )}
              {!hdr.hideLogo && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded border border-border-subtle bg-bg-elevated flex items-center justify-center overflow-hidden shrink-0">
                    {hdr.brandLogo ? <img src={hdr.brandLogo} alt="" className="w-full h-full object-contain" /> : <span className="text-[9px] text-text-muted">logo</span>}
                  </div>
                  <label className={`px-3 py-1.5 text-[11px] rounded border border-border cursor-pointer ${logoBusy ? "opacity-50" : "text-text-secondary hover:text-text"}`}>
                    {logoBusy ? "…" : hdr.brandLogo ? "Replace" : "Upload logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
                  </label>
                  {hdr.brandLogo && (
                    <button onClick={() => patchHeader({ brandLogo: undefined })} className="text-[11px] text-text-muted hover:text-danger">Remove</button>
                  )}
                </div>
              )}
              <Check label="Show search bar" checked={!hdr.hideSearch} onChange={(v) => patchHeader({ hideSearch: !v })} />
            </div>
          </Section>

          {/* -------- Header widgets -------- */}
          <Section title="Top-bar widgets">
            <div className="space-y-2">
              <Check label="Services up/total" checked={!!hdr.appsUp} onChange={(v) => patchHeader({ appsUp: v })} />
              <Check label="Clock + date" checked={!!hdr.clock} onChange={(v) => patchHeader({ clock: v })} />
              <Check label="Weather" checked={!!hdr.weather} onChange={(v) => patchHeader({ weather: v })} />
            </div>
            {hdr.weather && (
              <div className="mt-3">
                <Label>Weather city{hdr.weatherCity ? ` · ${hdr.weatherCity}` : ""}</Label>
                <div className="flex gap-1.5">
                  <input value={cityQ} onChange={(e) => setCityQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchCity())} placeholder="e.g. Barcelona" className="flex-1 px-2 py-1.5 rounded bg-bg-elevated border border-border text-[12px] text-text focus:outline-none focus:border-accent" />
                  <button onClick={searchCity} className="px-3 py-1.5 text-[11px] rounded border border-border text-text-secondary hover:text-text">Search</button>
                </div>
                {cityHits.length > 0 && (
                  <div className="mt-1.5 rounded border border-border-subtle bg-bg-elevated max-h-40 overflow-auto">
                    {cityHits.map((r) => (
                      <button key={`${r.latitude},${r.longitude}`} onClick={() => { patchHeader({ weatherCity: r.name, weatherLat: r.latitude, weatherLon: r.longitude }); setCityHits([]); }} className="w-full text-left px-2 py-1 text-[12px] text-text-secondary hover:text-text hover:bg-bg-hover">
                        {r.name}
                        {r.country && <span className="text-text-muted text-[11px] ml-1">· {r.country}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* -------- Bookmark launchers -------- */}
          <Section title="Bar bookmarks">
            <p className="text-[10px] text-text-muted mb-2 leading-snug">Pick services to pin as icon launchers in the top bar.</p>
            {apps.length === 0 ? (
              <p className="text-[11px] text-text-muted">No services defined.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {apps.map((a) => {
                  const on = links.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => toggleLink(a.id)} title={a.name} className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${on ? "border-accent bg-accent/15" : "border-border bg-bg-elevated hover:border-text-muted opacity-60 hover:opacity-100"}`}>
                      <SimpleIcon slug={a.icon || a.name} size={18} />
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
