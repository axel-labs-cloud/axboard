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
  | "camera"
  | "percpu"
  | "temps"
  | "topproc"
  | "disks"
  | "netgraph"
  | "battery"
  | "grafana"
  | "wol"
  | "arr"
  | "proxmox"
  | "transmission"
  | "dns"
  | "media"
  | "qbittorrent"
  | "homeassistant"
  | "portainer"
  | "scrutiny"
  | "immich"
  | "nextcloud"
  | "seerr"
  | "paperless"
  | "pbs"
  | "traefik"
  | "tailscale"
  | "notify"
  | "halights"
  | "hafan"
  | "hapower"
  | "haclimate"
  | "hacover"
  | "hascenes"
  | "hasensors"
  | "halight"
  | "hafans"
  | "hacoverone"
  | "hasensor";

export type WidgetCategory = "productivity" | "system" | "services" | "homeassistant" | "network" | "external";

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
  title?: string;
  /** Render the body as Markdown (click to edit). Default off (plain text). */
  markdown?: boolean;
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

/** Resource gauge — one host metric drawn as a ring / bar / sparkline. */
export interface GaugeConfig {
  metric?: "cpu" | "ram" | "disk" | "swap";
  /** Optional second metric — renders two gauges split in the tile. */
  metric2?: "none" | "cpu" | "ram" | "disk" | "swap";
  style?: "ring" | "bar" | "spark";
  label?: string; // overrides the default metric name
  /** How the fill colour is chosen (see colorScale.tsx). */
  colorScale?: "threshold" | "gradient" | "solid" | "accent";
  color?: string; // palette key for the "solid" scale
  warn?: number; // amber breakpoint %, for "threshold"
  crit?: number; // red breakpoint %, for "threshold"
  /** Add a soft neon glow around the fill. Default on. */
  glow?: boolean;
  /** Show a faint track behind the fill. Default on. */
  track?: boolean;
  /** History window for the sparkline style. */
  window?: "1m" | "5m" | "15m" | "1h";
  /** Force the text-free icon ring/bar at any size. */
  compact?: boolean;
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
  /** Title text colour (hex/css). Default white. */
  titleColor?: string;
  fit?: "cover" | "contain";
  /** Optional click-through URL (e.g. the full Frigate UI). */
  link?: string;
}

/** Per-core CPU widget — one bar per logical core. */
export interface PerCpuConfig {
  colorScale?: "threshold" | "gradient" | "solid" | "accent";
  color?: string;
  warn?: number;
  crit?: number;
}

/** Temperatures widget — hardware sensors from /sys/class/hwmon. */
export interface TempsConfig {
  /** Explicit list of sensor labels to show. undefined = a default subset. */
  sensors?: string[];
  /** Custom display names, keyed by the raw sensor label. */
  names?: Record<string, string>;
  colorScale?: "threshold" | "gradient" | "solid" | "accent";
  color?: string;
  warn?: number; // amber °C
  crit?: number; // red °C
}

/** Top-processes widget — highest CPU/mem processes. */
export interface TopProcConfig {
  count?: number;
  sort?: "cpu" | "mem";
}

/** Filesystems widget — usage bars for every mounted real filesystem. */
export interface DisksConfig {
  /** Explicit list of mount paths to show. undefined = all. */
  mounts?: string[];
  colorScale?: "threshold" | "gradient" | "solid" | "accent";
  color?: string;
  warn?: number;
  crit?: number;
}

/** Network throughput graph — live rx/tx sparkline. */
export interface NetGraphConfig {
  /** Fixed scale in Mbit/s; 0/undefined = auto-scale to the window peak. */
  scaleMbit?: number;
  /** mirror = in above / out below a centre line; stack = both from the bottom. */
  style?: "mirror" | "stack";
  colorIn?: string; // palette key for download
  colorOut?: string; // palette key for upload
  window?: "1m" | "5m" | "15m" | "1h";
}

/** Battery / UPS widget — power supplies from /sys/class/power_supply. */
export interface BatteryConfig {
  empty?: never;
}

/** Grafana panel embed — an iframe pointed at a kiosk panel URL. */
export interface GrafanaConfig {
  url?: string;
  refreshSec?: number;
  title?: string;
}

/** Wake-on-LAN launcher — a grid of buttons that send magic packets. */
export interface WolTarget {
  name: string;
  mac: string;
  broadcast?: string;
}
export interface WolConfig {
  targets?: WolTarget[];
  title?: string;
}

