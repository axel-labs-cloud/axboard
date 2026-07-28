import { useEffect, useState } from "react";
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

function SunComponent({ config }: WidgetProps<SunConfig>) {
  const lat = config?.lat;
  const lon = config?.lon;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
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
  const dayMs = set - rise;
  const dayH = Math.floor(dayMs / 3600000);
  const dayM = Math.floor((dayMs % 3600000) / 60000);

  // Live weather icon rides the arc (falls back to a clear sun/moon).
  const wi = wmoIcon(data.current?.weather_code ?? 0, data.current?.is_day !== 0);
  const MarkerIcon = wi.Icon;

  // Marker position on a semicircle arc (viewBox 0..100 x, 0..44 y). We also
  // place an HTML icon overlay at the same spot as a percentage of the box.
  const angle = Math.PI * (1 - frac); // pi at sunrise (left) → 0 at sunset (right)
  const mx = 50 - 42 * Math.cos(angle);
  const my = 40 - 32 * Math.sin(angle);

  return (
    <div className="h-full flex flex-col justify-center px-3.5 py-2.5 gap-2">
      <div className="relative">
        <svg viewBox="0 0 100 44" className="w-full">
          <defs>
            <linearGradient id="sun-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sun-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fbbf24" stopOpacity="0.5" />
              <stop offset="0.5" stopColor="var(--color-accent)" stopOpacity="0.7" />
              <stop offset="1" stopColor="#fbbf24" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {/* filled sky under the arc */}
          <path d="M8 40 A42 32 0 0 1 92 40 Z" fill="url(#sun-sky)" />
          {/* arc line */}
          <path d="M8 40 A42 32 0 0 1 92 40" fill="none" stroke="url(#sun-arc)" strokeWidth="1.5" strokeLinecap="round" />
          {/* horizon */}
          <line x1="4" y1="40" x2="96" y2="40" stroke="var(--color-border-subtle)" strokeWidth="1" />
          {/* progress dot on the horizon markers */}
          <circle cx="8" cy="40" r="1.6" fill="var(--color-text-muted)" />
          <circle cx="92" cy="40" r="1.6" fill="var(--color-text-muted)" />
        </svg>
        {/* live weather icon on the arc */}
        <div
          className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${mx}%`,
            top: `${(my / 44) * 100}%`,
            filter: isDay ? "drop-shadow(0 0 5px rgba(251,191,36,0.55))" : "none",
            opacity: isDay ? 1 : 0.85,
          }}
        >
          <MarkerIcon className="w-full h-full" />
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex flex-col">
          <span className="text-text-muted text-[9px] uppercase tracking-wider">Rise</span>
          <span className="font-mono tabular-nums text-text-secondary">{hhmm(data.daily.sunrise[0])}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-text-muted text-[9px] uppercase tracking-wider">Daylight</span>
          <span className="font-mono tabular-nums text-text-secondary">
            {dayH}h {dayM}m
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-text-muted text-[9px] uppercase tracking-wider">Set</span>
          <span className="font-mono tabular-nums text-text-secondary">{hhmm(data.daily.sunset[0])}</span>
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
