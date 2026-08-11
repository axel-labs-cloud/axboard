import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatusDot, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import type { DnsConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// DNS sinkhole widget — Pi-hole (v6 REST with v5 fallback), AdGuard Home or
// Technitium. Each backend's stats are normalised into one DnsStats shape so
// the render is identical. All calls go through the authenticated /api/fetch
// proxy; credentials live in config.yaml.
// ---------------------------------------------------------------------------

interface Top {
  name: string;
  count: number;
}
interface DnsStats {
  queries: number;
  blocked: number;
  blockedPct: number;
  gravity?: number; // domains on the blocklist
  enabled?: boolean; // protection on/off
  topBlocked: Top[];
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const num = (n: number) => n.toLocaleString();

async function piholeStats(b: string, token: string | undefined, sid: { current?: string }): Promise<DnsStats> {
  // Pi-hole v6 REST first.
  try {
    if (!sid.current) {
      const a = await api.fetchJson<{ session?: { sid?: string } }>({
        url: `${b}/api/auth`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: token ?? "" }),
      });
      sid.current = a.session?.sid;
    }
    const h = { "X-FTL-SID": sid.current ?? "" };
    const s = await api.fetchJson<{
      queries?: { total?: number; blocked?: number; percent_blocked?: number };
      gravity?: { domains_being_blocked?: number };
    }>({ url: `${b}/api/stats/summary`, headers: h });
    let topBlocked: Top[] = [];
    try {
      const td = await api.fetchJson<{ domains?: { domain: string; count: number }[] }>({
        url: `${b}/api/stats/top_domains?blocked=true&count=5`,
        headers: h,
      });
      topBlocked = (td.domains ?? []).map((d) => ({ name: d.domain, count: d.count }));
    } catch {
      /* top list is optional */
    }
    let enabled: boolean | undefined;
    try {
      const bl = await api.fetchJson<{ blocking?: string }>({ url: `${b}/api/dns/blocking`, headers: h });
      enabled = bl.blocking === "enabled";
    } catch {
      /* optional */
    }
    return {
      queries: s.queries?.total ?? 0,
      blocked: s.queries?.blocked ?? 0,
      blockedPct: s.queries?.percent_blocked ?? 0,
      gravity: s.gravity?.domains_being_blocked,
      enabled,
      topBlocked,
    };
  } catch {
    sid.current = undefined; // fall through to v5
  }
  // Pi-hole v5 (FTL api.php).
  const s = await api.fetchJson<{
    dns_queries_today?: number;
    ads_blocked_today?: number;
    ads_percentage_today?: number;
    domains_being_blocked?: number;
    status?: string;
    top_ads?: Record<string, number>;
  }>({ url: `${b}/admin/api.php?summaryRaw&topItems=5&auth=${encodeURIComponent(token ?? "")}` });
  return {
    queries: s.dns_queries_today ?? 0,
    blocked: s.ads_blocked_today ?? 0,
    blockedPct: s.ads_percentage_today ?? 0,
    gravity: s.domains_being_blocked,
    enabled: s.status ? s.status === "enabled" : undefined,
    topBlocked: Object.entries(s.top_ads ?? {}).map(([name, count]) => ({ name, count })),
  };
}

async function adguardStats(b: string, auth: string | undefined): Promise<DnsStats> {
  const h: Record<string, string> = auth ? { Authorization: auth } : {};
  const s = await api.fetchJson<{
    num_dns_queries?: number;
    num_blocked_filtering?: number;
    num_replaced_safebrowsing?: number;
    num_replaced_parental?: number;
    top_blocked_domains?: Record<string, number>[];
  }>({ url: `${b}/control/stats`, headers: h });
  const status = await api
    .fetchJson<{ protection_enabled?: boolean }>({ url: `${b}/control/status`, headers: h })
    .catch(() => ({}) as { protection_enabled?: boolean });
  const queries = s.num_dns_queries ?? 0;
  const blocked = (s.num_blocked_filtering ?? 0) + (s.num_replaced_safebrowsing ?? 0) + (s.num_replaced_parental ?? 0);
  const topBlocked = (s.top_blocked_domains ?? []).slice(0, 5).map((o) => {
    const [name, count] = Object.entries(o)[0] ?? ["", 0];
    return { name, count };
  });
  return { queries, blocked, blockedPct: queries ? (100 * blocked) / queries : 0, enabled: status.protection_enabled, topBlocked };
}

async function technitiumStats(b: string, token: string | undefined): Promise<DnsStats> {
  const r = await api.fetchJson<{
    status?: string;
    errorMessage?: string;
    response?: {
      stats?: { totalQueries?: number; totalBlocked?: number; blockedZones?: number; allowedZones?: number };
      topBlockedDomains?: { name: string; hits: number }[];
    };
  }>({ url: `${b}/api/dashboard/stats/get?token=${encodeURIComponent(token ?? "")}&type=LastDay&utc=true` });
  if (r.status !== "ok") throw new Error(r.errorMessage || "Technitium error");
  const st = r.response?.stats ?? {};
  const q = st.totalQueries ?? 0;
  const blk = st.totalBlocked ?? 0;
  return {
    queries: q,
    blocked: blk,
    blockedPct: q ? (100 * blk) / q : 0,
    gravity: st.blockedZones,
    topBlocked: (r.response?.topBlockedDomains ?? []).slice(0, 5).map((d) => ({ name: d.name, count: d.hits })),
  };
}

