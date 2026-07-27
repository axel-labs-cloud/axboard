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

/** Tailwind classes for the status dot given a health status value. Colors come
 *  from the semantic --color-up/degraded/down/unknown tokens so every widget
 *  (and light mode, and per-dashboard accents) stays coherent. */
export function statusClasses(s: string | undefined): string {
  switch (s) {
    case "healthy":
      return "bg-up status-pulse";
    case "degraded":
      return "bg-degraded ring-2 ring-degraded/30";
    case "down":
      return "bg-down ring-2 ring-down/30";
    default:
      return "bg-unknown/60";
  }
}

/** Ring classes to draw attention to a whole tile whose service is degraded or
 *  down — a soft glow that reads across a dense board. Empty otherwise. */
export function tileAlertClasses(s: string | undefined): string {
  switch (s) {
    case "degraded":
      return "ring-1 ring-degraded/30";
    case "down":
      return "ring-1 ring-down/40";
    default:
      return "";
  }
}
