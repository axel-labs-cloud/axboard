import type { AnyWidgetConfig, WidgetType } from "./widgets/types";

// A dashboard template is a named starter layout: a set of widgets with grid
// positions (24-col space) that instantiates as a new dashboard. Widget ids are
// generated at instantiation time so a template can be used repeatedly.
export interface TemplateWidget {
  type: WidgetType;
  title: string;
  config?: AnyWidgetConfig;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  widgets: TemplateWidget[];
}

export const TEMPLATES: DashboardTemplate[] = [
  {
    id: "overview",
    name: "Overview",
    description: "Clock, weather, a health roll-up, and a services grid.",
    widgets: [
      { type: "clock", title: "Clock", x: 0, y: 0, w: 4, h: 3, config: { use24h: true } },
      { type: "weather", title: "Weather", x: 4, y: 0, w: 5, h: 3 },
      { type: "status", title: "Service health", x: 9, y: 0, w: 4, h: 3, config: { showLegend: true } },
      { type: "apps", title: "Services", x: 0, y: 3, w: 13, h: 5, config: { appIds: [] } },
    ],
  },
  {
    id: "monitoring",
    name: "Monitoring",
    description: "Health summary by group plus space for service grids.",
    widgets: [
      { type: "status", title: "By group", x: 0, y: 0, w: 6, h: 4, config: { byGroup: true } },
      { type: "status", title: "Totals", x: 6, y: 0, w: 3, h: 4, config: { showLegend: true } },
      { type: "apps", title: "Infrastructure", x: 0, y: 4, w: 9, h: 5, config: { appIds: [] } },
      { type: "notes", title: "Notes", x: 9, y: 0, w: 4, h: 9, config: { text: "" } },
    ],
  },
  {
    id: "personal",
    name: "Personal",
    description: "Clock, a countdown, a scratchpad, and a bookmark grid.",
    widgets: [
      { type: "clock", title: "Clock", x: 0, y: 0, w: 4, h: 3 },
      { type: "countdown", title: "Countdown", x: 4, y: 0, w: 4, h: 3 },
      { type: "notes", title: "Notes", x: 0, y: 3, w: 4, h: 4, config: { text: "" } },
      { type: "shortcut", title: "Bookmarks", x: 4, y: 3, w: 4, h: 4 },
    ],
  },
];
