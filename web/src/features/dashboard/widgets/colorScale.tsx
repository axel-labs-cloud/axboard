// ---------------------------------------------------------------------------
// Shared colour system for the system widgets (gauge, per-core CPU, temps,
// filesystems). One scale abstraction + a reusable config UI so every widget
// offers the same options: health thresholds (configurable), value gradient,
// a fixed palette colour, or the dashboard accent.
// ---------------------------------------------------------------------------

export type ColorScaleKind = "threshold" | "gradient" | "solid" | "accent";

export interface ColorConfig {
  colorScale?: ColorScaleKind;
  color?: string; // palette key, for the "solid" scale
  warn?: number; // amber breakpoint (metric units), for "threshold"
  crit?: number; // red breakpoint (metric units), for "threshold"
}

export const PALETTE: Record<string, string> = {
  accent: "var(--color-accent, #818cf8)",
  emerald: "#10b981",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

const PALETTE_KEYS = ["accent", "emerald", "cyan", "blue", "violet", "amber", "rose"] as const;

export interface ScaleOpts {
  lo: number; // gradient low bound (green)
  hi: number; // gradient high bound (red)
  warn: number; // default amber breakpoint
  crit: number; // default red breakpoint
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Resolve a colour for `value` under the widget's colour config.
export function scaleColor(value: number, cfg: ColorConfig | undefined, opts: ScaleOpts): string {
  const scale = cfg?.colorScale ?? "threshold";
  if (scale === "accent") return "var(--color-accent, #818cf8)";
  if (scale === "solid") return PALETTE[cfg?.color ?? "accent"] ?? PALETTE.accent;
  if (scale === "gradient") {
    const t = clamp01((value - opts.lo) / (opts.hi - opts.lo || 1));
    const h = 145 - 145 * t; // 145°=green → 0°=red
    return `hsl(${h.toFixed(0)} 72% 52%)`;
  }
  const warn = cfg?.warn ?? opts.warn;
  const crit = cfg?.crit ?? opts.crit;
  if (value >= crit) return "var(--color-down, #f43f5e)";
  if (value >= warn) return "var(--color-degraded, #f59e0b)";
  return "var(--color-up, #10b981)";
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${
        active ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

// Reusable colour config UI. `unit` labels the threshold inputs (e.g. "%", "°C").
export function ColorControls({
  cfg,
  save,
  opts,
  unit = "%",
}: {
  cfg: ColorConfig | undefined;
  save: (patch: Partial<ColorConfig>) => void;
  opts: ScaleOpts;
  unit?: string;
}) {
  const scale = cfg?.colorScale ?? "threshold";
  const color = cfg?.color ?? "accent";
  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Colour</label>
        <div className="grid grid-cols-4 gap-1">
          {([
            ["threshold", "health"],
            ["gradient", "gradient"],
            ["solid", "solid"],
            ["accent", "accent"],
          ] as const).map(([k, lbl]) => (
            <Chip key={k} active={scale === k} onClick={() => save({ colorScale: k })}>
              {lbl}
            </Chip>
          ))}
        </div>
      </div>

      {scale === "solid" && (
        <div className="flex flex-wrap gap-1.5">
          {PALETTE_KEYS.map((c) => (
            <button
              key={c}
              onClick={() => save({ color: c })}
              title={c}
              className={`w-6 h-6 rounded-full ring-2 transition-transform ${color === c ? "ring-text scale-110" : "ring-transparent hover:scale-105"}`}
              style={{ background: PALETTE[c] }}
            />
          ))}
        </div>
      )}

      {scale === "threshold" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold block">Warn ({unit})</span>
            <input
              type="number"
              value={cfg?.warn ?? opts.warn}
              onChange={(e) => save({ warn: parseFloat(e.target.value) })}
              className="w-full px-2 py-1 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold block">Critical ({unit})</span>
            <input
              type="number"
              value={cfg?.crit ?? opts.crit}
              onChange={(e) => save({ crit: parseFloat(e.target.value) })}
              className="w-full px-2 py-1 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
            />
          </label>
        </div>
      )}

      {scale === "gradient" && (
        <p className="text-[10px] text-text-muted">Green→red across {opts.lo}–{opts.hi}{unit}.</p>
      )}
    </div>
  );
}
