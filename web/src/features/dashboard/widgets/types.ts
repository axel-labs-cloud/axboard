import type { ComponentType, ReactNode } from "react";

export type WidgetType =
  | "clock"
  | "shortcut"
  | "checklist"
  | "apps"
  | "app"
  | "weather"
  | "iframe"
  | "concentus"
  | "status"
  | "notes"
  | "countdown"
  | "image"
  | "rss"
  | "calendar"
  | "containers"
  | "host"
  | "sun"
  | "pomodoro"
  | "search"
  | "section"
  | "monitor"
  | "publicip"
  | "markets"
  | "releases"
  | "customapi"
  | "axdnsd"
  | "axlbd"
  | "gauge"
  | "speedtest"
  | "camera";

export type WidgetCategory = "system" | "infrastructure" | "productivity" | "external";

export interface ClockConfig {
  use24h?: boolean;
  timezones?: string[];
  /** Date string format. Short = "Wed, May 27", long = full weekday + year,
   *  iso = 2026-05-27, numeric = 5/27/2026. */
  dateFormat?: "short" | "long" | "iso" | "numeric";
}

export interface ShortcutItem {
  label: string;
  url: string;
  icon: string;
}

export interface ShortcutConfig {
  shortcuts?: ShortcutItem[];
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface ChecklistConfig {
  checklist?: ChecklistItem[];
}

/**
 * Apps grid widget — Shortcut-style. Each instance shows a hand-picked
 * subset of services from config.yaml, laid out as an icon grid.
 */
export interface AppsConfig {
  /** Service IDs (from config.yaml apps) to render, in order. Empty = none. */
  appIds?: string[];
  /** Show the service name under each icon. Default off. */
  showNames?: boolean;
  /** Open links in the same tab instead of a new one. Default off (new tab). */
  openSameTab?: boolean;
  /** Group the tiles by their group with collapsible headers. Default off. */
  grouped?: boolean;
}

/**
 * Single-app widget — one prominent tile bound to one service.
 * The show* fields default to true when undefined; user unchecks to hide.
 * descriptionOverride wins over the app's own description when non-empty.
 */
export interface AppConfig {
  appId?: string;
  showStatus?: boolean;
  showDescription?: boolean;
  descriptionOverride?: string;
  showResponseTime?: boolean;
  showLastChecked?: boolean;
  /** Open in the same tab instead of a new one. Default off (new tab). */
  openSameTab?: boolean;
}

/**
 * Weather widget. Pulls current conditions + forecast from Open-Meteo (no
 * auth required). User picks a city by name; geocoding resolves to lat/lon
 * which is what the forecast API needs.
 */
export interface WeatherConfig {
  city?: string;
  lat?: number;
  lon?: number;
  units?: "celsius" | "fahrenheit";
  hourly?: boolean;
}

/**
 * Iframe / Embed widget. Drops any URL into the dashboard as an iframe.
 * Sites that send X-Frame-Options or a CSP frame-ancestors directive will
 * silently render blank — the widget surfaces an "open in new tab" link
 * either way.
 */
export interface IframeConfig {
  url?: string;
  /** Periodic reload interval in seconds. 0 / undefined disables. */
  refreshSec?: number;
  /** Hide the title bar on the widget surface (just show the iframe). */
  hideTitleBar?: boolean;
}

/**
 * Concentus now-playing widget. Polls /api/v1/sessions/active for the
 * user's active playback session and renders art + title + artist + state.
 * Credentials live in state.yaml (homelab trust model — plaintext).
 */
export interface ConcentusConfig {
  baseUrl?: string;
  username?: string;
  password?: string;
}

/**
 * Status summary widget. Rolls up /api/apps/status into up/degraded/down/unknown
 * counts. No config beyond an optional legend toggle.
 */
export interface StatusSummaryConfig {
  showLegend?: boolean;
  byGroup?: boolean;
  bars?: boolean; // per-service Uptime-Kuma-style history bars
  groups?: string[]; // filter: only these group ids (empty = all)
}

/** Notes / scratchpad widget — free text persisted in config.yaml. */
export interface NotesConfig {
  text?: string;
}

/** Countdown widget — time remaining until (or since) a target datetime. */
export interface CountdownConfig {
  target?: string; // ISO datetime
  label?: string;
}

/** Image / banner widget — a static image, optionally linking somewhere. */
export interface ImageConfig {
  url?: string;
  fit?: "cover" | "contain";
  link?: string;
}

/** RSS/Atom feed widget — reads a feed via the server proxy. */
export interface FeedConfig {
  url?: string;
  count?: number;
  /** Refresh interval in minutes (default 10). */
  refreshMin?: number;
}

/** Calendar widget — reads an iCal (.ics) URL via the server proxy. */
export interface CalendarConfig {
  url?: string;
  count?: number;
  /** "agenda" = upcoming list (default), "month" = month grid with event dots. */
  view?: "agenda" | "month";
  /** Refresh interval in minutes (default 30). */
  refreshMin?: number;
}

/** Container-status widget — filter running containers by a name substring. */
export interface ContainersConfig {
  filter?: string;
  runningOnly?: boolean;
  stats?: boolean; // fetch + show per-container CPU / memory
}

/** Host-stats widget — no options yet. */
export interface HostConfig {
  showLoad?: boolean;
}

/** Sun widget — sunrise/sunset for a lat/lon (reuses weather-style geocoding). */
export interface SunConfig {
  city?: string;
  lat?: number;
  lon?: number;
}

/** Pomodoro widget — work/break lengths in minutes. */
export interface PomodoroConfig {
  work?: number;
  break?: number;
}

/** Search widget — default engine + optional custom template with {q}. */
export interface SearchConfig {
  engine?: "google" | "duckduckgo" | "bing" | "custom";
  customUrl?: string;
  placeholder?: string;
}

/** Section-label widget — a heading/divider to organize the board. */
export interface SectionConfig {
  text?: string;
  align?: "left" | "center";
}

/** Uptime-monitor widget — pings a list of URLs and shows up/down + latency. */
export interface MonitorTarget {
  name: string;
  url: string;
}
export interface MonitorConfig {
  targets?: MonitorTarget[];
  refreshSec?: number;
}

/** Public-IP / VPN widget — shows WAN IP + geo; VPN "on" if isp matches. */
export interface PublicIPConfig {
  expectIsp?: string;
}

/** Markets ticker — crypto (CoinGecko) ids + stock/ETF tickers (Yahoo). */
export interface MarketsConfig {
  ids?: string[];
  vs?: string;
  stocks?: string[];
  /** History window for charts: 1d | 1w | 1m | 3m | 1y | 5y. */
  period?: string;
}

/** Release-watch — "gh:owner/repo" / "gl:group/project" latest releases. */
export interface ReleasesConfig {
  repos?: string[];
}

/** Custom-API — map any JSON endpoint (via proxy) to labeled fields. */
export interface CustomApiField {
  label: string;
  path: string;
}
export interface CustomApiConfig {
  url?: string;
  title?: string;
  fields?: CustomApiField[];
  refreshMin?: number;
}

/** Credentials for an Axel-Labs service (axdnsd/axlbd) — same auth as concentus. */
export interface AxServiceConfig {
  baseUrl?: string;
  username?: string;
  password?: string;
}

/** Resource gauge — one host metric drawn as a ring / bar / arc / sparkline. */
export interface GaugeConfig {
  metric?: "cpu" | "ram" | "disk" | "swap";
  style?: "ring" | "bar" | "arc" | "spark";
  label?: string; // overrides the default metric name
  /** How the fill colour is chosen. threshold = green/amber/red by health,
   *  gradient = smooth green→red spectrum, solid = the picked colour. */
  colorScale?: "threshold" | "gradient" | "solid";
  /** Named colour used by the "solid" scale (and as a tint elsewhere). */
  color?: "accent" | "emerald" | "cyan" | "blue" | "violet" | "amber" | "rose";
  /** Add a soft neon glow around the fill. Default on. */
  glow?: boolean;
  /** Show a faint track behind the fill. Default on. */
  track?: boolean;
}

/** Internet speed test — client-side download/upload/latency via Cloudflare. */
export interface SpeedTestConfig {
  /** Auto-run on load. Default off (manual button). */
  auto?: boolean;
}

/** Camera widget — a Frigate NVR camera or any MJPEG / JPEG stream URL. */
export interface CameraConfig {
  source?: "frigate" | "url";
  /** Frigate base URL, e.g. http://frigate.lan:5000 */
  baseUrl?: string;
  /** Frigate camera name. */
  camera?: string;
  /** Direct stream URL when source = "url" (MJPEG or a refreshing JPEG). */
  streamUrl?: string;
  /** mjpeg = live multipart stream; snapshot = poll a JPEG on an interval. */
  mode?: "mjpeg" | "snapshot";
  /** Snapshot refresh interval in seconds (snapshot mode). Default 2. */
  refreshSec?: number;
  title?: string;
  showTitle?: boolean;
  fit?: "cover" | "contain";
  /** Optional click-through URL (e.g. the full Frigate UI). */
  link?: string;
}

export type WidgetConfigByType = {
  clock: ClockConfig;
  shortcut: ShortcutConfig;
  checklist: ChecklistConfig;
  apps: AppsConfig;
  app: AppConfig;
  weather: WeatherConfig;
  iframe: IframeConfig;
  concentus: ConcentusConfig;
  status: StatusSummaryConfig;
  notes: NotesConfig;
  countdown: CountdownConfig;
  image: ImageConfig;
  rss: FeedConfig;
  calendar: CalendarConfig;
  containers: ContainersConfig;
  host: HostConfig;
  sun: SunConfig;
  pomodoro: PomodoroConfig;
  search: SearchConfig;
  section: SectionConfig;
  monitor: MonitorConfig;
  publicip: PublicIPConfig;
  markets: MarketsConfig;
  releases: ReleasesConfig;
  customapi: CustomApiConfig;
  axdnsd: AxServiceConfig;
  axlbd: AxServiceConfig;
  gauge: GaugeConfig;
  speedtest: SpeedTestConfig;
  camera: CameraConfig;
};

export type AnyWidgetConfig = Partial<
  ClockConfig &
    ShortcutConfig &
    ChecklistConfig &
    AppsConfig &
    AppConfig &
    WeatherConfig &
    IframeConfig &
    ConcentusConfig &
    StatusSummaryConfig &
    NotesConfig &
    CountdownConfig &
    ImageConfig &
    FeedConfig &
    CalendarConfig &
    ContainersConfig &
    HostConfig &
    SunConfig &
    PomodoroConfig &
    SearchConfig &
    SectionConfig &
    MonitorConfig &
    PublicIPConfig &
    MarketsConfig &
    ReleasesConfig &
    CustomApiConfig &
    AxServiceConfig &
    GaugeConfig &
    SpeedTestConfig &
    CameraConfig
>;

export interface Widget {
  i: string;
  type: WidgetType;
  title: string;
  config?: AnyWidgetConfig;
}

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

export interface DashboardLayoutV1 {
  version: 1;
  widgets: Widget[];
  layouts: { lg: GridItem[] };
  accent?: string;
}

export type DashboardLayout = DashboardLayoutV1;

export interface WidgetProps<T = AnyWidgetConfig> {
  config?: T;
  w: number;
  h: number;
  editing: boolean;
  save: (patch: Partial<T>) => void;
}

export interface WidgetConfigProps<T = AnyWidgetConfig> {
  config: T;
  save: (patch: Partial<T>) => void;
}

export interface WidgetDefinition<T = AnyWidgetConfig> {
  type: WidgetType;
  title: string;
  icon: ReactNode;
  category: WidgetCategory;
  description: string;

  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  defaultW: number;
  defaultH: number;

  defaultConfig: T;

  Component: ComponentType<WidgetProps<T>>;
  ConfigPanel?: ComponentType<WidgetConfigProps<T>>;
  Loading?: ComponentType;
}
