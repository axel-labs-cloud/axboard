// Shared visual helpers for app tiles. Extracted from the `app` and `apps`
// widgets (and ServicesEditor) which each carried identical copies.

/** Two-letter initials for an app with no icon. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Deterministic muted background color derived from the app name. */
export function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 35%, 25%)`;
}

/** Tailwind classes for the status dot given a health status value. */
export function statusClasses(s: string | undefined): string {
  switch (s) {
    case "healthy":
      return "bg-emerald-400 status-pulse";
    case "degraded":
      return "bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.22)]";
    case "down":
      return "bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.22)]";
    default:
      return "bg-text-muted/60";
  }
}
