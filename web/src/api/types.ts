import type { AnyWidgetConfig, GridItem } from "../features/dashboard/widgets/types";

export type HealthType = "http" | "tcp" | "ping" | "none";
export type AppStatusValue = "unknown" | "healthy" | "degraded" | "down";

export interface HealthCheck {
  type: HealthType;
  url?: string;
  host?: string;
  port?: number;
  expect_status?: number;
  interval?: string;
  timeout?: string;
  headers?: Record<string, string>;
  body_contains?: string;
  insecure?: boolean;
  retries?: number;
}

export interface AppDef {
  id: string;
  name: string;
  url: string;
  icon?: string;
  group?: string;
  description?: string;
  health?: HealthCheck;
}

export interface GroupDef {
  id: string;
  name: string;
  color?: string;
}

export interface WidgetDef {
  i: string;
  type: string;
  title: string;
  config?: AnyWidgetConfig;
}

export interface BackgroundDef {
  type?: "color" | "gradient" | "image";
  color?: string;
  gradient?: string;
  image?: string;
  blur?: number;
  dim?: number;
  fit?: "cover" | "contain" | "tile";
  opacity?: number;
}

export interface HeaderDef {
  clock?: boolean;
  weather?: boolean;
  appsUp?: boolean;
  weatherCity?: string;
  weatherLat?: number;
  weatherLon?: number;
  links?: string[];
  hideSearch?: boolean;
  hideLogo?: boolean;
  hideName?: boolean;
  brandText?: string;
  brandLogo?: string;
  barFlush?: boolean;
}

export interface TopBarDef {
  barStyle?: string;
  header?: HeaderDef;
}

export interface DashboardDef {
  id: string;
  name: string;
  default?: boolean;
  accent?: string;
  background?: BackgroundDef;
  widgets?: WidgetDef[];
}

export interface ServerConfig {
  bind?: string;
}

export interface NtfyDef {
  server?: string;
  topic?: string;
  token?: string;
}
export interface TelegramDef {
  bot_token?: string;
  chat_id?: string;
}
export interface EmailDef {
  smtp_host?: string;
  smtp_port?: number;
  username?: string;
  password?: string;
  from?: string;
  to?: string;
}
export interface AlertsDef {
  webhook_url?: string;
  ntfy?: NtfyDef;
  telegram?: TelegramDef;
  email?: EmailDef;
  cert_expiry_days?: number;
  resend_minutes?: number;
  muted?: string[];
}

export interface NoticeDef {
  severity?: string; // info | warning | critical | maintenance
  title?: string;
  message?: string;
  active?: boolean;
}

export interface StatusPageDef {
  slug?: string;
  enabled?: boolean;
  title?: string;
  header?: string;
  footer?: string;
  hide_branding?: boolean;
  groups?: string[];
  apps?: string[];
  theme?: string; // "dark" | "light"
  notices?: NoticeDef[];
}

export interface Config {
  server?: ServerConfig;
  apps?: AppDef[];
  groups?: GroupDef[];
  topBar?: TopBarDef;
  dashboards?: DashboardDef[];
  alerts?: AlertsDef;
  status_pages?: StatusPageDef[];
}

export interface AppStatus {
  status: AppStatusValue;
  last_checked?: string;
  response_ms?: number;
  error?: string;
  cert_expiry?: string; // ISO datetime of the TLS leaf cert's NotAfter
}

export type StatusMap = Record<string, AppStatus>;

export interface DiscoveredService {
  name: string;
  url: string;
  icon?: string;
  group?: string;
  source: string;
}

export interface HistoryPoint {
  status: AppStatusValue;
  response_ms: number;
  at: string;
}

export type HistoryMap = Record<string, HistoryPoint[]>;

export interface ContainerInfo {
  name: string;
  image: string;
  state: string;
  status: string;
  cpu?: number; // percent (running only, when stats requested)
  mem?: number; // bytes in use
  memLimit?: number; // bytes limit
}

export interface HostStats {
  cpus: number;
  cpu_pct: number;
  load1: number;
  load5: number;
  load15: number;
  mem_total: number;
  mem_used: number;
  swap_total: number;
  swap_used: number;
  disk_path: string;
  disk_total: number;
  disk_used: number;
  disk_read_bps: number;
  disk_write_bps: number;
  net_rx_bps: number;
  net_tx_bps: number;
  uptime_sec: number;
  per_cpu: number[];
  temps: { label: string; celsius: number }[];
  batteries: { name: string; pct: number; status: string }[];
  filesystems: { path: string; type: string; total: number; used: number }[];
}

export interface ProcInfo {
  pid: number;
  name: string;
  cpu: number;
  rss: number;
}

export interface State {
  layouts?: Record<string, GridItem[]>;
  widgetConfigs?: Record<string, AnyWidgetConfig>;
  lastActive?: string;
}

export interface ConfigError {
  message: string;
  line?: number;
  column?: number;
}

export type SSEEvent =
  | { type: "config_changed" }
  | { type: "config_error"; error: ConfigError };
