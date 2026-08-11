import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConcentusConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Concentus now-playing widget.
// Polls /api/v1/sessions/active for the displayed state. Opens a WebSocket
// to /api/v1/sessions/ws so the user can fire transport commands at the
// currently-playing session.
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

function wsUrl(baseUrl: string, token: string): string {
  // Convert http(s):// → ws(s):// for the WebSocket endpoint.
  const u = new URL(`${trim(baseUrl)}/api/v1/sessions/ws`);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("token", token);
  return u.toString();
}

function artUrl(baseUrl: string, albumArtId?: string): string | null {
  if (!albumArtId) return null;
  if (albumArtId.startsWith("http")) return albumArtId;
  if (albumArtId.startsWith("/")) return `${trim(baseUrl)}${albumArtId}`;
  return `${trim(baseUrl)}/api/v1/art/${encodeURIComponent(albumArtId)}`;
}

function ConcentusComponent({ config, w, h, editing }: WidgetProps<ConcentusConfig>) {
  const baseUrl = trim(config?.baseUrl);
  const { username, password } = config ?? {};

  const [access, setAccess] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<string | null>(null);
  const [session, setSession] = useState<ConcentusSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const accessRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  accessRef.current = access;
  refreshRef.current = refresh;

  // -- Login --------------------------------------------------------------
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

  // -- Poll /sessions/active ---------------------------------------------
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
        // Skip axboard's own control session — we don't want to show it as
        // "what's playing" since it never reports now_playing.
        const eligible = sessions.filter((s) => s.now_playing);
        const playing = eligible.find((s) => s.now_playing?.is_playing);
        if (alive) {
          setSession(playing ?? eligible[0] ?? null);
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

  // -- WebSocket for control commands ------------------------------------
  useEffect(() => {
    if (!baseUrl || !access) return;
    let alive = true;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (!alive) return;
      try {
        const ws = new WebSocket(wsUrl(baseUrl, access));
        wsRef.current = ws;
        ws.onopen = () => {
          // Register as a passive remote so the hub stops asking us for state.
          ws.send(
            JSON.stringify({
              type: "register",
              session_name: "axboard dashboard",
              capabilities: ["remote_control"],
            }),
          );
        };
        ws.onclose = () => {
          wsRef.current = null;
          if (alive) reconnectTimer = window.setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          // onclose will fire too; let it handle reconnect.
        };
      } catch {
        if (alive) reconnectTimer = window.setTimeout(connect, 3000);
      }
    };
    connect();
    return () => {
      alive = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [baseUrl, access]);

  const sendCommand = useCallback(
    (cmd: "play" | "pause" | "next_track" | "prev_track") => {
      const ws = wsRef.current;
      const target = session?.id;
      if (!ws || ws.readyState !== WebSocket.OPEN || !target) return;
      ws.send(
        JSON.stringify({
          type: "command",
          target_session: target,
          command: cmd,
        }),
      );
      // Optimistic flip — the next poll will overwrite if it didn't take.
      if (cmd === "play" || cmd === "pause") {
        setSession((s) =>
          s?.now_playing
            ? {
                ...s,
                now_playing: { ...s.now_playing, is_playing: cmd === "play" },
              }
            : s,
        );
      }
    },
    [session],
  );

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
  const big = w >= 6 || h >= 3;
  const controlsDisabled = editing || !session;

  const Controls = (
    <div className="flex items-center gap-2">
      <ControlButton
        title="Previous"
        disabled={controlsDisabled}
        onClick={() => sendCommand("prev_track")}
      >
        <PrevIcon />
      </ControlButton>
      <ControlButton
        title={np.is_playing ? "Pause" : "Play"}
        primary
        disabled={controlsDisabled}
        onClick={() => sendCommand(np.is_playing ? "pause" : "play")}
      >
        {np.is_playing ? <PauseIcon /> : <PlayIcon />}
      </ControlButton>
      <ControlButton
        title="Next"
        disabled={controlsDisabled}
        onClick={() => sendCommand("next_track")}
      >
        <NextIcon />
      </ControlButton>
    </div>
  );

  // -- Square (2x2): art on top, controls overlaid on art bottom --------
  if (!wide) {
    return (
      <div className="h-full w-full flex flex-col gap-2 p-2.5 min-h-0">
        <div className="flex-1 min-h-0 w-full relative flex items-center justify-center">
          <Art src={art} />
          {art && (
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center py-1 rounded-md bg-black/55 backdrop-blur-sm">
              {Controls}
            </div>
          )}
        </div>
        <Info np={np} session={session} compact />
      </div>
    );
  }

  // -- Wide (4xN+): art left, info + controls right --------------------
  return (
    <div className="h-full w-full flex items-center gap-3 p-3 min-h-0">
      <div
        className={`shrink-0 ${big ? "h-full aspect-square" : "h-full aspect-square max-h-32"}`}
      >
        <Art src={art} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <Info np={np} session={session} compact={false} big={big} />
        <div className="mt-1">{Controls}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

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
      <span
        className={`font-semibold text-text truncate ${
          big ? "text-[16px]" : compact ? "text-[12.5px]" : "text-[14px]"
        }`}
      >
        {np.track_title}
      </span>
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
          className={`text-text-muted truncate ${big ? "text-[12px]" : "text-[10.5px]"}`}
        >
          {np.album_title}
        </span>
      )}
      {session?.name && !compact && (
        <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted/60 mt-0.5 truncate">
          on {session.name}
        </span>
      )}
    </>
  );
}

function ControlButton({
  title,
  onClick,
  disabled,
  primary,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={`flex items-center justify-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        primary
          ? "w-8 h-8 bg-text/90 text-bg hover:bg-text"
          : "w-7 h-7 text-text-secondary hover:text-text hover:bg-bg-hover"
      }`}
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <rect x="6" y="5" width="4" height="14" rx="0.5" />
      <rect x="14" y="5" width="4" height="14" rx="0.5" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M6 6h2v12H6zM9 12l10 6V6z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M16 6h2v12h-2zM5 6v12l10-6z" />
    </svg>
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
        className={`w-6 h-6 ${variant === "error" ? "text-down/80" : "text-text-muted/60"}`}
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
        plaintext. axboard is LAN-bound and single-user — fine for homelab, not safe to expose to
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
  description: "Now playing from your Concentus music server, with play/pause + skip controls.",
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
