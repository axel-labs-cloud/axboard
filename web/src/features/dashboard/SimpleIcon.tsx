import { useMemo, useState } from "react";

interface SimpleIconProps {
  slug: string;
  size?: number;
  /** When true, the icon fills its parent (width/height 100%) instead of
   *  using a fixed pixel size. Useful inside flex/grid slots that already
   *  control sizing via padding. */
  fill?: boolean;
  className?: string;
}

/**
 * Renders an icon from multiple sources:
 * - "si:gitlab" → Simple Icons (brand icons from simpleicons.org)
 * - "sh:proxmox" or just "proxmox" → selfh.st icons (selfhosted app icons)
 * - "https://..." → direct URL to any image
 *
 * Live preview: icon renders as you type the slug.
 */
export function SimpleIcon({ slug, size = 24, fill = false, className = "" }: SimpleIconProps) {
  // Pure derivation — no useEffect / no setState cascade. Cleaner and avoids
  // the "setState synchronously inside an effect triggers cascading renders"
  // lint warning we used to have here.
  const svgUrl = useMemo<string | null>(() => {
    if (!slug) return null;
    if (slug.startsWith("http://") || slug.startsWith("https://")) return slug;
    if (slug.startsWith("si:")) {
      const name = slug.slice(3).toLowerCase();
      return `https://cdn.simpleicons.org/${name}/e5e5e5`;
    }
    const name = slug.startsWith("sh:") ? slug.slice(3) : slug;
    return `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${name}.svg`;
  }, [slug]);

  // Track which URL last failed to load. Errors are derived: if the current
  // URL matches the last failed URL, we're in an error state. When the slug
  // changes, svgUrl changes, and isError naturally goes back to false without
  // needing an effect to reset it.
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const error = svgUrl !== null && errorUrl === svgUrl;

  const sizeStyle: React.CSSProperties = fill
    ? { width: "100%", height: "100%", objectFit: "contain" }
    : { width: size, height: size };

  if (!svgUrl || error) {
    return (
      <div
        className={`flex items-center justify-center text-text-muted ${className}`}
        style={sizeStyle}
      >
        {slug ? "?" : ""}
      </div>
    );
  }

  return (
    <img
      src={svgUrl}
      alt={slug}
      className={className}
      style={{ ...sizeStyle, filter: "brightness(0.9)" }}
      onError={() => setErrorUrl(svgUrl)}
    />
  );
}