/** One Proxmox endpoint (a standalone node or any node of a cluster). */
export interface ProxmoxServer {
  name?: string; // optional label; falls back to the host
  baseUrl?: string; // e.g. https://10.10.0.31:8006
  tokenId?: string; // user@realm!tokenid
  tokenSecret?: string; // the token UUID
}

/** Proxmox VE widget — one or more servers; nodes + VMs/LXC with live usage. */
export interface ProxmoxConfig {
  servers?: ProxmoxServer[];
  title?: string;
  showSummary?: boolean; // cluster capacity line — default true
  showGuests?: boolean; // default true
  showStorage?: boolean; // default true
  showBackups?: boolean; // last-backup age per guest (extra API calls) — default false
  compact?: boolean; // node-only slim overview — default false
  metricStyle?: "bar" | "pct" | "both"; // how CPU/RAM cells render — default "both"
  // Legacy single-server fields (pre-multi); still honoured as one server.
  baseUrl?: string;
  tokenId?: string;
  tokenSecret?: string;
}

/** Sonarr/Radarr widget — download queue + upcoming calendar via the *arr v3 API. */
export interface ArrConfig {
  kind?: "sonarr" | "radarr";
  baseUrl?: string; // e.g. http://172.24.2.100:8989
  apiKey?: string; // Settings → General → API Key
  title?: string;
  days?: number; // calendar look-ahead (default 7)
}

/** Transmission widget — torrent list + rates via the RPC (CSRF-handshake) API. */
export interface TransmissionConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:9091
  username?: string; // optional HTTP basic auth
  password?: string;
  title?: string;
  max?: number; // rows to show (default 8)
}

/** DNS sinkhole widget — Pi-hole, AdGuard Home or Technitium query/block stats. */
export interface DnsConfig {
  kind?: "pihole" | "adguard" | "technitium";
  baseUrl?: string; // e.g. http://172.24.2.100 (pihole) / :3000 (adguard) / :5380 (technitium)
  token?: string; // pihole app password / API token; technitium API token
  username?: string; // adguard basic-auth user
  password?: string; // adguard basic-auth pass
  title?: string;
}

/** Media server widget — Jellyfin or Plex: now-playing sessions + library counts. */
export interface MediaConfig {
  kind?: "jellyfin" | "plex";
  baseUrl?: string; // e.g. http://172.24.2.100:8096 (jellyfin) / :32400 (plex)
  token?: string; // Jellyfin API key / Plex X-Plex-Token
  title?: string;
}

/** qBittorrent widget — torrent list + rates over the WebUI API (cookie login). */
export interface QbittorrentConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:8080
  username?: string;
  password?: string;
  title?: string;
  max?: number; // rows (default 8)
}

/** Home Assistant widget — entity roll-up (people home, lights/switches on) + custom entities. */
export interface HomeAssistantConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:8123
  token?: string; // long-lived access token
  entities?: string[]; // extra entity_ids to show verbatim
  title?: string;
}

/** Portainer widget — container counts from an endpoint snapshot. */
export interface PortainerConfig {
  baseUrl?: string; // e.g. https://172.24.2.100:9443
  apiKey?: string; // X-API-Key
  env?: number; // endpoint id (defaults to the first)
  title?: string;
}

/** Scrutiny widget — disk SMART health summary (no auth). */
export interface ScrutinyConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:8080
  title?: string;
}

/** Immich widget — photo/video library statistics. */
export interface ImmichConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:2283
  apiKey?: string; // x-api-key (needs server.statistics permission)
  title?: string;
}

/** Nextcloud widget — serverinfo stats (free space, users, files, shares). */
export interface NextcloudConfig {
  baseUrl?: string; // e.g. https://cloud.example.com
  token?: string; // NC-Token (Settings → System) — or use username/password
  username?: string;
  password?: string;
  title?: string;
}

/** Overseerr / Jellyseerr widget — media request counts. */
export interface SeerrConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:5055
  apiKey?: string; // X-Api-Key
  title?: string;
}

/** Paperless-ngx widget — document statistics. */
export interface PaperlessConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:8000
  token?: string; // Authorization: Token …
  title?: string;
}

/** Proxmox Backup Server widget — datastore usage. */
export interface PbsConfig {
  baseUrl?: string; // e.g. https://172.24.2.100:8007
  tokenId?: string; // user@realm!tokenid
  tokenSecret?: string;
  title?: string;
}

