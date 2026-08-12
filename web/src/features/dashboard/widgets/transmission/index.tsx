import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { scaleColor } from "../colorScale";
import type { TransmissionConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Transmission widget — torrent list + transfer rates over the RPC API. The RPC
// uses a CSRF handshake: the first call returns 409 with an
// X-Transmission-Session-Id header, which we replay on a retry. The /api/fetch
// proxy surfaces that header (fetchRaw) so the browser can complete it.
// ---------------------------------------------------------------------------

interface Torrent {
  id: number;
  name: string;
  percentDone: number; // 0..1
  rateDownload: number; // bytes/s
  rateUpload: number;
  status: number; // 0 stopped · 1-2 check · 3-4 download · 5-6 seed
  totalSize: number;
  uploadRatio: number;
  eta: number; // seconds; <0 unknown
}
interface Stats {
  downloadSpeed: number;
  uploadSpeed: number;
  activeTorrentCount: number;
  torrentCount: number;
  pausedTorrentCount: number;
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const RATE_OPTS = { lo: 0, hi: 12_000_000, warn: 6_000_000, crit: 10_000_000 };

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
  if (s < 0) return "";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function statusLabel(t: Torrent): { text: string; tone: string } {
  if (t.status === 0) return { text: "paused", tone: "text-text-muted/60" };
  if (t.status === 1 || t.status === 2) return { text: "checking", tone: "text-degraded" };
  if (t.status === 3 || t.status === 4) return { text: eta(t.eta) || "downloading", tone: "text-accent" };
  return { text: "seeding", tone: "text-up" };
}

function TransmissionComponent({ config }: WidgetProps<TransmissionConfig>) {
  const b = base(config?.baseUrl);
  const title = config?.title?.trim() || "Transmission";
  const max = config?.max ?? 8;
  const auth = config?.username ? `Basic ${btoa(`${config.username}:${config.password ?? ""}`)}` : undefined;
  const sid = useRef<string | undefined>(undefined);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["transmission", b, config?.username],
    enabled: !!b,
    refetchInterval: 5_000,
    queryFn: async () => {
      const call = async (payload: unknown): Promise<Response> => {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (sid.current) headers["X-Transmission-Session-Id"] = sid.current;
        if (auth) headers["Authorization"] = auth;
        return api.fetchRaw({ url: `${b}/transmission/rpc`, method: "POST", headers, body: JSON.stringify(payload) });
      };
      const rpc = async <T,>(payload: unknown): Promise<T> => {
        let res = await call(payload);
        if (res.status === 409) {
          sid.current = res.headers.get("X-Transmission-Session-Id") ?? undefined;
          res = await call(payload);
        }
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const j = (await res.json()) as { result?: string; arguments?: T };
        if (j.result !== "success") throw new Error(j.result || "rpc error");
        return j.arguments as T;
      };
      const [torrents, stats] = await Promise.all([
        rpc<{ torrents: Torrent[] }>({
          method: "torrent-get",
          arguments: {
            fields: ["id", "name", "percentDone", "rateDownload", "rateUpload", "status", "totalSize", "uploadRatio", "eta"],
          },
        }),
        rpc<Stats>({ method: "session-stats" }),
      ]);
      return { torrents: torrents.torrents ?? [], stats };
    },
  });

  if (!b) {
    return <EmptyState icon={TorrentIcon} title="Connect Transmission" hint="Set the base URL (http://host:9091). Add basic-auth user/pass if enabled." />;
  }
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach the RPC."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={4} />;

  const { stats } = data;
  const torrents = [...data.torrents].sort(
    (a, z) => z.rateDownload + z.rateUpload - (a.rateDownload + a.rateUpload) || a.percentDone - z.percentDone,
  );
  const shown = torrents.slice(0, max);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={TorrentIcon}
        title={title}
        right={
          <a href={`${b}/transmission/web/`} target="_blank" rel="noreferrer noopener" className="text-[11px] font-mono text-text-muted hover:text-accent" title="Open Transmission">
            {stats.activeTorrentCount}/{stats.torrentCount}
          </a>
        }
      />
      <div className="flex items-center gap-3 px-2.5 py-1 text-[11px] font-mono border-b border-border-subtle">
        <span className="flex items-center gap-1 text-up" title="Download">
          <Arrow down /> {rate(stats.downloadSpeed)}
        </span>
        <span className="flex items-center gap-1 text-accent" title="Upload">
          <Arrow /> {rate(stats.uploadSpeed)}
        </span>
        {stats.pausedTorrentCount > 0 && <span className="text-text-muted/60 ml-auto">{stats.pausedTorrentCount} paused</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1">
       <div className="w-full">
        {shown.length === 0 && <div className="text-[11px] text-text-muted px-1 py-2">No torrents.</div>}
        {shown.map((t) => {
          const pct = t.percentDone * 100;
          const st = statusLabel(t);
          const done = t.percentDone >= 1;
          const active = t.rateDownload + t.rateUpload > 0;
          return (
            <div key={t.id} className="py-1 border-t border-border-subtle first:border-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[11.5px] text-text-secondary truncate flex-1" title={t.name}>{t.name}</span>
                <span className={`text-[10px] font-mono shrink-0 ${st.tone}`}>{st.text}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 min-w-0">
                  <Meter pct={pct} color={done ? "var(--color-up)" : "var(--color-accent)"} />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-text-muted shrink-0 w-9 text-right">
                  {done ? size(t.totalSize) : `${pct.toFixed(0)}%`}
                </span>
              </div>
              {(active || done) && (
                <div className="flex items-center gap-3 mt-0.5 text-[9.5px] font-mono text-text-muted">
                  {t.rateDownload > 0 && (
                    <span className="flex items-center gap-0.5" style={{ color: scaleColor(t.rateDownload, undefined, RATE_OPTS) }}>
                      <Arrow down /> {rate(t.rateDownload)}
                    </span>
                  )}
                  {t.rateUpload > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Arrow /> {rate(t.rateUpload)}
                    </span>
                  )}
                  <span className="ml-auto">ratio {t.uploadRatio < 0 ? "—" : t.uploadRatio.toFixed(2)}</span>
                </div>
              )}
            </div>
          );
        })}
        {torrents.length > max && <div className="text-[10px] text-text-muted/60 px-1 py-1">+{torrents.length - max} more</div>}
       </div>
      </div>
    </div>
  );
}

function TransmissionConfigPanel({ config, save }: WidgetConfigProps<TransmissionConfig>) {
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
      {field("Base URL", config?.baseUrl, (baseUrl) => save({ baseUrl }), "http://172.24.2.100:9091")}
      {field("Username", config?.username, (username) => save({ username }), "optional", false, "HTTP basic auth")}
      {field("Password", config?.password, (password) => save({ password }), "optional", false)}
      {field("Title", config?.title, (title) => save({ title }), "Transmission", false)}
      <p className="text-[11px] text-text-muted leading-snug">Talks to the RPC at <span className="font-mono">/transmission/rpc</span>. Credentials stay in your config.yaml.</p>
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

const TorrentIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const definition: WidgetDefinition<TransmissionConfig> = {
  type: "transmission",
  title: "Transmission",
  icon: TorrentIcon,
  category: "services",
  description: "Transmission torrents — progress, up/down rates and ratio, with live transfer totals.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: TransmissionComponent,
  ConfigPanel: TransmissionConfigPanel,
};

export default definition;
