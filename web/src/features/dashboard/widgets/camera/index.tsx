import { useEffect, useRef, useState } from "react";
import { useSize } from "../useSize";
import type {
  CameraConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Camera widget — renders a live camera feed as an <img>. Two sources:
//   • Frigate — builds the stream/snapshot URL from a base URL + camera name.
//   • URL — any MJPEG (multipart/x-mixed-replace) or refreshing JPEG endpoint.
// <img> loads cross-origin without CORS (display only), so no proxy is needed.
// MJPEG mode keeps one long-lived stream open; snapshot mode re-fetches a JPEG
// on an interval with a cache-busting query param.
// ---------------------------------------------------------------------------

function buildUrl(cfg: CameraConfig): string {
  if ((cfg.source ?? "url") === "frigate") {
    const base = (cfg.baseUrl ?? "").replace(/\/$/, "");
    const cam = cfg.camera ?? "";
    if (!base || !cam) return "";
    return cfg.mode === "snapshot" ? `${base}/api/${cam}/latest.jpg` : `${base}/api/${cam}`;
  }
  return cfg.streamUrl ?? "";
}

function CameraComponent({ config, editing }: WidgetProps<CameraConfig>) {
  const box = useSize<HTMLDivElement>();
  const cfg = config ?? {};
  const mode = cfg.mode ?? "mjpeg";
  const fit = cfg.fit ?? "cover";
  const url = buildUrl(cfg);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  const failTimer = useRef<number | null>(null);

  // Snapshot mode: bump a counter every refreshSec to re-request the JPEG.
  useEffect(() => {
    if (!url || mode !== "snapshot") return;
    const ms = Math.max(1, cfg.refreshSec ?? 2) * 1000;
    const id = window.setInterval(() => setTick((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [url, mode, cfg.refreshSec]);

  // Reset the error state whenever the target changes.
  useEffect(() => {
    setFailed(false);
  }, [url, mode]);

  if (!url) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        {editing ? "Open config → set a Frigate camera or a stream URL." : "Camera not configured."}
      </div>
    );
  }

  const src = mode === "snapshot" ? `${url}${url.includes("?") ? "&" : "?"}_t=${tick}` : url;
  const title = cfg.title || cfg.camera || "";

  const onError = () => {
    // MJPEG streams occasionally drop; debounce so a blip doesn't flash the error.
    if (failTimer.current) window.clearTimeout(failTimer.current);
    failTimer.current = window.setTimeout(() => setFailed(true), 1500);
  };
  const onLoad = () => {
    if (failTimer.current) window.clearTimeout(failTimer.current);
    setFailed(false);
  };

  const img = (
    <img
      src={src}
      alt={title || "camera"}
      onError={onError}
      onLoad={onLoad}
      draggable={false}
      className="w-full h-full"
      style={{ objectFit: fit, pointerEvents: editing ? "none" : undefined }}
    />
  );

  return (
    <div ref={box.ref} className="relative h-full w-full overflow-hidden bg-black">
      {cfg.link && !editing ? (
        <a href={cfg.link} target="_blank" rel="noreferrer noopener" className="block h-full w-full">
          {img}
        </a>
      ) : (
        img
      )}

      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 text-center px-3">
          <span className="text-[11px] text-text-secondary">Camera feed unavailable</span>
          <button
            onClick={() => {
              setFailed(false);
              setTick((n) => n + 1);
            }}
            className="text-[11px] px-2 py-0.5 rounded border border-border text-text-muted hover:text-text"
          >
            Retry
          </button>
        </div>
      )}

      {cfg.showTitle !== false && title && !failed && (
        <div className="absolute top-0 left-0 right-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          {mode === "mjpeg" && <span className="w-1.5 h-1.5 rounded-full bg-down animate-pulse shrink-0" title="live" />}
          <span className="text-[12px] font-semibold truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style={{ color: cfg.titleColor || "#ffffff" }}>{title}</span>
        </div>
      )}
    </div>
  );
}

function CameraConfigPanel({ config, save }: WidgetConfigProps<CameraConfig>) {
  const source = config?.source ?? "url";
  const mode = config?.mode ?? "mjpeg";
  const fit = config?.fit ?? "cover";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Source</label>
        <div className="grid grid-cols-2 gap-1">
          {([
            ["frigate", "Frigate NVR"],
            ["url", "Stream URL"],
          ] as const).map(([s, lbl]) => (
            <button
              key={s}
              onClick={() => save({ source: s })}
              className={`px-2 py-1.5 text-[11px] rounded border transition-colors ${
                source === s ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {source === "frigate" ? (
        <>
          <Field
            label="Frigate base URL"
            value={config?.baseUrl ?? ""}
            onChange={(v) => save({ baseUrl: v })}
            placeholder="http://frigate.lan:5000"
          />
          <Field
            label="Camera name"
            value={config?.camera ?? ""}
            onChange={(v) => save({ camera: v })}
            placeholder="driveway"
          />
        </>
      ) : (
        <Field
          label="Stream URL (MJPEG or JPEG)"
          value={config?.streamUrl ?? ""}
          onChange={(v) => save({ streamUrl: v })}
          placeholder="http://camera.lan/mjpg/video.mjpg"
        />
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Mode</label>
        <div className="grid grid-cols-2 gap-1">
          {([
            ["mjpeg", "Live (MJPEG)"],
            ["snapshot", "Snapshot poll"],
          ] as const).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => save({ mode: m })}
              className={`px-2 py-1.5 text-[11px] rounded border transition-colors ${
                mode === m ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {mode === "snapshot" && (
        <Field
          label="Refresh (seconds)"
          value={String(config?.refreshSec ?? 2)}
          onChange={(v) => save({ refreshSec: Math.max(1, parseInt(v) || 2) })}
          placeholder="2"
        />
      )}

      <Field label="Title (optional)" value={config?.title ?? ""} onChange={(v) => save({ title: v })} placeholder="Driveway" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Title colour</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config?.titleColor || "#ffffff"}
            onChange={(e) => save({ titleColor: e.target.value })}
            className="w-8 h-8 rounded bg-transparent border border-border cursor-pointer"
          />
          <input
            value={config?.titleColor ?? ""}
            onChange={(e) => save({ titleColor: e.target.value })}
            placeholder="#ffffff"
            className="flex-1 px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text font-mono placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      <Field label="Click-through URL (optional)" value={config?.link ?? ""} onChange={(v) => save({ link: v })} placeholder="http://frigate.lan:5000" />

      <div className="flex items-center gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Fit</label>
          <div className="flex gap-1">
            {(["cover", "contain"] as const).map((f) => (
              <button
                key={f}
                onClick={() => save({ fit: f })}
                className={`px-2 py-1 text-[11px] rounded border capitalize transition-colors ${
                  fit === f ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer pt-4">
          <input type="checkbox" checked={config?.showTitle !== false} onChange={(e) => save({ showTitle: e.target.checked })} className="accent-accent" />
          Show title
        </label>
      </div>

      <p className="text-[11px] text-text-muted leading-snug">
        Feeds render as an image (no CORS needed). MJPEG streams update continuously; snapshot mode
        re-fetches a JPEG on the interval. HTTP streams only load on an HTTP-served dashboard.
      </p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
    </div>
  );
}

const CameraIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="m23 7-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const definition: WidgetDefinition<CameraConfig> = {
  type: "camera",
  title: "Camera",
  icon: CameraIcon,
  category: "infrastructure",
  description: "Live camera feed — Frigate NVR by name, or any MJPEG / JPEG stream URL.",
  minW: 2,
  minH: 2,
  maxW: 12,
  maxH: 10,
  defaultW: 4,
  defaultH: 3,
  // Seeds a public demo MJPEG cam so the widget shows a live feed immediately.
  // It's a third-party public camera that may go offline — replace it with your
  // Frigate camera or your own stream URL in the config.
  defaultConfig: {
    source: "url",
    mode: "mjpeg",
    streamUrl: "http://158.58.130.148/mjpg/video.mjpg",
    title: "Demo — replace with your camera",
    showTitle: true,
    fit: "cover",
  },
  Component: CameraComponent,
  ConfigPanel: CameraConfigPanel,
};

export default definition;
