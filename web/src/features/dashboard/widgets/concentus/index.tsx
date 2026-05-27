import { useEffect, useRef, useState } from "react";
import type {
  ConcentusConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Concentus now-playing widget.
// Polls /api/v1/sessions/active every 5s, displays the session that's
// currently playing (or the most recent active session if none playing).
// Tokens are kept in component state; credentials live in state.yaml.
// Album art is fetched from the public /api/v1/art/{id} endpoint.
// ---------------------------------------------------------------------------

interface NowPlaying {
  track_title?: string;
  artist_name?: string;
  album_title?: string;
  album_art_id?: string;
  is_playing: boolean;
}

interface ConcentusSession {
  id: string;
  name: string;
  user_id: string;
  capabilities?: string[];
  now_playing?: NowPlaying;
}

interface LoginResponse {
  data?: {
    access_token: string;
    refresh_token: string;
  };
}

interface SessionsResponse {
  data?: ConcentusSession[];
}

function trim(s?: string): string {
  return (s ?? "").replace(/\/$/, "");
}

function artUrl(baseUrl: string, albumArtId?: string): string | null {
  if (!albumArtId) return null;
  if (albumArtId.startsWith("http")) return albumArtId;
  // Some clients send the full path "/api/v1/art/{id}", others just the id.
  if (albumArtId.startsWith("/")) return `${trim(baseUrl)}${albumArtId}`;
  return `${trim(baseUrl)}/api/v1/art/${encodeURIComponent(albumArtId)}`;
}

function ConcentusComponent({ config, w, h }: WidgetProps<ConcentusConfig>) {
  const baseUrl = trim(config?.baseUrl);
  const { username, password } = config ?? {};

  const [access, setAccess] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<string | null>(null);
  const [session, setSession] = useState<ConcentusSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const accessRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);
  accessRef.current = access;
  refreshRef.current = refresh;

  // Initial login. Reruns whenever the URL / credentials change.
  useEffect(() => {
    if (!baseUrl || !username || !password) {
      setAccess(null);
      setRefresh(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!r.ok) throw new Error(`login: ${r.status}`);
        const data = (await r.json()) as LoginResponse;
        if (!data.data?.access_token) throw new Error("login: missing token");
        if (alive) {
          setAccess(data.data.access_token);
          setRefresh(data.data.refresh_token);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [baseUrl, username, password]);

  // Poll active sessions every 5s while we have a token.
  useEffect(() => {
    if (!baseUrl || !access) return;
    let alive = true;

    const tryRefresh = async (): Promise<boolean> => {
      if (!refreshRef.current) return false;
      const rr = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshRef.current }),
      });
      if (!rr.ok) return false;
      const data = (await rr.json()) as LoginResponse;
      if (!data.data?.access_token) return false;
      setAccess(data.data.access_token);
      setRefresh(data.data.refresh_token);
      return true;
    };

    const tick = async () => {
      try {
        const tok = accessRef.current;
        if (!tok) return;
        const r = await fetch(`${baseUrl}/api/v1/sessions/active`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (r.status === 401) {
          const ok = await tryRefresh();
          if (!ok && alive) setError("auth expired — recheck credentials");
          return;
        }
        if (!r.ok) throw new Error(`${r.status}`);
        const data = (await r.json()) as SessionsResponse;
        const sessions = data.data ?? [];
        // Pick the session that's playing; else any session with now_playing;
        // else null.
        const playing = sessions.find((s) => s.now_playing?.is_playing);
        const withNP = sessions.find((s) => s.now_playing);
        if (alive) {
          setSession(playing ?? withNP ?? null);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };

    void tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [baseUrl, access]);

  if (!baseUrl || !username || !password) {
    return <Empty hint="Set Concentus server URL + credentials in the widget config." />;
  }
  if (loading && !session) {
    return <Empty hint="Connecting…" />;
  }
  if (error && !session) {
    return <Empty hint={`Concentus: ${error}`} variant="error" />;
  }

  const np = session?.now_playing;
  if (!np?.track_title) {
    return <Empty hint="Nothing playing" />;
  }

  const art = artUrl(baseUrl, np.album_art_id);
  const wide = w >= 4;
  const big = w >= 6 || (w >= 4 && h >= 3);

  // 2×2 — square card: art on top, info below
  if (!wide) {
    return (
      <div className="h-full w-full flex flex-col gap-2 p-2.5 min-h-0">
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          <Art src={art} />
        </div>
        <Info np={np} session={session} compact />
      </div>
    );
  }

  // wide layouts (4×2+) — art left, info right
  return (
    <div className="h-full w-full flex items-center gap-3 p-3 min-h-0">
      <div
        className={`shrink-0 ${big ? "h-full aspect-square" : "h-full aspect-square max-h-32"}`}
      >
        <Art src={art} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <Info np={np} session={session} compact={false} big={big} />
      </div>
    </div>
  );
}

function Art({ src }: { src: string | null }) {
  if (!src) {
    return (
      <div className="w-full h-full rounded-md bg-bg-card/60 border border-border-subtle flex items-center justify-center text-text-muted/60">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-8 h-8"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-full h-full max-w-full max-h-full object-contain rounded-md shadow-md shadow-black/30"
    />
  );
}

function Info({
  np,
  session,
  compact,
  big,
}: {
  np: NowPlaying;
  session: ConcentusSession | null;
  compact: boolean;
  big?: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 min-w-0">
        <PlayingDot playing={np.is_playing} />
        <span
          className={`font-semibold text-text truncate ${
            big ? "text-[16px]" : compact ? "text-[12.5px]" : "text-[14px]"
          }`}
        >
          {np.track_title}
        </span>
      </div>
      {np.artist_name && (
        <span
          className={`text-text-secondary truncate ${
            big ? "text-[13px]" : compact ? "text-[11px]" : "text-[12px]"
          }`}
        >
          {np.artist_name}
        </span>
      )}
      {np.album_title && (
        <span
          className={`text-text-muted truncate ${
            big ? "text-[12px]" : "text-[10.5px]"
          }`}
        >
          {np.album_title}
        </span>
      )}
      {session?.name && !compact && (
        <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted/60 mt-1 truncate">
          on {session.name}
        </span>
      )}
    </>
  );
}

function PlayingDot({ playing }: { playing: boolean }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
        playing ? "bg-emerald-400 status-pulse" : "bg-text-muted/60"
      }`}
      title={playing ? "Playing" : "Paused"}
    />
  );
}

function Empty({ hint, variant = "muted" }: { hint: string; variant?: "muted" | "error" }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-1.5 p-3 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`w-6 h-6 ${variant === "error" ? "text-rose-400/80" : "text-text-muted/60"}`}
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
      <span className="text-[11px] text-text-muted">{hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config panel — base URL + login credentials.
// ---------------------------------------------------------------------------

function ConcentusConfigPanel({ config, save }: WidgetConfigProps<ConcentusConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Server URL
        </label>
        <input
          value={config?.baseUrl ?? ""}
          onChange={(e) => save({ baseUrl: e.target.value })}
          placeholder="https://music.home.axel-labs.cloud"
          className="w-full px-2.5 py-1.5 text-[12px] font-mono bg-bg-card border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Username
        </label>
        <input
          value={config?.username ?? ""}
          onChange={(e) => save({ username: e.target.value })}
          autoComplete="off"
          className="w-full px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Password
        </label>
        <input
          type="password"
          value={config?.password ?? ""}
          onChange={(e) => save({ password: e.target.value })}
          autoComplete="off"
          className="w-full px-2.5 py-1.5 text-[12px] bg-bg-card border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="text-[10px] text-text-muted/70 leading-snug">
        Credentials persist in <span className="font-mono text-text-secondary">state.yaml</span> in
        plaintext. ianua is LAN-bound and single-user — fine for homelab, not safe to expose to
        the wider internet.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const ConcentusIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const def: WidgetDefinition<ConcentusConfig> = {
  type: "concentus",
  title: "Concentus",
  icon: ConcentusIcon,
  category: "external",
  description: "Now playing from your Concentus music server. Polls every 5 s.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 4,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: {},
  Component: ConcentusComponent,
  ConfigPanel: ConcentusConfigPanel,
};

export default def;
