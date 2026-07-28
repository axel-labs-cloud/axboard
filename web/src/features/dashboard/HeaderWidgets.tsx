import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { HeaderDef } from "../../api/types";
import { wmoIcon } from "./widgets/weather/icons";

// ---------------------------------------------------------------------------
// Small top-bar widgets (homepage-style header). Each is self-contained and
// fetches its own data; they render compactly to sit in the tab bar.
// ---------------------------------------------------------------------------

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="font-mono tabular-nums text-text text-[13px]">
        {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="text-text-muted text-[9px] uppercase tracking-wider mt-0.5">
        {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
      </span>
    </div>
  );
}

function HeaderWeather({ header }: { header: HeaderDef }) {
  const lat = header.weatherLat;
  const lon = header.weatherLon;
  const { data } = useQuery({
    queryKey: ["header-weather", lat, lon],
    enabled: lat != null && lon != null,
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
    queryFn: async () => {
      const p = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: "temperature_2m,weather_code,is_day",
        timezone: "auto",
      });
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
      if (!r.ok) throw new Error(`weather ${r.status}`);
      return (await r.json()) as {
        current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
        current_units?: { temperature_2m?: string };
      };
    },
  });

  if (lat == null || lon == null) return null;
  const c = data?.current;
  if (!c) return <span className="text-text-muted text-[11px]">…</span>;
  const wi = wmoIcon(c.weather_code ?? 0, c.is_day !== 0);
  const Icon = wi.Icon;
  const unit = data?.current_units?.temperature_2m ?? "°";
  return (
    <div className="flex items-center gap-1.5" title={`${header.weatherCity ?? ""} · ${wi.label}`}>
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className="font-mono tabular-nums text-text text-[13px]">
        {c.temperature_2m != null ? Math.round(c.temperature_2m) : "–"}
        <span className="text-text-muted text-[10px]">{unit.replace("°C", "°").replace("°F", "°")}</span>
      </span>
    </div>
  );
}

function HeaderAppsUp({ apps }: { apps: string[] }) {
  const { data } = useQuery({
    queryKey: ["apps-status"],
    queryFn: api.getStatus,
    refetchInterval: 15_000,
  });
  if (apps.length === 0) return null;
  const statuses = apps.map((id) => data?.[id]?.status ?? "unknown");
  const up = statuses.filter((s) => s === "healthy").length;
  const down = statuses.filter((s) => s === "down").length;
  const tone = down > 0 ? "text-down" : up === apps.length ? "text-up" : "text-degraded";
  const dot = down > 0 ? "bg-down" : up === apps.length ? "bg-up" : "bg-degraded";
  return (
    <div className="flex items-center gap-1.5" title="Services up / total">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className={`font-mono tabular-nums text-[12px] ${tone}`}>
        {up}
        <span className="text-text-muted">/{apps.length}</span>
      </span>
    </div>
  );
}

/** Renders the enabled header widgets as a compact inline row. */
export function HeaderWidgets({ header, apps }: { header?: HeaderDef; apps: string[] }) {
  if (!header) return null;
  const items: ReactNode[] = [];
  if (header.appsUp) items.push(<HeaderAppsUp key="apps" apps={apps} />);
  if (header.weather) items.push(<HeaderWeather key="weather" header={header} />);
  if (header.clock) items.push(<HeaderClock key="clock" />);
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-3">
      {items.map((it, i) => (
        <div key={i} className="flex items-center">
          {i > 0 && <span className="w-px h-5 bg-border-subtle mr-3" />}
          {it}
        </div>
      ))}
    </div>
  );
}
