import type {
  Config,
  State,
  StatusMap,
  HistoryMap,
  DiscoveredService,
  ContainerInfo,
  HostStats,
  ProcInfo,
} from "./types";

async function jsonOk<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${body ? `: ${body}` : ""}`);
  }
  return (await r.json()) as T;
}

export const api = {
  getConfig: () => fetch("/api/config").then(jsonOk<Config>),
  putConfig: (cfg: Config) =>
    fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    }).then(jsonOk<Config>),

  getState: () => fetch("/api/state").then(jsonOk<State>),
  putState: (s: State) =>
    fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    }).then(jsonOk<State>),

  getRawConfig: async (): Promise<string> => {
    const r = await fetch("/api/config/raw");
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.text();
  },
  putRawConfig: async (text: string): Promise<void> => {
    const r = await fetch("/api/config/raw", {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: text,
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}) as { error?: string });
      throw new Error(body.error || `${r.status} ${r.statusText}`);
    }
  },

  uploadIcon: async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/icons", { method: "POST", body: fd });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}) as { error?: string });
      throw new Error(b.error || `${r.status} ${r.statusText}`);
    }
    return (await r.json()).icon as string;
  },

  getVersion: () =>
    fetch("/api/version").then(jsonOk<{ version?: string; buildDate?: string }>),

  getStatus: () => fetch("/api/apps/status").then(jsonOk<StatusMap>),
  getHistory: () => fetch("/api/apps/history").then(jsonOk<HistoryMap>),
  getUptime: () =>
    fetch("/api/apps/uptime").then(jsonOk<Record<string, { "24h": number; "7d": number; "30d": number }>>),
  discover: () =>
    fetch("/api/discover").then(jsonOk<{ services: DiscoveredService[]; error?: string }>),
  getContainers: (stats?: boolean) =>
    fetch(`/api/containers${stats ? "?stats=1" : ""}`).then(
      jsonOk<{ containers: ContainerInfo[]; error?: string }>,
    ),
  restartContainer: (nameOrId: string) =>
    fetch(`/api/containers/${encodeURIComponent(nameOrId)}/restart`, { method: "POST" }).then(
      jsonOk<{ ok: boolean; error?: string }>,
    ),
  testAlert: (channel?: string) =>
    fetch(`/api/alerts/test${channel ? `?channel=${encodeURIComponent(channel)}` : ""}`, { method: "POST" }).then(
      jsonOk<{ ok: boolean; channels?: string[]; error?: string }>,
    ),
  getHost: () => fetch("/api/host").then(jsonOk<HostStats>),
  getHostProcs: (n = 8) =>
    fetch(`/api/host/procs?n=${n}`).then(jsonOk<{ procs: ProcInfo[] }>),
  wol: (mac: string, broadcast?: string) =>
    fetch(`/api/wol?mac=${encodeURIComponent(mac)}${broadcast ? `&broadcast=${encodeURIComponent(broadcast)}` : ""}`, {
      method: "POST",
    }).then(jsonOk<{ ok: boolean; error?: string }>),
  ping: (url: string) =>
    fetch(`/api/ping?url=${encodeURIComponent(url)}`).then(
      jsonOk<{ ok: boolean; status?: number; ms?: number; error?: string }>,
    ),
  getPublicIp: () =>
    fetch("/api/publicip").then(
      jsonOk<{ ip?: string; city?: string; country?: string; isp?: string; org?: string }>,
    ),
  forceCheck: (id: string) =>
    fetch(`/api/apps/${encodeURIComponent(id)}/check`, { method: "POST" }).then(
      jsonOk<{ status: string }>,
    ),
};
