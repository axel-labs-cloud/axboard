import type { CSSProperties } from "react";
import type { BackgroundDef } from "../../api/types";

// ---------------------------------------------------------------------------
// Per-dashboard appearance helpers — background layer + top-bar style catalog.
// Kept framework-free so both DashboardPage and the AppearancePanel share them.
// ---------------------------------------------------------------------------

/** Curated gradient presets offered in the appearance panel. */
export const GRADIENT_PRESETS: { name: string; value: string }[] = [
  { name: "Dusk", value: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #831843 100%)" },
  { name: "Ocean", value: "linear-gradient(135deg, #0f172a 0%, #075985 50%, #0e7490 100%)" },
  { name: "Forest", value: "linear-gradient(135deg, #052e16 0%, #14532d 55%, #166534 100%)" },
  { name: "Ember", value: "linear-gradient(135deg, #1c1917 0%, #7c2d12 55%, #b45309 100%)" },
  { name: "Aurora", value: "linear-gradient(135deg, #042f2e 0%, #134e4a 45%, #4c1d95 100%)" },
  { name: "Slate", value: "linear-gradient(135deg, #0b1120 0%, #1e293b 60%, #334155 100%)" },
  { name: "Rose", value: "linear-gradient(135deg, #4a044e 0%, #831843 55%, #9f1239 100%)" },
  { name: "Mono", value: "radial-gradient(120% 120% at 50% 0%, #18181b 0%, #09090b 70%)" },
];

/** Top-bar style variants: id → { label, class applied to the bar root }. */
export const BAR_STYLES: { id: string; label: string; className: string }[] = [
  { id: "default", label: "Default", className: "bg-bg-card/40 backdrop-blur-sm border-b border-border-subtle" },
  { id: "solid", label: "Solid", className: "bg-bg-card border-b border-border" },
  { id: "contrast", label: "Contrast", className: "bg-black/45 backdrop-blur-md border-b border-white/10" },
  { id: "transparent", label: "Transparent", className: "bg-transparent" },
];

export function barStyleClass(id: string | undefined): string {
  return (BAR_STYLES.find((s) => s.id === id) ?? BAR_STYLES[0]).className;
}

/** Quick accent swatches for the appearance panel. */
export const ACCENT_PRESETS: string[] = [
  "#818cf8", "#6366f1", "#22d3ee", "#06b6d4", "#10b981", "#22c55e",
  "#eab308", "#f59e0b", "#f97316", "#ef4444", "#f43f5e", "#ec4899",
  "#a855f7", "#8b5cf6", "#14b8a6", "#84cc16",
];

/**
 * CSS for the background layer that sits behind the widget grid. Returns null
 * when no background is configured (the theme's body gradient shows through).
 * `layer` = "base" paints the colour/gradient/image (blurred for images);
 * `layer` = "dim" is the dark overlay drawn on top (image only).
 */
export function backgroundLayerStyle(
  bg: BackgroundDef | undefined,
  layer: "base" | "dim",
): CSSProperties | null {
  if (!bg || !bg.type) return null;

  if (layer === "dim") {
    if (bg.type !== "image" || !bg.dim) return null;
    return { backgroundColor: `rgba(0,0,0,${Math.min(100, Math.max(0, bg.dim)) / 100})` };
  }

  const opacity = bg.opacity && bg.opacity > 0 ? bg.opacity / 100 : undefined;

  if (bg.type === "color") {
    if (!bg.color) return null;
    return { background: bg.color, opacity };
  }
  if (bg.type === "gradient") {
    if (!bg.gradient) return null;
    return { background: bg.gradient, opacity };
  }
  if (bg.type === "image") {
    if (!bg.image) return null;
    const tile = bg.fit === "tile";
    const s: CSSProperties = {
      backgroundImage: `url("${bg.image}")`,
      backgroundSize: tile ? "auto" : bg.fit === "contain" ? "contain" : "cover",
      backgroundPosition: "center",
      backgroundRepeat: tile ? "repeat" : "no-repeat",
      opacity,
    };
    if (bg.blur) {
      s.filter = `blur(${bg.blur}px)`;
      // Overscan so the blur doesn't reveal transparent edges.
      s.inset = `-${bg.blur * 2}px`;
    }
    return s;
  }
  return null;
}

/** True when a background is actually set (used to gate the layer render). */
export function hasBackground(bg: BackgroundDef | undefined): boolean {
  return backgroundLayerStyle(bg, "base") != null;
}
