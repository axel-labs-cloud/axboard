import type { ComponentType, ReactNode } from "react";

export type WidgetType =
  | "clock"
  | "shortcut"
  | "checklist"
  | "apps"
  | "app";

export type WidgetCategory = "system" | "infrastructure" | "productivity" | "external";

export interface ClockConfig {
  use24h?: boolean;
  timezones?: string[];
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
}

/**
 * Single-app widget — one prominent tile bound to one service.
 */
export interface AppConfig {
  appId?: string;
}

export type WidgetConfigByType = {
  clock: ClockConfig;
  shortcut: ShortcutConfig;
  checklist: ChecklistConfig;
  apps: AppsConfig;
  app: AppConfig;
};

export type AnyWidgetConfig = Partial<
  ClockConfig & ShortcutConfig & ChecklistConfig & AppsConfig & AppConfig
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
