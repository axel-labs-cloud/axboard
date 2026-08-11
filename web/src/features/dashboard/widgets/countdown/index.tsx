import { useEffect, useState } from "react";
import type {
  CountdownConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Countdown widget — time remaining until (or elapsed since) a target datetime.
// Useful for cert expiries, deploy windows, launch dates.
// ---------------------------------------------------------------------------

function parts(ms: number) {
  const s = Math.floor(Math.abs(ms) / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

function CountdownComponent({ config, h }: WidgetProps<CountdownConfig>) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = config?.target ? new Date(config.target).getTime() : NaN;
  const label = config?.label?.trim();

  if (!config?.target || Number.isNaN(target)) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Set a target date in config.
      </div>
    );
  }

  const diff = target - now;
  const past = diff < 0;
  const p = parts(diff);
  const cell = (n: number, unit: string) => (
    <div className="flex flex-col items-center w-11">
      <span className="text-3xl font-mono tabular-nums text-text leading-none">
        {String(n).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-text-muted mt-1">{unit}</span>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 px-3">
      {label && h > 1 && (
        <div className="text-[12px] text-text-secondary text-center truncate max-w-full">{label}</div>
      )}
      <div className="flex items-start gap-2.5">
        {p.d > 0 && cell(p.d, "days")}
        {cell(p.h, "hrs")}
        {cell(p.m, "min")}
        {cell(p.s, "sec")}
      </div>
      <div className={`text-[10px] uppercase tracking-wider ${past ? "text-degraded" : "text-text-muted"}`}>
        {past ? "elapsed" : "remaining"}
      </div>
    </div>
  );
}

function CountdownConfigPanel({ config, save }: WidgetConfigProps<CountdownConfig>) {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
  const toLocalInput = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Label
        </label>
        <input
          value={config?.label ?? ""}
          onChange={(e) => save({ label: e.target.value })}
          placeholder="e.g. Cert expiry"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Target date &amp; time
        </label>
        <input
          type="datetime-local"
          value={toLocalInput(config?.target)}
          onChange={(e) => {
            const v = e.target.value;
            save({ target: v ? new Date(v).toISOString() : "" });
          }}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

const CountdownIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2" />
    <path d="M5 3 2 6" />
    <path d="m22 6-3-3" />
  </svg>
);

const definition: WidgetDefinition<CountdownConfig> = {
  type: "countdown",
  title: "Countdown",
  icon: CountdownIcon,
  category: "productivity",
  description: "Time remaining until (or since) a target date — expiries, launches, events.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 3,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: CountdownComponent,
  ConfigPanel: CountdownConfigPanel,
};

export default definition;