function DnsComponent({ config }: WidgetProps<DnsConfig>) {
  const kind = config?.kind ?? "pihole";
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || (kind === "adguard" ? "AdGuard" : kind === "technitium" ? "Technitium" : "Pi-hole");
  const sid = useRef<string | undefined>(undefined);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dns", kind, b, config?.token, config?.username],
    enabled: !!b,
    refetchInterval: 30_000,
    queryFn: (): Promise<DnsStats> => {
      if (kind === "adguard") {
        const auth = config?.username ? `Basic ${btoa(`${config.username}:${config.password ?? ""}`)}` : undefined;
        return adguardStats(b, auth);
      }
      if (kind === "technitium") return technitiumStats(b, config?.token);
      return piholeStats(b, config?.token, sid);
    },
  });

  if (!b) {
    return <EmptyState icon={ShieldIcon} title={`Connect ${title}`} hint="Pick the backend, set its URL and API token in this widget's config." />;
  }
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach the API."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={4} />;

  const stat = (label: string, value: string) => (
    <div className="min-w-0">
      <div className="text-[15px] font-semibold text-text tabular-nums truncate">{value}</div>
      <div className="text-[9.5px] uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={ShieldIcon}
        title={title}
        right={
          data.enabled === undefined ? undefined : (
            <span className="flex items-center gap-1 text-[11px] text-text-muted">
              <StatusDot status={data.enabled ? "up" : "down"} size="sm" />
              {data.enabled ? "on" : "off"}
            </span>
          )
        }
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 space-y-2.5">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[11px] text-text-muted">Blocked</span>
            <span className="text-[13px] font-semibold text-accent tabular-nums">{data.blockedPct.toFixed(1)}%</span>
          </div>
          <Meter pct={data.blockedPct} color="var(--color-accent)" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {stat("Queries", num(data.queries))}
          {stat("Blocked", num(data.blocked))}
          {stat("Blocklist", data.gravity != null ? num(data.gravity) : "—")}
        </div>
        {data.topBlocked.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-0.5">Top blocked</div>
            <div className="divide-y divide-border-subtle">
              {data.topBlocked.map((t) => (
                <div key={t.name} className="flex items-baseline gap-2 py-0.5">
                  <span className="text-[11px] text-text-secondary truncate flex-1" title={t.name}>{t.name}</span>
                  <span className="text-[10px] font-mono tabular-nums text-text-muted shrink-0">{num(t.count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DnsConfigPanel({ config, save }: WidgetConfigProps<DnsConfig>) {
  const kind = config?.kind ?? "pihole";
  const field = (label: string, v: string | undefined, on: (s: string) => void, ph: string, hint?: string) => (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold flex items-center gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal text-text-muted/70 font-normal">{hint}</span>}
      </label>
      <input
        value={v ?? ""}
        onChange={(e) => on(e.target.value)}
        placeholder={ph}
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent"
      />
    </div>
  );
  const urlPh = kind === "adguard" ? "http://host:3000" : kind === "technitium" ? "http://host:5380" : "http://host";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Backend</label>
        <div className="grid grid-cols-3 gap-1">
          {(["pihole", "adguard", "technitium"] as const).map((k) => (
            <button
              key={k}
              onClick={() => save({ kind: k })}
              className={`px-1.5 py-1.5 text-[10.5px] rounded border transition-colors ${
                kind === k ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
              }`}
            >
              {k === "pihole" ? "Pi-hole" : k === "adguard" ? "AdGuard" : "Technitium"}
            </button>
          ))}
        </div>
      </div>
      {field("Base URL", config?.baseUrl, (baseUrl) => save({ baseUrl }), urlPh)}
      {kind === "adguard" ? (
        <>
          {field("Username", config?.username, (username) => save({ username }), "admin", "basic auth")}
          {field("Password", config?.password, (password) => save({ password }), "••••••••")}
        </>
      ) : (
        field("API token", config?.token, (token) => save({ token }), "••••••••", kind === "pihole" ? "app password" : "Technitium token")
      )}
      <p className="text-[11px] text-text-muted leading-snug">
        {kind === "pihole"
          ? "Pi-hole v6 app password (Settings → API), with automatic v5 fallback."
          : kind === "technitium"
            ? "Create a token in Administration → Sessions → Create Token."
            : "AdGuard admin credentials (HTTP basic auth)."}{" "}
        Credentials stay in your config.yaml.
      </p>
    </div>
  );
}

const ShieldIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const definition: WidgetDefinition<DnsConfig> = {
  type: "dns",
  title: "DNS Sinkhole",
  icon: ShieldIcon,
  category: "services",
  description: "Pi-hole / AdGuard Home / Technitium — queries, block rate, blocklist size and top blocked domains.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { kind: "pihole" },
  Component: DnsComponent,
  ConfigPanel: DnsConfigPanel,
};

export default definition;
