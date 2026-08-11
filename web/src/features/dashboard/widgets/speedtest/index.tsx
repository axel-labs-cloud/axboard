import { useEffect, useRef, useState } from "react";
import { useSize } from "../useSize";
import type {
  SpeedTestConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Internet speed-test widget — runs entirely in the browser against
// Cloudflare's public speed endpoints (speed.cloudflare.com, CORS-enabled), so
// it measures the client's connection, not the server's. Reports download /
// upload throughput (Mbps) and latency (ms). Ookla-style, no API key.
// ---------------------------------------------------------------------------

const DOWN = "https://speed.cloudflare.com/__down?bytes=";
const UP = "https://speed.cloudflare.com/__up";

type Phase = "idle" | "ping" | "download" | "upload" | "done" | "error";

interface Result {
  down: number; // Mbps
  up: number; // Mbps
  ping: number; // ms
}

// Measure latency as the best of a few tiny downloads (TTFB-ish).
async function measurePing(signal: AbortSignal): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    const r = await fetch(`${DOWN}0&_=${i}`, { cache: "no-store", signal });
    await r.arrayBuffer();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

// Download `bytes` and return throughput in Mbps.
async function measureDown(bytes: number, signal: AbortSignal): Promise<number> {
  const t = performance.now();
  const r = await fetch(`${DOWN}${bytes}&_=${Math.floor(t)}`, { cache: "no-store", signal });
  const buf = await r.arrayBuffer();
  const sec = (performance.now() - t) / 1000;
  return sec > 0 ? (buf.byteLength * 8) / sec / 1e6 : 0;
}

// Upload `bytes` and return throughput in Mbps.
async function measureUp(bytes: number, signal: AbortSignal): Promise<number> {
  const payload = new Uint8Array(bytes);
  const t = performance.now();
  await fetch(UP, { method: "POST", body: payload, cache: "no-store", signal });
  const sec = (performance.now() - t) / 1000;
  return sec > 0 ? (bytes * 8) / sec / 1e6 : 0;
}

function Metric({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`font-mono tabular-nums font-semibold leading-none ${tone}`} style={{ fontSize: 26 }}>
        {value}
      </span>
      <span className="text-[10px] text-text-muted">{unit}</span>
    </div>
  );
}

const HIST_KEY = "axboard-speedtest-history";

function loadHistory(): Result[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(HIST_KEY) || "[]");
    return Array.isArray(raw) ? raw.slice(-30) : [];
  } catch {
    return [];
  }
}

function Sparkline({ vals, color, w }: { vals: number[]; color: string; w: number }) {
  const width = Math.max(60, w);
  const height = 26;
  if (vals.length < 2) return null;
  const max = Math.max(...vals, 1);
  const step = width / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`);
  return (
    <svg width={width} height={height} className="w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <path d={`M ${pts.join(" L ")}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SpeedTestComponent({ config }: WidgetProps<SpeedTestConfig>) {
  const box = useSize<HTMLDivElement>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>(() => loadHistory());
  const [err, setErr] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const ranAuto = useRef(false);

  async function run() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setErr("");
    try {
      setPhase("ping");
      const ping = await measurePing(ac.signal);
      setPhase("download");
      // Two passes; keep the faster to shed connection warm-up.
      const d1 = await measureDown(10_000_000, ac.signal);
      const d2 = await measureDown(25_000_000, ac.signal);
      setPhase("upload");
      const u1 = await measureUp(5_000_000, ac.signal);
      const u2 = await measureUp(10_000_000, ac.signal);
      const r: Result = { down: Math.max(d1, d2), up: Math.max(u1, u2), ping };
      setResult(r);
      setHistory((h) => {
        const next = [...h, r].slice(-30);
        try {
          window.localStorage.setItem(HIST_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr((e as Error).message || "Speed test failed");
      setPhase("error");
    }
  }

  useEffect(() => {
    if (config?.auto && !ranAuto.current) {
      ranAuto.current = true;
      run();
    }
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.auto]);

  const running = phase === "ping" || phase === "download" || phase === "upload";
  const compact = box.h > 0 && box.h < 120;

  const phaseLabel =
    phase === "ping" ? "Measuring latency…" : phase === "download" ? "Testing download…" : phase === "upload" ? "Testing upload…" : "";

  return (
    <div ref={box.ref} className="h-full flex flex-col items-center justify-center gap-3 px-3 py-3">
      {result && (
        <div className={`flex items-center ${compact ? "gap-4" : "gap-6"}`}>
          <Metric label="Down" value={result.down.toFixed(result.down >= 100 ? 0 : 1)} unit="Mbps" tone="text-up" />
          <Metric label="Up" value={result.up.toFixed(result.up >= 100 ? 0 : 1)} unit="Mbps" tone="text-accent" />
          <Metric label="Ping" value={result.ping.toFixed(0)} unit="ms" tone="text-text" />
        </div>
      )}

      {!result && !running && phase !== "error" && (
        <div className="text-[11px] text-text-muted text-center">Test your connection speed.</div>
      )}

      {running && (
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          <span className="text-[11px] text-text-muted">{phaseLabel}</span>
        </div>
      )}

      {phase === "error" && <div className="text-[11px] text-down text-center px-2">{err}</div>}

      {!compact && history.length >= 2 && (
        <div className="w-full px-1">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-text-muted mb-0.5">
            <span>Download history · {history.length} runs</span>
            <span className="font-mono">{Math.max(...history.map((h) => h.down)).toFixed(0)} peak</span>
          </div>
          <Sparkline vals={history.map((h) => h.down)} color="var(--color-up, #10b981)" w={box.w - 24} />
        </div>
      )}

      {!running && (
        <button
          onClick={run}
          className="px-3 py-1.5 text-[12px] rounded-md border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
        >
          {result || phase === "error" ? "Run again" : "Run speed test"}
        </button>
      )}
    </div>
  );
}

function SpeedTestConfigPanel({ config, save }: WidgetConfigProps<SpeedTestConfig>) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.auto ?? false}
          onChange={(e) => save({ auto: e.target.checked })}
          className="accent-accent"
        />
        Run automatically on load
      </label>
      <p className="text-[11px] text-text-muted leading-snug">
        Runs in your browser against Cloudflare's public speed endpoints — measures this device's
        connection, not the server's. Each run transfers ~50 MB.
      </p>
    </div>
  );
}

const SpeedIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 20a8 8 0 1 0-8-8" />
    <path d="M12 12l4-3" />
    <path d="M4 12H2M6.3 6.3 4.9 4.9" />
  </svg>
);

const definition: WidgetDefinition<SpeedTestConfig> = {
  type: "speedtest",
  title: "Speed test",
  icon: SpeedIcon,
  category: "infrastructure",
  description: "Browser-side internet speed test (download / upload / ping) via Cloudflare.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: SpeedTestComponent,
  ConfigPanel: SpeedTestConfigPanel,
};

export default definition;
