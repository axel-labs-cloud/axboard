import type { Config, State, StatusMap } from "./types";

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

  getStatus: () => fetch("/api/apps/status").then(jsonOk<StatusMap>),
  forceCheck: (id: string) =>
    fetch(`/api/apps/${encodeURIComponent(id)}/check`, { method: "POST" }).then(
      jsonOk<{ status: string }>,
    ),
};
