import type { WidgetDefinition, WidgetType } from "./types";
import clock from "./clock";
import shortcut from "./shortcut";
import checklist from "./checklist";
import apps from "./apps";
import app from "./app";
import weather from "./weather";
import iframe from "./iframe";
import concentus from "./concentus";
import status from "./status";
import notes from "./notes";
import countdown from "./countdown";
import image from "./image";
import rss from "./rss";
import calendar from "./calendar";
import containers from "./containers";
import host from "./host";
import sun from "./sun";
import pomodoro from "./pomodoro";
import search from "./search";
import section from "./section";
import monitor from "./monitor";
import publicip from "./publicip";
import markets from "./markets";
import releases from "./releases";
import customapi from "./customapi";
import axdnsd from "./axdnsd";
import axlbd from "./axlbd";
import gauge from "./gauge";
import speedtest from "./speedtest";
import camera from "./camera";
import percpu from "./percpu";
import temps from "./temps";
import topproc from "./topproc";
import disks from "./disks";
import netgraph from "./netgraph";
import battery from "./battery";
import grafana from "./grafana";
import wol from "./wol";
import arr from "./arr";
import proxmox from "./proxmox";
import transmission from "./transmission";
import dns from "./dns";
import media from "./media";
import qbittorrent from "./qbittorrent";
import homeassistant from "./homeassistant";
import portainer from "./portainer";
import scrutiny from "./scrutiny";
import immich from "./immich";
import nextcloud from "./nextcloud";
import seerr from "./seerr";
import paperless from "./paperless";
import pbs from "./pbs";
import traefik from "./traefik";
import tailscale from "./tailscale";
import notify from "./notify";
import halights from "./halights";
import hafan from "./hafan";
import hapower from "./hapower";
import haclimate from "./haclimate";
import hacover from "./hacover";
import hascenes from "./hascenes";
import hasensors from "./hasensors";
import halight from "./halight";
import hafans from "./hafans";
import hacoverone from "./hacoverone";
import hasensor from "./hasensor";
import hamedia from "./hamedia";
import halock from "./halock";
import havacuum from "./havacuum";
import hapresence from "./hapresence";
import habattery from "./habattery";
import unifi from "./unifi";
import speedtesttracker from "./speedtesttracker";
import prometheus from "./prometheus";
import reddit from "./reddit";
import hackernews from "./hackernews";
import lobsters from "./lobsters";
import youtube from "./youtube";
import xkcd from "./xkcd";
import tabgroup from "./tabgroup";
import template from "./template";

export const WIDGETS: Partial<Record<WidgetType, WidgetDefinition<any>>> = {
  clock,
  shortcut,
  checklist,
  apps,
  app,
  weather,
  iframe,
  concentus,
  status,
  notes,
  countdown,
  image,
  rss,
  calendar,
  containers,
  host,
  sun,
  pomodoro,
  search,
  section,
  monitor,
  publicip,
  markets,
  releases,
  customapi,
  axdnsd,
  axlbd,
  gauge,
  speedtest,
  camera,
  percpu,
  temps,
  topproc,
  disks,
  netgraph,
  battery,
  grafana,
  wol,
  arr,
  proxmox,
  transmission,
  dns,
  media,
  qbittorrent,
  homeassistant,
  portainer,
  scrutiny,
  immich,
  nextcloud,
  seerr,
  paperless,
  pbs,
  traefik,
  tailscale,
  notify,
  halights,
  hafan,
  hapower,
  haclimate,
  hacover,
  hascenes,
  hasensors,
  halight,
  hafans,
  hacoverone,
  hasensor,
  hamedia,
  halock,
  havacuum,
  hapresence,
  habattery,
  unifi,
  speedtesttracker,
  prometheus,
  reddit,
  hackernews,
  lobsters,
  youtube,
  xkcd,
  tabgroup,
  template,
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
