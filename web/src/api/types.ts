import type { AnyWidgetConfig, GridItem } from "../features/dashboard/widgets/types";

export type HealthType = "http" | "tcp" | "none";
export type AppStatusValue = "unknown" | "healthy" | "degraded" | "down";

export interface HealthCheck {
  type: HealthType;
  url?: string;
  host?: string;
  port?: number;
  expect_status?: number;
  interval?: string;
  timeout?: string;
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

export interface DashboardDef {
  id: string;
  name: string;
  default?: boolean;
  widgets?: WidgetDef[];
}

export interface ServerConfig {
  bind?: string;
}

export interface Config {
  server?: ServerConfig;
  apps?: AppDef[];
  groups?: GroupDef[];
  dashboards?: DashboardDef[];
}

export interface AppStatus {
  status: AppStatusValue;
  last_checked?: string;
  response_ms?: number;
  error?: string;
}

export type StatusMap = Record<string, AppStatus>;

export interface State {
  gridVersion?: number;
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