/** Traefik widget — router / service / middleware counts. */
export interface TraefikConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:8080 (api/dashboard)
  username?: string; // optional basic auth
  password?: string;
  title?: string;
}

/** Tailscale widget — tailnet device status (Tailscale cloud API). */
export interface TailscaleConfig {
  tailnet?: string; // e.g. example.com or "-" for default
  apiKey?: string; // Tailscale API access token (tskey-api-…)
  title?: string;
}

/** Notifications widget — Gotify or ntfy server message/app counts. */
export interface NotifyConfig {
  kind?: "gotify" | "ntfy";
  baseUrl?: string; // e.g. http://172.24.2.100:8080 (gotify) / :80 (ntfy)
  token?: string; // gotify client token / ntfy access token
  topic?: string; // ntfy topic to read
  title?: string;
}

/** Home Assistant lights — toggle + brightness for the chosen light entities. */
export interface HassLightsConfig {
  baseUrl?: string; // e.g. http://172.24.2.100:8123
  token?: string; // long-lived access token
  entities?: string[]; // light.* (or switch.*) entity ids
  title?: string;
}

/** Home Assistant fan — on/off + speed for a single fan entity. */
export interface HassFanConfig {
  baseUrl?: string;
  token?: string;
  entity?: string; // fan.* entity id
  title?: string;
}

/** Home Assistant power — live power/energy sensor readouts. */
export interface HassPowerConfig {
  baseUrl?: string;
  token?: string;
  entities?: string[]; // sensor.* (power/energy) entity ids
  max?: number; // watts for the current-draw bar scale (default 3000)
  title?: string;
}

/** Home Assistant climate — thermostat control for one climate entity. */
export interface HassClimateConfig {
  baseUrl?: string;
  token?: string;
  entity?: string; // climate.* entity id
  title?: string;
}

/** Home Assistant covers — open/close/stop + position for the chosen covers. */
export interface HassCoverConfig {
  baseUrl?: string;
  token?: string;
  entities?: string[]; // cover.* entity ids
  title?: string;
}

/** Home Assistant scenes — one-tap buttons for scenes / scripts / automations. */
export interface HassScenesConfig {
  baseUrl?: string;
  token?: string;
  entities?: string[]; // scene.* / script.* / button.* / automation.*
  title?: string;
}

/** Home Assistant sensors — read-only value tiles for any sensors. */
export interface HassSensorsConfig {
  baseUrl?: string;
  token?: string;
  entities?: string[]; // sensor.* / binary_sensor.*
  title?: string;
}

/** A single-source Home Assistant widget (one entity, name shown in the header). */
export interface HassOneConfig {
  baseUrl?: string;
  token?: string;
  entity?: string;
  title?: string;
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
  percpu: PerCpuConfig;
  temps: TempsConfig;
  topproc: TopProcConfig;
  disks: DisksConfig;
  netgraph: NetGraphConfig;
  battery: BatteryConfig;
  grafana: GrafanaConfig;
  wol: WolConfig;
  arr: ArrConfig;
  proxmox: ProxmoxConfig;
  transmission: TransmissionConfig;
  dns: DnsConfig;
  media: MediaConfig;
  qbittorrent: QbittorrentConfig;
  homeassistant: HomeAssistantConfig;
  portainer: PortainerConfig;
  scrutiny: ScrutinyConfig;
  immich: ImmichConfig;
  nextcloud: NextcloudConfig;
  seerr: SeerrConfig;
  paperless: PaperlessConfig;
  pbs: PbsConfig;
  traefik: TraefikConfig;
  tailscale: TailscaleConfig;
  notify: NotifyConfig;
  halights: HassLightsConfig;
  hafan: HassFanConfig;
  hapower: HassPowerConfig;
  haclimate: HassClimateConfig;
  hacover: HassCoverConfig;
  hascenes: HassScenesConfig;
  hasensors: HassSensorsConfig;
  halight: HassOneConfig;
  hafans: HassCoverConfig;
  hacoverone: HassOneConfig;
  hasensor: HassOneConfig;
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
    CameraConfig &
    PerCpuConfig &
    TempsConfig &
    TopProcConfig &
    DisksConfig &
    NetGraphConfig &
    BatteryConfig &
    GrafanaConfig &
    WolConfig
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
  // Optional picker grouping: definitions that share a `group` collapse into one
  // card in the Add-widget drawer that expands to the variants (labelled by
  // `variant`, e.g. single vs multi).
  group?: string;
  variant?: string;

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
