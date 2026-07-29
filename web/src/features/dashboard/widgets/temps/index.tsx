import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import { ColorControls, scaleColor, type ColorConfig } from "../colorScale";
import { ReorderPicker } from "../ReorderPicker";
import type { TempsConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";
import type { HostStats } from "../../../../api/types";

// ---------------------------------------------------------------------------
// Temperatures widget — hardware sensors from /sys/class/hwmon. Sensors are
// chosen from a checklist (config); by default a curated subset shows. Colour
// comes from the shared scale mapped over a temperature range.
// ---------------------------------------------------------------------------

const OPTS = { lo: 30, hi: 90, warn: 70, crit: 85 };
const BAR_LO = 20;
const BAR_HI = 100;

// A sensible default when the user hasn't picked sensors yet.
function defaultSubset(labels: string[]): string[] {
  const primary = labels.filter((l) => /package|tctl|tdie|\bcore\b|edge|composite|cpu/i.test(l));
  return (primary.length ? primary : labels).slice(0, 6);
}

function TempsComponent({ config }: WidgetProps<TempsConfig>) {
  const box = useSize<HTMLDivElement>();
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: 5_000 });

  const names = config?.names ?? {};
  const temps = useMemo(() => {
    const all = data?.temps ?? [];
    const byLabel = new Map(all.map((t) => [t.label, t]));
    const enabled = config?.sensors ?? defaultSubset(all.map((t) => t.label));
    // Preserve the user's chosen order (from config); only fall back to a
    // temperature sort for the default subset (when nothing is configured).
    const ordered = enabled.map((l) => byLabel.get(l)).filter(Boolean) as typeof all;
    const rows = ordered.map((t) => ({ ...t, display: names[t.label] || t.label }));
    if (!config?.sensors) rows.sort((a, b) => b.celsius - a.celsius);
    return rows;
  }, [data, config?.sensors, config?.names]);

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }
  if ((data.temps ?? []).length === 0) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">No temperature sensors exposed.</div>;
  }
  if (temps.length === 0) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">No sensors selected — open config.</div>;
  }

  const hottest = temps[0];
  const compact = box.h > 0 && box.h < 104;
  const cols = box.w >= 420 ? 2 : 1;

  if (compact) {
    return (
      <div ref={box.ref} className="h-full flex flex-col justify-center px-3.5">
        <span className="text-[11px] text-text-muted uppercase tracking-wide truncate">{hottest.display}</span>
        <span className="font-mono tabular-nums text-3xl font-semibold leading-none" style={{ color: scaleColor(hottest.celsius, config as ColorConfig, OPTS) }}>
          {hottest.celsius.toFixed(0)}°
        </span>
      </div>
    );
  }

  return (
    <div ref={box.ref} className="h-full overflow-auto px-3 py-2.5 flex flex-col justify-center">
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, columnGap: "14px", rowGap: "9px" }}>
        {temps.map((t, i) => {
          const color = scaleColor(t.celsius, config as ColorConfig, OPTS);
          const w = Math.min(100, Math.max(0, ((t.celsius - BAR_LO) / (BAR_HI - BAR_LO)) * 100));
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-baseline justify-between text-[11px] gap-2">
                <span className="text-text-secondary truncate">{t.display}</span>
                <span className="font-mono tabular-nums" style={{ color }}>{t.celsius.toFixed(0)}°C</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${w}%`, background: color, transition: "width 0.5s ease" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TempsConfigPanel({ config, save }: WidgetConfigProps<TempsConfig>) {
  const qc = useQueryClient();
  const host = qc.getQueryData<HostStats>(["host"]);
  const all = host?.temps ?? [];
  const enabled = config?.sensors ?? defaultSubset(all.map((t) => t.label));

  const names = config?.names ?? {};
  const rename = (label: string, value: string) => {
    const next = { ...names };
    if (value.trim()) next[label] = value;
    else delete next[label];
    save({ names: next });
  };

  return (
    <div className="space-y-3">
      {all.length === 0 ? (
        <p className="text-[11px] text-text-muted">No sensors detected yet.</p>
      ) : (
        <ReorderPicker
          all={all.map((t) => ({ key: t.label, label: t.label, extra: `${t.celsius.toFixed(0)}°` }))}
          enabled={enabled}
          onChange={(keys) => save({ sensors: keys })}
          names={names}
          onRename={rename}
        />
      )}
      <ColorControls cfg={config} save={save} opts={OPTS} unit="°C" />
    </div>
  );
}

const TempsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
);

const definition: WidgetDefinition<TempsConfig> = {
  type: "temps",
  title: "Temperatures",
  icon: TempsIcon,
  category: "infrastructure",
  description: "Hardware temperature sensors (CPU, NVMe, chipset) — pick which to show.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: TempsComponent,
  ConfigPanel: TempsConfigPanel,
};

export default definition;
