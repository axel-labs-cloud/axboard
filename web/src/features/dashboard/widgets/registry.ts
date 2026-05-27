import type { WidgetDefinition, WidgetType } from "./types";
import clock from "./clock";
import shortcut from "./shortcut";
import checklist from "./checklist";
import apps from "./apps";
import app from "./app";
import weather from "./weather";

export const WIDGETS: Partial<Record<WidgetType, WidgetDefinition<any>>> = {
  clock,
  shortcut,
  checklist,
  apps,
  app,
  weather,
};

export function getWidgetDefinition(type: WidgetType): WidgetDefinition<any> | undefined {
  return WIDGETS[type];
}

export function listWidgetDefinitions(): WidgetDefinition<any>[] {
  return Object.values(WIDGETS).filter(Boolean) as WidgetDefinition<any>[];
}

export function listWidgetsByCategory(): Record<string, WidgetDefinition<any>[]> {
  const result: Record<string, WidgetDefinition<any>[]> = {
    system: [],
    infrastructure: [],
    productivity: [],
    external: [],
  };
  for (const def of listWidgetDefinitions()) {
    result[def.category].push(def);
  }
  return result;
}
