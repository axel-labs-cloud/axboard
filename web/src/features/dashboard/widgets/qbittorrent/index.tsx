import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import type { QbittorrentConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// qBittorrent widget — torrent list + transfer rates over the WebUI v2 API.
// Auth is a cookie login: POST /api/v2/auth/login returns a SID cookie, which
// the proxy surfaces (X-Proxy-Set-Cookie) so we can replay it as a Cookie
// header on data calls. The SID is cached in a ref and re-fetched on 403.
// ---------------------------------------------------------------------------

interface Torrent {
  name: string;
  progress: number; // 0..1
  dlspeed: number; // bytes/s
  upspeed: number;
  state: string;
  size: number;
  ratio: number;
  eta: number; // seconds (8640000 = ∞)
}
interface Transfer {
  dl_info_speed: number;
  up_info_speed: number;
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const form = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

function rate(bps: number): string {
  if (bps < 1) return "0";
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}
function size(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}K`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)}M`;
  const g = b / 1024 / 1024 / 1024;
  return g >= 100 ? `${g.toFixed(0)}G` : `${g.toFixed(1)}G`;
}
function eta(s: number): string {
  if (s >= 8640000 || s < 0) return "";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function stateLabel(t: Torrent): { text: string; tone: string } {
  const s = t.state;
  if (s.startsWith("paused") || s === "stoppedUP" || s === "stoppedDL")
    return { text: "paused", tone: "text-text-muted/60" };
  if (s.startsWith("checking")) return { text: "checking", tone: "text-degraded" };
  if (s === "error" || s === "missingFiles") return { text: "error", tone: "text-down" };
  if (s.includes("UP")) return { text: "seeding", tone: "text-up" };
  return { text: eta(t.eta) || "downloading", tone: "text-accent" };
}

function QbittorrentComponent({ config }: WidgetProps<QbittorrentConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "qBittorrent";
  const max = config?.max ?? 8;
  const user = config?.username;
  const pass = config?.password ?? "";
  const sid = useRef<string | undefined>(undefined);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qbit", b, user],
    enabled: !!b,
    refetchInterval: 5_000,
    queryFn: async () => {
      const login = async () => {
        if (!user) return; // WebUI auth may be bypassed for this client
        const res = await api.fetchRaw({
          url: `${b}/api/v2/auth/login`,
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: b },
          body: form({ username: user, password: pass }),
        });
        const sc = res.headers.get("X-Proxy-Set-Cookie");
        const m = sc?.match(/SID=[^;]+/);
        if (m) sid.current = m[0];
      };
      const get = async <T,>(path: string): Promise<T> => {
        const call = () =>
          api.fetchRaw({ url: `${b}${path}`, headers: sid.current ? { Cookie: sid.current } : {} });
        let res = await call();
        if (res.status === 403) {
          await login();
          res = await call();
        }
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return (await res.json()) as T;
      };
      if (!sid.current) await login();
      const [torrents, transfer] = await Promise.all([
        get<Torrent[]>("/api/v2/torrents/info"),
        get<Transfer>("/api/v2/transfer/info"),
      ]);
      return { torrents, transfer };
    },
  });

  if (!b) {
    return <EmptyState icon={QbitIcon} title="Connect qBittorrent" hint="Set the base URL (http://host:8080) and WebUI username/password." />;
  }
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach the WebUI."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={4} />;

  const torrents = [...(data.torrents ?? [])].sort(
    (a, z) => z.dlspeed + z.upspeed - (a.dlspeed + a.upspeed) || a.progress - z.progress,
  );
  const active = torrents.filter((t) => t.dlspeed + t.upspeed > 0).length;
  const shown = torrents.slice(0, max);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={QbitIcon}
        title={title}
        right={
          <a href={b} target="_blank" rel="noreferrer noopener" className="text-[11px] font-mono text-text-muted hover:text-accent" title="Open qBittorrent">
            {active}/{torrents.length}
          </a>
        }
      />
      <div className="flex items-center gap-3 px-2.5 py-1 text-[11px] font-mono border-b border-border-subtle">
        <span className="flex items-center gap-1 text-up" title="Download"><Arrow down /> {rate(data.transfer?.dl_info_speed ?? 0)}</span>
        <span className="flex items-center gap-1 text-accent" title="Upload"><Arrow /> {rate(data.transfer?.up_info_speed ?? 0)}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1">
        {shown.length === 0 && <div className="text-[11px] text-text-muted px-1 py-2">No torrents.</div>}
        {shown.map((t, i) => {
          const pct = t.progress * 100;
          const st = stateLabel(t);
          const done = t.progress >= 1;
          const activeRow = t.dlspeed + t.upspeed > 0;
          return (
            <div key={i} className="py-1 border-t border-border-subtle first:border-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[11.5px] text-text-secondary truncate flex-1" title={t.name}>{t.name}</span>
                <span className={`text-[10px] font-mono shrink-0 ${st.tone}`}>{st.text}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 min-w-0"><Meter pct={pct} color={done ? "var(--color-up)" : "var(--color-accent)"} /></div>
                <span className="text-[10px] font-mono tabular-nums text-text-muted shrink-0 w-9 text-right">{done ? size(t.size) : `${pct.toFixed(0)}%`}</span>
              </div>
              {(activeRow || done) && (
                <div className="flex items-center gap-3 mt-0.5 text-[9.5px] font-mono text-text-muted">
                  {t.dlspeed > 0 && <span className="flex items-center gap-0.5 text-up"><Arrow down /> {rate(t.dlspeed)}</span>}
                  {t.upspeed > 0 && <span className="flex items-center gap-0.5"><Arrow /> {rate(t.upspeed)}</span>}
                  <span className="ml-auto">ratio {t.ratio < 0 ? "∞" : t.ratio.toFixed(2)}</span>
                </div>
              )}
            </div>
          );
        })}
        {torrents.length > max && <div className="text-[10px] text-text-muted/60 px-1 py-1">+{torrents.length - max} more</div>}
      </div>
    </div>
  );
}

function QbittorrentConfigPanel({ config, save }: WidgetConfigProps<QbittorrentConfig>) {
  const field = (label: string, v: string | undefined, on: (s: string) => void, ph: string, mono = true, hint?: string) => (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold flex items-center gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal text-text-muted/70 font-normal">{hint}</span>}
      </label>
      <input
        value={v ?? ""}
        onChange={(e) => on(e.target.value)}
        placeholder={ph}
        className={`w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
  return (
    <div className="space-y-3">
      {field("Base URL", config?.baseUrl, (baseUrl) => save({ baseUrl }), "http://172.24.2.100:8080")}
      {field("Username", config?.username, (username) => save({ username }), "admin", false, "WebUI login")}
      {field("Password", config?.password, (password) => save({ password }), "••••••••", false)}
      {field("Title", config?.title, (title) => save({ title }), "qBittorrent", false)}
      <p className="text-[11px] text-text-muted leading-snug">Uses the WebUI cookie login. Credentials stay in your config.yaml.</p>
    </div>
  );
}

function Arrow({ down }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
      {down ? <path d="M12 5v14M19 12l-7 7-7-7" /> : <path d="M12 19V5M5 12l7-7 7 7" />}
    </svg>
  );
}

const QbitIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
);

const definition: WidgetDefinition<QbittorrentConfig> = {
  type: "qbittorrent",
  title: "qBittorrent",
  icon: QbitIcon,
  category: "services",
  description: "qBittorrent torrents — progress, up/down rates and ratio, with live transfer totals.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: QbittorrentComponent,
  ConfigPanel: QbittorrentConfigPanel,
};

export default definition;
