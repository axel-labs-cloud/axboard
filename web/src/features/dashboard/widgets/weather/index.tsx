import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  WeatherConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";
import { wmoIcon } from "./icons";

// ---------------------------------------------------------------------------
// Weather widget — Open-Meteo (no auth, no API key).
// Layout adapts to widget size:
//   1x1: icon + temp + condition
//   2x1: + small details strip (humidity / wind)
//   1x2 / 1x3: temp + condition + vertical forecast list
//   2x2: temp/condition + details + horizontal forecast cards
//   2x3 / 3x3: + larger forecast cards (more days at wider widths)
// ---------------------------------------------------------------------------

interface OpenMeteoResponse {
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    is_day: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
  };
}

interface GeocodingResponse {
  results?: {
    name: string;
    country?: string;
    latitude: number;
    longitude: number;
  }[];
}

async function fetchWeather(
  lat: number,
  lon: number,
  units: "celsius" | "fahrenheit",
): Promise<OpenMeteoResponse> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    hourly: "temperature_2m,weather_code",
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: units,
    wind_speed_unit: units === "fahrenheit" ? "mph" : "kmh",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!r.ok) throw new Error(`Weather API: ${r.status}`);
  return r.json();
}

function windDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function dayLabel(iso: string, i: number): string {
  if (i === 0) return "Today";
  if (i === 1) return "Tmrw";
  return new Date(iso + "T12:00").toLocaleDateString(undefined, { weekday: "short" });
}

