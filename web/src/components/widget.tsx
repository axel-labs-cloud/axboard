// Shared widget chrome — one header, one empty/error state, one status dot, one
// meter — so the 37 dashboard widgets stop each reinventing these. All colours
// flow through theme tokens (up/degraded/down + text/bg/border) so every theme
// renders correctly. Loading uses the existing SkeletonLines (./Skeleton).
import type { ReactNode } from "react";
import type { StatusMap } from "../api/types";

// --- StatusDot ------------------------------------------------------------
// Accepts a raw health status string OR a StatusMap entry (from which it also
// builds a "status · Nms · time" tooltip). Colours are semantic tokens.
function toneClasses(s: string | undefined): string {
  switch (s) {
    case "healthy":
    case "up":
      return "bg-up status-pulse";
    case "degraded":
    case "warn":
      return "bg-degraded ring-2 ring-degraded/30";
    case "down":
    case "error":
      return "bg-down ring-2 ring-down/30";
    default:
      return "bg-unknown/60";
  }
}

export function StatusDot({
  status,
  size = "md",
  title,
}: {
  status?: StatusMap[string] | string;
  size?: "sm" | "md" | "lg";
  title?: string;
}) {
  const s = typeof status === "string" ? status : status?.status;
  const px = size === "lg" ? "w-2.5 h-2.5" : size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";
  const autoTitle =
    title ??
    (typeof status === "object" && status?.status
      ? `${status.status}${status.response_ms != null ? ` · ${status.response_ms} ms` : ""}${
          status.last_checked ? ` · ${new Date(status.last_checked).toLocaleTimeString()}` : ""
        }`
      : undefined);
  return <span className={`inline-block rounded-full shrink-0 ${px} ${toneClasses(s)}`} title={autoTitle} />;
}

// --- WidgetHeader ---------------------------------------------------------
// One title-row idiom: optional leading icon, a muted title, optional right slot.
export function WidgetHeader({ icon, title, right }: { icon?: ReactNode; title?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-3 h-8 shrink-0">
      {icon && <span className="text-text-muted shrink-0 inline-flex items-center [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
      {title && <span className="text-[12px] font-medium text-text-secondary truncate">{title}</span>}
      {right && <span className="ml-auto shrink-0 flex items-center gap-1">{right}</span>}
    </div>
  );
}

// --- EmptyState -----------------------------------------------------------
export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-1.5 p-3 text-center">
      {icon && <span className="text-text-muted/50 inline-flex [&>svg]:w-5 [&>svg]:h-5">{icon}</span>}
      <div className="text-[12px] text-text-secondary">{title}</div>
      {hint && <div className="text-[10.5px] text-text-muted/80 max-w-[30ch] leading-snug">{hint}</div>}
    </div>
  );
}

// --- ErrorState -----------------------------------------------------------
// A real error reads as an error (semantic down colour + icon), never a faint
// muted line that looks like "empty". Optional retry action.
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 p-3 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5 text-down/80">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4.5M12 16h.01" />
      </svg>
      <div className="text-[12px] text-down max-w-[30ch] leading-snug">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[11px] px-2.5 py-1 rounded border border-border text-text-secondary hover:border-accent hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// --- Meter ----------------------------------------------------------------
// One horizontal usage bar. `color` is any CSS colour (usually from scaleColor);
// `tick` draws a threshold marker (warn/crit) as a % position.
export function Meter({ pct, color, tick, className = "" }: { pct: number; color?: string; tick?: number; className?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={`relative h-1.5 rounded-full bg-border-subtle overflow-hidden ${className}`}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color ?? "var(--color-accent)", transition: "width .4s ease" }} />
      {tick != null && tick > 0 && tick < 100 && (
        <span className="absolute inset-y-0 w-px bg-text/25" style={{ left: `${tick}%` }} />
      )}
    </div>
  );
}
