import type { ComponentType, ReactNode } from "react";

export type WidgetType =
  | "clock"
  | "shortcut"
  | "checklist"
  | "apps";

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

export type AppsDensity = "compact" | "default" | "detailed";

export interface AppsConfig {
  /** Filter to a subset of group IDs. Empty/undefined = show all groups. */
  groups?: string[];
  density?: AppsDensity;
}

export type WidgetConfigByType = {
  clock: ClockConfig;
  shortcut: ShortcutConfig;
  checklist: ChecklistConfig;
  apps: AppsConfig;
};

export type AnyWidgetConfig = Partial<
  ClockConfig & ShortcutConfig & ChecklistConfig & AppsConfig
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
