import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles, StatusDot } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import type { UnifiConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// UniFi widget — client count + WAN throughput from a UniFi OS console (UDM /
// Cloud Key Gen2+). Auth is a cookie login: POST /api/auth/login returns a
// TOKEN cookie (surfaced by the proxy as X-Proxy-Set-Cookie), replayed on the
// stat/health call. Read-only GETs don't need the CSRF token.
// ---------------------------------------------------------------------------

interface Health {
  subsystem: string;
  status?: string;
  wan_ip?: string;
  num_user?: number;
  num_guest?: number;
  "rx_bytes-r"?: number;
  "tx_bytes-r"?: number;
  latency?: number;
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
function rate(bps: number): string {
  if (bps < 1) return "0";
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  if (bps < 1024 * 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  return `${(bps / 1024 / 1024 / 1024).toFixed(2)} GB/s`;
}

function UnifiComponent({ config }: WidgetProps<UnifiConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "UniFi";
  const site = config?.site?.trim() || "default";
  const user = config?.username;
  const pass = config?.password ?? "";
  const cookie = useRef<string | undefined>(undefined);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["unifi", b, user, site],
    enabled: !!b && !!user,
    refetchInterval: 10_000,
    queryFn: async (): Promise<Health[]> => {
      const login = async () => {
        const res = await api.fetchRaw({
          url: `${b}/api/auth/login`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user, password: pass, remember: true }),
        });
        if (res.status === 429) throw new Error("UniFi is rate-limiting logins — wait a few minutes.");
        if (!res.ok) throw new Error(`login failed (${res.status}) — check the local account / 2FA`);
        // Replay every cookie the console set (TOKEN may not be the first one).
        const sc = res.headers.get("X-Proxy-Set-Cookie");
        if (sc) cookie.current = sc;
      };
      const get = async () => {
        const call = () =>
          api.fetchRaw({ url: `${b}/proxy/network/api/s/${site}/stat/health`, headers: cookie.current ? { Cookie: cookie.current } : {} });
        let res = await call();
        if (res.status === 401 || res.status === 403) {
          await login();
          res = await call();
        }
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const j = (await res.json()) as { data?: Health[] };
        return j.data ?? [];
      };
      if (!cookie.current) await login();
      return get();
    },
  });

  if (!b || !user) return <EmptyState icon={UnifiIcon} title="Connect UniFi" hint="Set the console URL (https://192.168.1.1) and a local admin user/password." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach the UniFi console."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const by = (s: string) => data.find((h) => h.subsystem === s);
  const wan = by("wan");
  const wlan = by("wlan");
  const lan = by("lan");
  const clients = (wlan?.num_user ?? 0) + (wlan?.num_guest ?? 0) + (lan?.num_user ?? 0);
  const down = wan?.["rx_bytes-r"] ?? 0;
  const up = wan?.["tx_bytes-r"] ?? 0;
  const wanOk = (wan?.status ?? "ok") === "ok";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={UnifiIcon}
        title={title}
        right={<span className="flex items-center gap-1 text-[11px] text-text-muted"><StatusDot status={wanOk ? "up" : "down"} size="sm" />WAN</span>}
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 flex flex-col justify-center gap-2.5">
        <StatTiles
          tiles={[
            { label: "Clients", value: String(clients) },
            { label: "Down", value: rate(down), color: "var(--color-up)" },
            { label: "Up", value: rate(up), color: "var(--color-accent)" },
          ]}
        />
        {wan?.wan_ip && <div className="text-[10px] font-mono text-text-muted">WAN {wan.wan_ip}{wan.latency != null ? ` · ${wan.latency}ms` : ""}</div>}
      </div>
    </div>
  );
}

function UnifiConfigPanel({ config, save }: WidgetConfigProps<UnifiConfig>) {
  const f = (label: string, v: string | undefined, on: (s: string) => void, ph: string, mono = true, hint?: string) => (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold flex items-center gap-2">{label}{hint && <span className="normal-case tracking-normal text-text-muted/70 font-normal">{hint}</span>}</label>
      <input value={v ?? ""} onChange={(e) => on(e.target.value)} placeholder={ph} className={`w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent ${mono ? "font-mono" : ""}`} />
    </div>
  );
  return (
    <div className="space-y-3">
      {f("Console URL", config?.baseUrl, (baseUrl) => save({ baseUrl }), "https://192.168.1.1")}
      {f("Username", config?.username, (username) => save({ username }), "local admin", false)}
      {f("Password", config?.password, (password) => save({ password }), "••••••••", false)}
      {f("Site", config?.site, (site) => save({ site }), "default")}
      {f("Title", config?.title, (title) => save({ title }), "UniFi", false)}
      <p className="text-[11px] text-text-muted leading-snug">Use a LOCAL UniFi admin account (not your Ubiquiti SSO). Credentials stay in your config.yaml.</p>
    </div>
  );
}

const UnifiIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 12.55a11 11 0 0 1 14 0M8.5 16.11a6 6 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>
);

const definition: WidgetDefinition<UnifiConfig> = {
  type: "unifi",
  title: "UniFi",
  icon: UnifiIcon,
  category: "network",
  description: "UniFi console — connected clients and live WAN download/upload throughput.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: UnifiComponent,
  ConfigPanel: UnifiConfigPanel,
};

export default definition;
