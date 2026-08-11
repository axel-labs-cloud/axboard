// Compact relative time, e.g. "3d ago" / "in 2h". Empty string on bad input.
export function timeAgo(input: string | number | Date | undefined): string {
  if (input == null) return "";
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  const abs = Math.abs(s);
  const fut = s < 0 ? "in " : "";
  const suf = s < 0 ? "" : " ago";
  if (abs < 45) return "just now";
  const m = Math.round(abs / 60);
  if (m < 60) return `${fut}${m}m${suf}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${fut}${h}h${suf}`;
  const d = Math.round(h / 24);
  if (d < 30) return `${fut}${d}d${suf}`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${fut}${mo}mo${suf}`;
  return `${fut}${Math.round(mo / 12)}y${suf}`;
}

// True when the timestamp is within `days` of now (for "fresh" highlighting).
export function isRecent(input: string | number | Date | undefined, days: number): boolean {
  if (input == null) return false;
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  return Number.isFinite(t) && Date.now() - t < days * 86_400_000;
}
