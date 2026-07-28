import { useState } from "react";
import { createPortal } from "react-dom";
import type { BackgroundDef, HeaderDef } from "../../api/types";
import { BAR_STYLES, GRADIENT_PRESETS } from "./appearance";

// ---------------------------------------------------------------------------
// AppearancePanel — modal for the active dashboard's background, top-bar style
// and header widgets. All changes persist immediately via the callbacks
// (same optimistic PUT /api/config path the accent picker uses).
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
    <div className="border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
      <div className="text-[12px] font-semibold text-text-secondary mb-2">{title}</div>
      {children}
    </div>
  );
}

export function AppearancePanel(props: Props) {
  const { open, onClose, background, onSetBackground, barStyle, onSetBarStyle, header, onSetHeader } = props;
  const bg = background ?? {};
  const type = bg.type ?? "none";
  const patchBg = (p: Partial<BackgroundDef>) => onSetBackground({ ...bg, ...p });
  const patchHeader = (p: Partial<HeaderDef>) => onSetHeader({ ...(header ?? {}), ...p });

  // Weather city geocoding for the header weather widget.
  const [cityQ, setCityQ] = useState(header?.weatherCity ?? "");
  const [cityHits, setCityHits] = useState<{ name: string; country?: string; latitude: number; longitude: number }[]>([]);
  const searchCity = async () => {
    if (!cityQ.trim()) return;
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQ.trim())}&count=5`);
    const d = await r.json();
    setCityHits(d.results ?? []);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md max-h-[85vh] overflow-auto rounded-xl border border-border bg-bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle sticky top-0 bg-bg-card z-10">
          <h2 className="text-[14px] font-semibold text-text">Appearance</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg leading-none px-1">×</button>
        </div>

        <div className="p-4 space-y-4">
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
                <input
                  type="color"
                  value={bg.color ?? "#0b1120"}
                  onChange={(e) => patchBg({ color: e.target.value })}
                  className="w-10 h-8 rounded bg-transparent border border-border cursor-pointer"
                />
                <input
                  value={bg.color ?? ""}
                  onChange={(e) => patchBg({ color: e.target.value })}
                  placeholder="#0b1120 or any CSS color"
                  className="flex-1 px-2 py-1.5 rounded bg-bg-elevated border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent"
                />
              </div>
            )}

            {type === "gradient" && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {GRADIENT_PRESETS.map((g) => (
                    <button
                      key={g.name}
                      onClick={() => patchBg({ gradient: g.value })}
                      title={g.name}
                      style={{ background: g.value }}
                      className={`h-9 rounded border transition-transform hover:scale-105 ${
                        bg.gradient === g.value ? "border-accent ring-1 ring-accent" : "border-border"
                      }`}
                    />
                  ))}
                </div>
                <input
                  value={bg.gradient ?? ""}
                  onChange={(e) => patchBg({ gradient: e.target.value })}
                  placeholder="custom: linear-gradient(...)"
                  className="w-full px-2 py-1.5 rounded bg-bg-elevated border border-border text-[11px] text-text font-mono focus:outline-none focus:border-accent"
                />
              </div>
            )}

            {type === "image" && (
              <div className="space-y-2.5">
                <input
                  value={bg.image ?? ""}
                  onChange={(e) => patchBg({ image: e.target.value })}
                  placeholder="https://…/photo.jpg"
                  className="w-full px-2 py-1.5 rounded bg-bg-elevated border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent"
                />
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
          </Section>

          {/* -------- Top-bar style -------- */}
          <Section title="Top bar style">
            <div className="grid grid-cols-2 gap-1.5">
              {BAR_STYLES.map((s) => {
                const active = (barStyle ?? "default") === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => onSetBarStyle(s.id)}
                    className={`px-2 py-2 rounded text-[11px] border transition-colors ${
                      active ? "bg-accent/15 border-accent text-accent" : "bg-bg-elevated border-border text-text-muted hover:text-text"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* -------- Header widgets -------- */}
          <Section title="Top-bar widgets">
            <div className="space-y-2">
              {([
                ["appsUp", "Services up/total"],
                ["clock", "Clock + date"],
                ["weather", "Weather"],
              ] as [keyof HeaderDef, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!header?.[key]}
                    onChange={(e) => patchHeader({ [key]: e.target.checked } as Partial<HeaderDef>)}
                    className="accent-accent"
                  />
                  {label}
                </label>
              ))}
            </div>

            {header?.weather && (
              <div className="mt-3">
                <Label>Weather city{header.weatherCity ? ` · ${header.weatherCity}` : ""}</Label>
                <div className="flex gap-1.5">
                  <input
                    value={cityQ}
                    onChange={(e) => setCityQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchCity())}
                    placeholder="e.g. Barcelona"
                    className="flex-1 px-2 py-1.5 rounded bg-bg-elevated border border-border text-[12px] text-text focus:outline-none focus:border-accent"
                  />
                  <button onClick={searchCity} className="px-3 py-1.5 text-[11px] rounded border border-border text-text-secondary hover:text-text">
                    Search
                  </button>
                </div>
                {cityHits.length > 0 && (
                  <div className="mt-1.5 rounded border border-border-subtle bg-bg-elevated max-h-40 overflow-auto">
                    {cityHits.map((r) => (
                      <button
                        key={`${r.latitude},${r.longitude}`}
                        onClick={() => {
                          patchHeader({ weatherCity: r.name, weatherLat: r.latitude, weatherLon: r.longitude });
                          setCityHits([]);
                        }}
                        className="w-full text-left px-2 py-1 text-[12px] text-text-secondary hover:text-text hover:bg-bg-hover"
                      >
                        {r.name}
                        {r.country && <span className="text-text-muted text-[11px] ml-1">· {r.country}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
