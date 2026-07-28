import { useEffect, useRef, useState } from "react";

// Shared login-and-poll for Axel-Labs services (axdnsd, axlbd) — same JWT auth
// framework as the concentus widget: POST /api/v1/auth/login → {data:{access_token,
// refresh_token}}, Bearer on requests, refresh on 401. Credentials live in the
// widget config (state.yaml, plaintext — homelab/LAN trust model).

interface Tokens {
  access: string;
  refresh?: string;
}

export interface AxState {
  data: Record<string, unknown>;
  error: string | null;
  loading: boolean;
}

export function useAxService(
  baseUrl: string | undefined,
  username: string | undefined,
  password: string | undefined,
  paths: string[],
  intervalMs = 30_000,
): AxState {
  const [state, setState] = useState<AxState>({ data: {}, error: null, loading: true });
  const tok = useRef<Tokens | null>(null);
  const pathsKey = paths.join("|");

  useEffect(() => {
    if (!baseUrl || !username || !password) {
      setState({ data: {}, error: baseUrl ? "Set credentials in config." : null, loading: false });
      return;
    }
    let alive = true;
    const base = baseUrl.replace(/\/+$/, "");
    tok.current = null;

    const login = async (): Promise<Tokens> => {
      const r = await fetch(`${base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!r.ok) throw new Error(`login ${r.status}`);
      const d = (await r.json()) as { data?: { access_token?: string; refresh_token?: string } };
      const t = d.data ?? (d as { access_token?: string; refresh_token?: string });
      if (!t.access_token) throw new Error("login: no token");
      return { access: t.access_token, refresh: t.refresh_token };
    };
    const doRefresh = async (rt: string): Promise<Tokens> => {
      const r = await fetch(`${base}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!r.ok) throw new Error(`refresh ${r.status}`);
      const d = (await r.json()) as { data?: { access_token?: string; refresh_token?: string } };
      const t = d.data ?? (d as { access_token?: string; refresh_token?: string });
      return { access: t.access_token!, refresh: t.refresh_token ?? rt };
    };
    const get = async (path: string): Promise<unknown> => {
      if (!tok.current) tok.current = await login();
      const call = () =>
        fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${tok.current!.access}` } });
      let r = await call();
      if (r.status === 401) {
        tok.current = tok.current?.refresh
          ? await doRefresh(tok.current.refresh).catch(() => login())
          : await login();
        r = await call();
      }
      if (!r.ok) throw new Error(`${path} → ${r.status}`);
      return r.json();
    };
    const poll = async () => {
      try {
        const out: Record<string, unknown> = {};
        for (const p of paths) out[p] = await get(p);
        if (alive) setState({ data: out, error: null, loading: false });
      } catch (e) {
        if (alive) setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e), loading: false }));
      }
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, username, password, pathsKey, intervalMs]);

  return state;
}

/** Count from a list envelope: {data:[…], total} | array | {data:[…]}. */
export function envelopeCount(resp: unknown): number {
  if (resp == null) return 0;
  if (Array.isArray(resp)) return resp.length;
  const o = resp as { total?: number; data?: unknown[] };
  if (typeof o.total === "number") return o.total;
  if (Array.isArray(o.data)) return o.data.length;
  return 0;
}

/** Items from a list envelope. */
export function envelopeItems(resp: unknown): Record<string, unknown>[] {
  if (Array.isArray(resp)) return resp as Record<string, unknown>[];
  const o = resp as { data?: unknown[] };
  return Array.isArray(o?.data) ? (o.data as Record<string, unknown>[]) : [];
}