function WeatherWidget({ config, w, h }: WidgetProps<WeatherConfig>) {
  const lat = config?.lat;
  const lon = config?.lon;
  const city = config?.city ?? "";
  const units = (config?.units ?? "celsius") as "celsius" | "fahrenheit";
  const unitLabel = units === "fahrenheit" ? "°F" : "°C";
  const windUnit = units === "fahrenheit" ? "mph" : "km/h";

  const { data, isLoading, error } = useQuery({
    queryKey: ["weather", lat, lon, units],
    queryFn: () => fetchWeather(lat!, lon!, units),
    enabled: lat != null && lon != null,
    staleTime: 10 * 60_000, // 10 min
    refetchInterval: 10 * 60_000,
  });

  if (lat == null || lon == null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted/60 gap-2 p-3 text-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-5 h-5"
        >
          <circle cx="12" cy="9" r="3" />
          <path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z" />
        </svg>
        <span className="text-[11px] text-text-secondary">Pick a city in the widget config</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-rose-400 text-[11px] p-3 text-center">
        Weather fetch failed: {(error as Error).message}
      </div>
    );
  }

  if (isLoading || !data?.current) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-[11px] animate-pulse">
        Loading weather…
      </div>
    );
  }

  const current = data.current;
  const isDay = current.is_day === 1;
  const wi = wmoIcon(current.weather_code, isDay);
  const Icon = wi.Icon;

  const wide = w >= 3;
  const tall = h >= 3;
  const veryTall = h >= 4;
  const veryWide = w >= 5;
  // Show the details strip only when there's genuine vertical room, and forecast
  // day-count scales with width. Everything stacks vertically so nothing is ever
  // squeezed/clipped horizontally.
  const showDetails = veryTall || (wide && !tall);
  const numForecast = veryWide ? 7 : wide ? 5 : 4;

  const Header = city ? (
    <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold truncate shrink-0">
      {city}
    </div>
  ) : null;

  const Hero = (
    <div className="flex items-center gap-3 shrink-0 min-w-0">
      <div className={`shrink-0 ${veryTall ? "w-16 h-16" : "w-14 h-14"}`}>
        <Icon className="w-full h-full" />
      </div>
      <div className="min-w-0">
        <div
          className={`font-mono font-semibold tabular-nums text-text leading-none ${
            veryTall ? "text-5xl" : "text-4xl"
          }`}
        >
          {Math.round(current.temperature_2m)}
          {unitLabel}
        </div>
        <div className="text-text-muted truncate mt-1 text-[12px]">{wi.label}</div>
      </div>
    </div>
  );

  const Details = (
    <div className="grid grid-cols-3 gap-1.5 shrink-0">
      <Stat label="Feels" value={`${Math.round(current.apparent_temperature)}${unitLabel}`} />
      <Stat label="Humidity" value={`${current.relative_humidity_2m}%`} />
      <Stat
        label="Wind"
        value={`${Math.round(current.wind_speed_10m)} ${windUnit} ${windDir(current.wind_direction_10m)}`}
      />
    </div>
  );

  // Next ~12 hours from the current hour (only when enabled + room to show it).
  const showHourly = !!config?.hourly && (tall || (wide && !tall));
  const HourlyStrip = (() => {
    const hr = data.hourly;
    if (!hr?.time?.length) return null;
    const nowMs = Date.now();
    let start = hr.time.findIndex((t) => new Date(t).getTime() >= nowMs - 30 * 60_000);
    if (start < 0) start = 0;
    // Fit the hours to the widget width instead of scrolling.
    const count = veryWide ? 12 : wide ? 8 : 5;
    const slice = hr.time.slice(start, start + count);
    return (
      <div className="shrink-0 flex gap-1">
        {slice.map((t, k) => {
          const idx = start + k;
          const H = wmoIcon(hr.weather_code[idx], true).Icon;
          const hour = new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", hour12: false }).slice(0, 2);
          return (
            <div key={t} className="flex-1 min-w-0 flex flex-col items-center gap-0.5 rounded-md bg-bg-card/40 px-0.5 py-1.5">
              <span className="text-[9.5px] text-text-muted tabular-nums">{k === 0 ? "now" : `${hour}h`}</span>
              <div className="w-5 h-5"><H className="w-full h-full" /></div>
              <span className="text-[11px] font-mono tabular-nums text-text">{Math.round(hr.temperature_2m[idx])}°</span>
            </div>
          );
        })}
      </div>
    );
  })();

  const ForecastRow = (
    <div className="flex-1 flex gap-1.5 min-h-0">
      {(data.daily?.time ?? []).slice(0, numForecast).map((d, i) => {
        const F = wmoIcon(data.daily!.weather_code[i], true).Icon;
        return (
          <div
            key={d}
            className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 rounded-md bg-bg-card/40 px-1 py-1.5"
          >
            <span className="text-[10.5px] text-text-muted truncate max-w-full">{dayLabel(d, i)}</span>
            <div className="w-6 h-6 shrink-0">
              <F className="w-full h-full" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-[12px] font-mono font-semibold tabular-nums text-text">
                {Math.round(data.daily!.temperature_2m_max[i])}°
              </span>
              <span className="text-[11px] font-mono tabular-nums text-text-muted">
                {Math.round(data.daily!.temperature_2m_min[i])}°
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // 2×2 — compact, everything centered.
  if (!wide && !tall) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 p-3 overflow-hidden">
        <div className="w-16 h-16">
          <Icon className="w-full h-full" />
        </div>
        <div className="text-3xl font-mono font-semibold tabular-nums text-text leading-none">
          {Math.round(current.temperature_2m)}
          {unitLabel}
        </div>
        <div className="text-[12px] text-text-muted truncate max-w-full">{wi.label}</div>
        {city && (
          <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted/70 truncate max-w-full">
            {city}
          </div>
        )}
      </div>
    );
  }

  // Narrow & tall (w=2, h≥3) — hero on top, vertical forecast list below.
  if (!wide && tall) {
    return (
      <div className="h-full flex flex-col gap-2 p-3 overflow-hidden">
        {Header}
        {Hero}
        {showHourly && HourlyStrip}
        <div className="flex-1 flex flex-col min-h-0 gap-0.5 overflow-hidden">
          {(data.daily?.time ?? []).slice(0, veryTall ? 7 : 5).map((d, i) => {
            const F = wmoIcon(data.daily!.weather_code[i], true).Icon;
            return (
              <div
                key={d}
                className="flex items-center gap-2 py-1 border-t border-border-subtle first:border-0"
              >
                <span className="text-[11px] text-text-muted w-12 shrink-0">{dayLabel(d, i)}</span>
                <div className="w-5 h-5 shrink-0">
                  <F className="w-full h-full" />
                </div>
                <span className="flex-1" />
                <span className="text-[12px] font-mono tabular-nums text-text">
                  {Math.round(data.daily!.temperature_2m_max[i])}°
                </span>
                <span className="text-[12px] font-mono tabular-nums text-text-muted">
                  {Math.round(data.daily!.temperature_2m_min[i])}°
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Wide — everything stacked vertically (never side-by-side, so nothing clips):
  // header · hero · [details] · [forecast].
  return (
    <div className="h-full flex flex-col gap-2 p-3 overflow-hidden">
      {Header}
      {Hero}
      {showDetails && Details}
      {showHourly && HourlyStrip}
      {tall && ForecastRow}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md bg-bg-card/40 px-1.5 py-1 min-w-0">
      <span className="text-[10px] text-text-muted truncate w-full text-center">{label}</span>
      <span className="text-[11px] font-mono font-semibold tabular-nums text-text truncate w-full text-center">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config panel — city search via Open-Meteo geocoding + manual lat/lon
// ---------------------------------------------------------------------------

function WeatherConfigPanel({ config, save }: WidgetConfigProps<WeatherConfig>) {
  const [search, setSearch] = useState(config?.city ?? "");
  const [results, setResults] = useState<GeocodingResponse["results"]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = async () => {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const r = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5`,
      );
      const data = (await r.json()) as GeocodingResponse;
      setResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  };

  const pick = (city: string, lat: number, lon: number) => {
    save({ city, lat, lon });
    setResults([]);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          City
        </label>
        <div className="flex gap-1.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder="e.g. Bogotá"
            className="flex-1 px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={runSearch}
            disabled={searching || !search.trim()}
            className="px-3 py-1.5 text-[11px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted disabled:opacity-40"
          >
            {searching ? "…" : "Search"}
          </button>
        </div>
        {results && results.length > 0 && (
          <div className="rounded border border-border-subtle bg-bg-card/40 max-h-40 overflow-auto">
            {results.map((r) => (
              <button
                key={`${r.latitude},${r.longitude}`}
                onClick={() => pick(r.name, r.latitude, r.longitude)}
                className="w-full text-left px-2 py-1 text-[12px] text-text-secondary hover:text-text hover:bg-bg-hover"
              >
                <span className="text-text">{r.name}</span>
                {r.country && (
                  <span className="text-text-muted text-[11px] ml-1">· {r.country}</span>
                )}
                <span className="text-text-muted/60 text-[10px] font-mono ml-1">
                  {r.latitude.toFixed(2)}, {r.longitude.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {config?.lat != null && config?.lon != null && (
        <div className="text-[10px] text-text-muted font-mono">
          Current: {config.lat.toFixed(2)}, {config.lon.toFixed(2)}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Units
        </label>
        <div className="inline-flex p-0.5 rounded-md border border-border-subtle bg-bg-card/40">
          {(["celsius", "fahrenheit"] as const).map((u) => (
            <button
              key={u}
              onClick={() => save({ units: u })}
              className={`px-3 py-1 text-[11px] rounded transition-colors ${
                (config?.units ?? "celsius") === u
                  ? "bg-bg-elevated text-text shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {u === "celsius" ? "°C" : "°F"}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={!!config?.hourly}
          onChange={(e) => save({ hourly: e.target.checked })}
          className="accent-accent"
        />
        Show hourly forecast
      </label>
      <p className="text-[10px] text-text-muted leading-snug -mt-1">
        Adds a next-12-hours strip when the widget is tall enough.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

const WeatherIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A4 4 0 0 0 7 18z" />
    <line x1="8" y1="20" x2="7" y2="23" />
    <line x1="12" y1="20" x2="11" y2="23" />
    <line x1="16" y1="20" x2="15" y2="23" />
  </svg>
);

const def: WidgetDefinition<WeatherConfig> = {
  type: "weather",
  title: "Weather",
  icon: WeatherIcon,
  category: "external",
  description: "Current conditions + multi-day forecast via Open-Meteo. No auth required.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 4,
  defaultW: 4,
  defaultH: 4,
  defaultConfig: { units: "celsius" },
  Component: WeatherWidget,
  ConfigPanel: WeatherConfigPanel,
};

export default def;
