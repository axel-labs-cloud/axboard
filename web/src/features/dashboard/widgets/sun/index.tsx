import { useEffect, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { wmoIcon } from "../weather/icons";
import type {
  SunConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Sun widget — sunrise/sunset + daylight arc, via Open-Meteo (no auth). The
// marker on the arc is the live weather icon (sun/cloud/rain/…) so it reflects
// current conditions, and a soft gradient sky sits under the arc.
// ---------------------------------------------------------------------------

interface SunResponse {
  current?: { weather_code: number; is_day: number };
  daily?: { sunrise: string[]; sunset: string[] };
}

async function fetchSun(lat: number, lon: number): Promise<SunResponse> {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "weather_code,is_day",
    daily: "sunrise,sunset",
    timezone: "auto",
    forecast_days: "1",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!r.ok) throw new Error(`Sun API: ${r.status}`);
  return r.json();
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtDur(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Arc geometry — a top semi-ellipse in a 0..100 × 0..48 viewBox. theta sweeps
// 0 (left foot = sunrise) → π (right foot = sunset), so the marker travels the
// natural left-to-right through the day.
const ARC = { cx: 50, cy: 40, rx: 42, ry: 31 };
function arcPoint(frac: number): { x: number; y: number } {
  const t = Math.PI * frac;
  return { x: ARC.cx - ARC.rx * Math.cos(t), y: ARC.cy - ARC.ry * Math.sin(t) };
}
function arcPath(from: number, to: number): string {
  const a = arcPoint(from);
  const b = arcPoint(to);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${ARC.rx} ${ARC.ry} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function RiseIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 3v6M8 7l4-4 4 4M3 18h18M6 18a6 6 0 0 1 12 0" />
    </svg>
  );
}
function SetIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 9V3M8 5l4 4 4-4M3 18h18M6 18a6 6 0 0 1 12 0" />
    </svg>
  );
}

function SunComponent({ config }: WidgetProps<SunConfig>) {
  const lat = config?.lat;
  const lon = config?.lon;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data, error } = useQuery({
    queryKey: ["sun", lat, lon],
    queryFn: () => fetchSun(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });

  if (lat == null || lon == null) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Pick a city in the widget config.
      </div>
    );
  }
  if (error || !data?.daily?.sunrise?.[0]) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        Could not load sun times.
      </div>
    );
  }

  const rise = new Date(data.daily.sunrise[0]).getTime();
  const set = new Date(data.daily.sunset[0]).getTime();
  const frac = Math.max(0, Math.min(1, (now - rise) / (set - rise)));
  const isDay = now >= rise && now <= set;

  // Live countdown to the next event.
  const hero =
    now < rise
      ? { label: "until sunrise", value: fmtDur(rise - now) }
      : now <= set
        ? { label: "until sunset", value: fmtDur(set - now) }
        : { label: "daylight", value: fmtDur(set - rise) };

  const wi = wmoIcon(data.current?.weather_code ?? 0, data.current?.is_day !== 0);
  const MarkerIcon = wi.Icon;
  const m = arcPoint(frac);

  return (
    <div className="h-full flex flex-col p-3">
      {/* arc */}
      <div className="relative w-full">
        <svg viewBox="0 0 100 48" className="w-full block">
          <defs>
            <linearGradient id="sun-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbbf24" stopOpacity="0.14" />
              <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sun-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#f59e0b" />
              <stop offset="1" stopColor="#fbbf24" />
            </linearGradient>
          </defs>
          {/* sky fill under the full arc */}
          <path d={`${arcPath(0, 1)} L8 40 Z`} fill="url(#sun-sky)" />
          {/* remaining (faint) full arc */}
          <path d={arcPath(0, 1)} fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="2 2.5" strokeLinecap="round" />
          {/* elapsed (bright) arc up to the sun */}
          {isDay && frac > 0.001 && (
            <path d={arcPath(0, frac)} fill="none" stroke="url(#sun-arc)" strokeWidth="2" strokeLinecap="round" />
          )}
          {/* horizon */}
          <line x1="4" y1="40" x2="96" y2="40" stroke="var(--color-border-subtle)" strokeWidth="1" />
          <circle cx="8" cy="40" r="1.5" fill="var(--color-text-muted)" />
          <circle cx="92" cy="40" r="1.5" fill="var(--color-text-muted)" />
        </svg>
        {/* live weather icon on the arc */}
        <div
          className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${m.x}%`,
            top: `${(m.y / 48) * 100}%`,
            filter: isDay ? "drop-shadow(0 0 6px rgba(251,191,36,0.6))" : "none",
            opacity: isDay ? 1 : 0.6,
          }}
        >
          <MarkerIcon className="w-full h-full" />
        </div>
        {/* countdown hero, floated in the arc's open mouth (above the horizon) */}
        <div
          className="absolute inset-x-0 flex flex-col items-center pointer-events-none"
          style={{ top: "56%" }}
        >
          <span className="font-mono tabular-nums text-text text-[15px] leading-none">{hero.value}</span>
          <span className="text-text-muted text-[9px] uppercase tracking-[0.12em] mt-0.5">{hero.label}</span>
        </div>
      </div>
      {/* footer: rise / set anchored under the arc feet */}
      <div className="mt-auto flex items-end justify-between">
        <div className="flex items-center gap-1.5">
          <RiseIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "#fbbf24" }} />
          <div className="flex flex-col leading-tight">
            <span className="text-text-muted text-[8.5px] uppercase tracking-[0.1em]">Rise</span>
            <span className="font-mono tabular-nums text-text-secondary text-[12px]">{hhmm(data.daily.sunrise[0])}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex flex-col leading-tight text-right">
            <span className="text-text-muted text-[8.5px] uppercase tracking-[0.1em]">Set</span>
            <span className="font-mono tabular-nums text-text-secondary text-[12px]">{hhmm(data.daily.sunset[0])}</span>
          </div>
          <SetIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "#f97316" }} />
        </div>
      </div>
    </div>
  );
}

function SunConfigPanel({ config, save }: WidgetConfigProps<SunConfig>) {
  const [q, setQ] = useState(config?.city ?? "");
  const [results, setResults] = useState<{ name: string; country?: string; latitude: number; longitude: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=5`);
      const d = await r.json();
      setResults(d.results ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">City</label>
      <div className="flex gap-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), run())}
          placeholder="e.g. Barcelona"
          className="flex-1 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={run}
          disabled={busy}
          className="px-3 py-1.5 text-[11px] rounded border border-border text-text-secondary hover:text-text disabled:opacity-40"
        >
          {busy ? "…" : "Search"}
        </button>
      </div>
      {results.length > 0 && (
        <div className="rounded border border-border-subtle bg-bg-card/40 max-h-40 overflow-auto">
          {results.map((r) => (
            <button
              key={`${r.latitude},${r.longitude}`}
              onClick={() => {
                save({ city: r.name, lat: r.latitude, lon: r.longitude });
                setResults([]);
              }}
              className="w-full text-left px-2 py-1 text-[12px] text-text-secondary hover:text-text hover:bg-bg-hover"
            >
              {r.name}
              {r.country && <span className="text-text-muted text-[11px] ml-1">· {r.country}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SunIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const definition: WidgetDefinition<SunConfig> = {
  type: "sun",
  title: "Sun",
  icon: SunIcon,
  category: "external",
  description: "Sunrise, sunset and a daylight arc for a city.",
  minW: 2,
  minH: 2,
  maxW: 4,
  maxH: 3,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: SunComponent,
  ConfigPanel: SunConfigPanel,
};

export default definition;
