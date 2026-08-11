import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatusDot, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import type { MediaConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Media server widget — Jellyfin or Plex. Shows now-playing sessions (who,
// what, progress, paused/playing) plus library counts where the server exposes
// them cheaply (Jellyfin /Items/Counts). All via the authenticated /api/fetch
// proxy; Jellyfin uses X-Emby-Token, Plex uses X-Plex-Token.
// ---------------------------------------------------------------------------

interface NowPlaying {
  key: string;
  user?: string;
  title: string;
  subtitle?: string;
  pct: number;
  paused: boolean;
  device?: string;
}
interface Count {
  label: string;
  value: number;
}
interface MediaData {
  playing: NowPlaying[];
  counts: Count[];
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

async function jellyfin(b: string, token: string): Promise<MediaData> {
  const headers = { "X-Emby-Token": token };
  const [sessions, counts] = await Promise.all([
    api.fetchJson<
      {
        Id?: string;
        UserName?: string;
        DeviceName?: string;
        Client?: string;
        NowPlayingItem?: { Name?: string; SeriesName?: string; Type?: string; RunTimeTicks?: number };
        PlayState?: { PositionTicks?: number; IsPaused?: boolean };
      }[]
    >({ url: `${b}/Sessions`, headers }),
    api
      .fetchJson<{ MovieCount?: number; SeriesCount?: number; EpisodeCount?: number }>({ url: `${b}/Items/Counts`, headers })
      .catch(() => ({}) as { MovieCount?: number; SeriesCount?: number; EpisodeCount?: number }),
  ]);
  const playing: NowPlaying[] = (sessions ?? [])
    .filter((s) => s.NowPlayingItem)
    .map((s, i) => {
      const it = s.NowPlayingItem!;
      const run = it.RunTimeTicks ?? 0;
      return {
        key: s.Id ?? String(i),
        user: s.UserName,
        title: it.Name ?? "Unknown",
        subtitle: it.SeriesName ?? it.Type,
        pct: run ? (100 * (s.PlayState?.PositionTicks ?? 0)) / run : 0,
        paused: s.PlayState?.IsPaused ?? false,
        device: s.DeviceName || s.Client,
      };
    });
  const cd: Count[] = [];
  if (counts.MovieCount != null) cd.push({ label: "Movies", value: counts.MovieCount });
  if (counts.SeriesCount != null) cd.push({ label: "Shows", value: counts.SeriesCount });
  if (counts.EpisodeCount != null) cd.push({ label: "Episodes", value: counts.EpisodeCount });
  return { playing, counts: cd };
}

async function plex(b: string, token: string): Promise<MediaData> {
  const headers = { "X-Plex-Token": token, Accept: "application/json" };
  const r = await api.fetchJson<{
    MediaContainer?: {
      size?: number;
      Metadata?: {
        ratingKey?: string;
        title?: string;
        grandparentTitle?: string;
        type?: string;
        viewOffset?: number;
        duration?: number;
        User?: { title?: string };
        Player?: { state?: string; title?: string; product?: string };
      }[];
    };
  }>({ url: `${b}/status/sessions`, headers });
  const md = r.MediaContainer?.Metadata ?? [];
  const playing: NowPlaying[] = md.map((m, i) => ({
    key: m.ratingKey ?? String(i),
    user: m.User?.title,
    title: m.title ?? "Unknown",
    subtitle: m.grandparentTitle ?? m.type,
    pct: m.duration ? (100 * (m.viewOffset ?? 0)) / m.duration : 0,
    paused: m.Player?.state === "paused",
    device: m.Player?.title || m.Player?.product,
  }));
  return { playing, counts: [] };
}

function MediaComponent({ config }: WidgetProps<MediaConfig>) {
  const kind = config?.kind ?? "jellyfin";
  const b = base(config?.baseUrl);
  const token = config?.token?.trim();
  const title = config?.title?.trim() || (kind === "plex" ? "Plex" : "Jellyfin");
  const ready = !!b && !!token;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["media", kind, b, token],
    enabled: ready,
    refetchInterval: 10_000,
    queryFn: (): Promise<MediaData> => (kind === "plex" ? plex(b, token!) : jellyfin(b, token!)),
  });

  if (!ready) {
    return <EmptyState icon={PlayIcon} title={`Connect ${title}`} hint={`Set the base URL and ${kind === "plex" ? "X-Plex-Token" : "API key"} in this widget's config.`} />;
  }
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach the server."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const { playing, counts } = data;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={PlayIcon}
        title={title}
        right={
          <span className="flex items-center gap-1 text-[11px] text-text-muted">
            <StatusDot status={playing.length > 0 ? "up" : "unknown"} size="sm" />
            {playing.length} playing
          </span>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5">
        {playing.length === 0 ? (
          <div className="text-[11px] text-text-muted px-1 py-2">Nothing playing.</div>
        ) : (
          <div className="space-y-2">
            {playing.map((p) => (
              <div key={p.key} className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] text-text truncate flex-1" title={p.title}>{p.title}</span>
                  <span className={`text-[9.5px] font-mono shrink-0 ${p.paused ? "text-text-muted/60" : "text-up"}`}>
                    {p.paused ? "paused" : "playing"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 text-[10px] text-text-muted">
                  <span className="truncate">{[p.subtitle, p.user].filter(Boolean).join(" · ")}</span>
                  {p.device && <span className="ml-auto shrink-0 truncate max-w-[45%]">{p.device}</span>}
                </div>
                <div className="mt-1">
                  <Meter pct={p.pct} color={p.paused ? "var(--color-text-muted)" : "var(--color-accent)"} />
                </div>
              </div>
            ))}
          </div>
        )}
        {counts.length > 0 && (
          <div className={`grid gap-2 pt-2 mt-2 border-t border-border-subtle ${counts.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {counts.map((c) => (
              <div key={c.label} className="min-w-0">
                <div className="text-[15px] font-semibold text-text tabular-nums truncate">{c.value.toLocaleString()}</div>
                <div className="text-[9.5px] uppercase tracking-wide text-text-muted">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaConfigPanel({ config, save }: WidgetConfigProps<MediaConfig>) {
  const kind = config?.kind ?? "jellyfin";
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
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Server</label>
        <div className="grid grid-cols-2 gap-1">
          {(["jellyfin", "plex"] as const).map((k) => (
            <button
              key={k}
              onClick={() => save({ kind: k })}
              className={`px-2 py-1.5 text-[11px] rounded border capitalize transition-colors ${
                kind === k ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      {field("Base URL", config?.baseUrl, (baseUrl) => save({ baseUrl }), kind === "plex" ? "http://host:32400" : "http://host:8096")}
      {field(
        kind === "plex" ? "X-Plex-Token" : "API key",
        config?.token,
        (token) => save({ token }),
        "••••••••",
        kind === "plex" ? "account → view XML" : "Dashboard → API Keys",
      )}
      {field("Title", config?.title, (title) => save({ title }), kind === "plex" ? "Plex" : "Jellyfin")}
      <p className="text-[11px] text-text-muted leading-snug">Now-playing refreshes every 10s. The token stays in your config.yaml.</p>
    </div>
  );
}

const PlayIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
);

const definition: WidgetDefinition<MediaConfig> = {
  type: "media",
  title: "Jellyfin / Plex",
  icon: PlayIcon,
  category: "infrastructure",
  description: "Jellyfin or Plex — now-playing sessions with progress, plus library counts.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { kind: "jellyfin" },
  Component: MediaComponent,
  ConfigPanel: MediaConfigPanel,
};

export default definition;
