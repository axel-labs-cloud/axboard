import type { Config, State, StatusMap, HistoryMap, DiscoveredService } from "./types";

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

  getStatus: () => fetch("/api/apps/status").then(jsonOk<StatusMap>),
  getHistory: () => fetch("/api/apps/history").then(jsonOk<HistoryMap>),
  discover: () =>
    fetch("/api/discover").then(jsonOk<{ services: DiscoveredService[]; error?: string }>),
  forceCheck: (id: string) =>
    fetch(`/api/apps/${encodeURIComponent(id)}/check`, { method: "POST" }).then(
      jsonOk<{ status: string }>,
    ),
};
