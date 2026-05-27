import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClockConfig, WidgetDefinition, WidgetProps, WidgetConfigProps } from "../types";
import { TIMEZONES } from "../../timezones";

// ---------------------------------------------------------------------------
// Clock widget
// Adapts its layout to every supported size from 1×1 up to 3×3.
// Optional secondary timezones are listed at the bottom.
// ---------------------------------------------------------------------------

function ClockComponent({ config, w, h }: WidgetProps<ClockConfig>) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const use24h = config?.use24h ?? true;
  // Cap displayed timezones at 5 — beyond that the bottom of any 1×2 / 2×2
  // clock becomes too cramped to read.
  const tzs = (config?.timezones ?? []).slice(0, 5);

  const fmt = (tz?: string) =>
    now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: !use24h,
      ...(tz && { timeZone: tz }),
    });
  const dateShort = now.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // 1×1 — large centered time
  if (w <= 1 && h <= 1) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-3xl font-mono text-text tabular-nums">{fmt()}</span>
      </div>
    );
  }

  // W×1 (wide, short) — time + date inline, vertically centered
  if (h <= 1) {
    return (
      <div className="flex items-center justify-center h-full gap-4 px-4">
        <span className="text-4xl font-mono text-text tabular-nums">{fmt()}</span>
        <span className="text-[14px] text-text-muted">{dateShort}</span>
      </div>
    );
  }

  // 1×2 — tall narrow. Split into two equal halves so the top half (the
  // first 1×1 cell) holds the centered clock + date and the bottom half
  // holds the timezone list. The border between them sits on the exact
  // midline of the widget regardless of how many timezones are configured.
  if (w <= 1) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-2">
          <div className="text-4xl font-mono text-text tabular-nums leading-none">{fmt()}</div>
          <div className="text-[12px] text-text-muted mt-1.5">{dateShort}</div>
        </div>
        {tzs.length > 0 && (
          <>
            <div className="border-t border-border-subtle" />
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-2 gap-1.5 overflow-hidden">
              {tzs.map((tz) => (
                <div key={tz} className="flex flex-col items-center leading-tight">
                  <span className="text-[10px] text-text-muted">
                    {tz.split("/").pop()?.replace("_", " ")}
                  </span>
                  <span className="text-[14px] text-text font-mono tabular-nums">
                    {fmt(tz)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // 2×2 — big time, date, timezones
  return (
    <div className="flex flex-col h-full px-4 py-4">
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="text-5xl font-mono text-text tabular-nums leading-none">
          {fmt()}
        </div>
        <div className="text-[14px] text-text-muted mt-2">{dateShort}</div>
      </div>
      {tzs.length > 0 && (
        <div className="shrink-0 space-y-0.5 pt-2">
          <div className="border-t border-border-subtle mb-2" />
          {tzs.map((tz) => (
            <div key={tz} className="flex items-center justify-between px-1">
              <span className="text-[13px] text-text-muted">
                {tz.split("/").pop()?.replace("_", " ")}
              </span>
              <span className="text-[14px] text-text font-mono tabular-nums">{fmt(tz)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config panel
// ---------------------------------------------------------------------------

function ClockConfigPanel({ config, save }: WidgetConfigProps<ClockConfig>) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] =
    useState<React.CSSProperties | null>(null);
  const tzs = config?.timezones ?? [];
  const filtered = TIMEZONES.filter(
    (tz) => !tzs.includes(tz) && tz.toLowerCase().includes(query.toLowerCase())
  );

  // Compute the dropdown's fixed-position coordinates from the input's
  // bounding rect. We use position: fixed so the dropdown escapes the parent
  // panel's overflow-auto and can grow horizontally to fit long timezone
  // names. Position is recomputed on scroll/resize so it stays anchored.
  const reposition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 200 && rect.top > 200;
    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      minWidth: rect.width,
      maxWidth: Math.max(rect.width, window.innerWidth - rect.left - 16),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  // useLayoutEffect runs synchronously after the DOM mutation but before
  // the browser paints — so the input's bounding rect is real and the
  // dropdown shows up at the right place on the very first paint.
  // We don't bother clearing dropdownStyle when the query empties — the JSX
  // gates rendering on `query` directly, so a stale style is harmless.
  useLayoutEffect(() => {
    if (!query) return;
    reposition();
  }, [query, reposition]);

  // Re-anchor on scroll / resize while the dropdown is open.
  useEffect(() => {
    if (!query) return;
    // capture: catch scroll on any ancestor (the config panel itself scrolls)
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [query, reposition]);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.use24h ?? true}
          onChange={(e) => save({ use24h: e.target.checked })}
          className="accent-accent"
        />
        24-hour format
      </label>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-text-muted">Timezones</span>
          <span className="text-[10px] text-text-muted font-mono">{tzs.length}/5</span>
        </div>
        {tzs.map((tz, i) => (
          <div
            key={tz}
            className="flex items-center justify-between py-1 border-b border-border-subtle last:border-0"
          >
            <span className="text-[12px] text-text font-mono">{tz}</span>
            <button
              onClick={() => save({ timezones: tzs.filter((_, j) => j !== i) })}
              className="text-text-muted hover:text-danger text-[11px]"
            >
              ×
            </button>
          </div>
        ))}
        {tzs.length < 5 ? (
          <div className="relative mt-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search timezone..."
              className="w-full px-2 py-1.5 rounded bg-bg border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            {query && dropdownStyle && filtered.length > 0 && (
              <div
                className="bg-bg-elevated border border-border rounded shadow-2xl max-h-64 overflow-auto z-[300]"
                style={dropdownStyle}
              >
                {filtered.slice(0, 20).map((tz) => (
                  <button
                    key={tz}
                    onClick={() => {
                      save({ timezones: [...tzs, tz] });
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text font-mono whitespace-nowrap"
                  >
                    {tz}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1.5 px-2 py-1.5 rounded border border-dashed border-border-subtle text-[11px] text-text-muted text-center">
            Maximum 5 timezones reached
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

const ClockIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-5 h-5"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const definition: WidgetDefinition<ClockConfig> = {
  type: "clock",
  title: "Clock",
  icon: ClockIcon,
  category: "system",
  description: "Live clock with optional secondary timezones. 12/24h format.",
  minW: 1,
  minH: 1,
  maxW: 4,
  maxH: 4,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: { use24h: true, timezones: [] },
  Component: ClockComponent,
  ConfigPanel: ClockConfigPanel,
};

export default definition;
