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

export interface Config {
  server?: ServerConfig;
  apps?: AppDef[];
  groups?: GroupDef[];
  topBar?: TopBarDef;
  dashboards?: DashboardDef[];
}

export interface AppStatus {
  status: AppStatusValue;
  last_checked?: string;
  response_ms?: number;
  error?: string;
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
}

export interface HostStats {
  cpus: number;
  load1: number;
  load5: number;
  load15: number;
  mem_total: number;
  mem_used: number;
  uptime_sec: number;
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
