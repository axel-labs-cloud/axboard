// Shared time-window control for the live graphs. The graphs poll on a fixed
// interval and keep a rolling buffer; the window picks how far back to plot.

export type TimeWindow = "1m" | "5m" | "15m" | "1h";

export const WINDOW_ORDER: TimeWindow[] = ["1m", "5m", "15m", "1h"];

// Number of samples in a window, given the poll interval in ms.
export function windowPoints(win: TimeWindow, pollMs: number): number {
  const secs = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 }[win];
  return Math.max(2, Math.round((secs * 1000) / pollMs));
}

// The largest buffer we ever need (1h at the given poll interval).
export function maxBuffer(pollMs: number): number {
  return windowPoints("1h", pollMs);
}

export function WindowChips({
  value,
  onChange,
  size = "sm",
}: {
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
  size?: "sm" | "xs";
}) {
  const pad = size === "xs" ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  return (
    <div className="inline-flex rounded border border-border-subtle overflow-hidden">
      {WINDOW_ORDER.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={`${pad} font-mono transition-colors ${
            value === w ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {w}
        </button>
      ))}
    </div>
  );
}
