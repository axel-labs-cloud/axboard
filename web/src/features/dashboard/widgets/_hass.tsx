import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";

// Shared Home Assistant plumbing for the HA widget family (overview, lights,
// fan, power). All widgets pointed at the same base+token share ONE /api/states
// query (deduped by React Query key), and control actions POST to
// /api/services/{domain}/{service} then refresh that shared query.

export const hbase = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

// Measures a tile's real pixel height so a widget can pick a layout that fills
// the space — grid rows vary wildly in pixels across screen widths, so a
// row-count heuristic doesn't work. `compact` is true only when the tile is
// genuinely too short for the full layout.
export function useTileFit(threshold = 112) {
  const ref = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setPx(entries[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, compact: px > 0 && px < threshold };
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes?: {
    friendly_name?: string;
    unit_of_measurement?: string;
    brightness?: number; // 0..255
    percentage?: number; // fans
    device_class?: string;
    supported_color_modes?: string[];
    [k: string]: unknown;
  };
}

const statesKey = (base: string, token: string) => ["hass-states", base, token] as const;

export function useHassStates(base: string, token: string, enabled: boolean, refetchMs = 10_000) {
  return useQuery<HassEntity[]>({
    queryKey: statesKey(base, token),
    enabled,
    refetchInterval: refetchMs,
    queryFn: () => api.fetchJson<HassEntity[]>({ url: `${base}/api/states`, headers: { Authorization: `Bearer ${token}` } }),
  });
}

// A mutation that calls an HA service. Reconciliation is DELAYED: HA applies
// state changes asynchronously, so an immediate /api/states refetch returns the
// pre-change state and would clobber the optimistic update (making toggles look
// inverted / fans flip-flop). We wait ~1.5s before invalidating so the refetch
// confirms the new state instead of reverting it; the regular poll also catches
// external changes.
export function useHassService(base: string, token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { domain: string; service: string; data: Record<string, unknown> }) =>
      api.fetchJson({
        url: `${base}/api/services/${a.domain}/${a.service}`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(a.data),
      }),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: statesKey(base, token) }), 1500);
    },
  });
}

export const friendly = (e: HassEntity | undefined, id: string) => e?.attributes?.friendly_name ?? id;
export const isOn = (s?: string) => s === "on" || s === "playing" || s === "home" || s === "open";

// Optimistically patch an entity in the shared states cache so a control
// reflects the intended change instantly (before the /api/states refetch lands).
export function useHassOptimistic(base: string, token: string) {
  const qc = useQueryClient();
  return (entity_id: string, nextState: string, attrs?: Record<string, unknown>) =>
    qc.setQueryData<HassEntity[]>(statesKey(base, token), (old) =>
      old?.map((e) => (e.entity_id === entity_id ? { ...e, state: nextState, attributes: { ...e.attributes, ...attrs } } : e)),
    );
}

// --- Shared connection ----------------------------------------------------
// Home Assistant creds are entered once: any HA widget that has both a URL and
// token remembers them in localStorage, and any HA widget opened with empty
// creds auto-fills from that. So you configure one, and the rest inherit.
const HASS_LS = "axboard.hass.connection";
export function useSharedHassCreds(
  baseUrl: string | undefined,
  token: string | undefined,
  save: (p: { baseUrl?: string; token?: string }) => void,
) {
  useEffect(() => {
    if (!baseUrl && !token) {
      try {
        const s = JSON.parse(localStorage.getItem(HASS_LS) || "null");
        if (s?.baseUrl && s?.token) save({ baseUrl: s.baseUrl, token: s.token });
      } catch {
        /* ignore */
      }
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (baseUrl && token) {
      try {
        localStorage.setItem(HASS_LS, JSON.stringify({ baseUrl, token }));
      } catch {
        /* ignore */
      }
    }
  }, [baseUrl, token]);
}

// --- Entity picker --------------------------------------------------------
// A checkbox list of HA entities (fetched live) filtered to a domain, so users
// pick devices from a list instead of typing entity ids.
export function EntityPicker({
  base,
  token,
  filter,
  value,
  onChange,
  multiple = true,
}: {
  base: string;
  token: string;
  filter: (e: HassEntity) => boolean;
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
}) {
  const ready = !!base && !!token;
  const [q, setQ] = useState("");
  const { data, isLoading, isError } = useHassStates(base, token, ready, 30_000);
  if (!ready) return <p className="text-[11px] text-text-muted">Enter the URL and token to load devices.</p>;
  if (isLoading) return <p className="text-[11px] text-text-muted">Loading devices…</p>;
  if (isError || !data) return <p className="text-[11px] text-down">Couldn't load entities — check the URL/token.</p>;
  const term = q.trim().toLowerCase();
  const opts = data
    .filter(filter)
    .filter((e) => !term || `${friendly(e, e.entity_id)} ${e.entity_id}`.toLowerCase().includes(term))
    .sort((a, z) => friendly(a, a.entity_id).localeCompare(friendly(z, z.entity_id)));
  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  return (
    <div className="rounded border border-border overflow-hidden">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by name…"
        className="w-full px-2 py-1.5 bg-bg-card border-b border-border-subtle text-[12px] text-text placeholder:text-text-muted focus:outline-none"
      />
      <div className="max-h-48 overflow-auto divide-y divide-border-subtle">
      {opts.length === 0 && <p className="text-[11px] text-text-muted p-2">No matching entities found.</p>}
      {opts.map((e) => {
        const sel = value.includes(e.entity_id);
        return (
          <button
            key={e.entity_id}
            onClick={() => toggle(e.entity_id)}
            className={`w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-bg-hover/60 transition-colors ${sel ? "bg-accent/10" : ""}`}
          >
            <span className={`w-3.5 h-3.5 ${multiple ? "rounded" : "rounded-full"} border shrink-0 flex items-center justify-center ${sel ? "bg-accent border-accent" : "border-border"}`}>
              {sel && (
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-text truncate">{friendly(e, e.entity_id)}</span>
              <span className="block text-[10px] font-mono text-text-muted truncate">{e.entity_id}</span>
            </span>
            <span className="text-[10px] font-mono text-text-muted shrink-0">
              {e.state}
              {e.attributes?.unit_of_measurement ? ` ${e.attributes.unit_of_measurement}` : ""}
            </span>
          </button>
        );
      })}
      </div>
    </div>
  );
}

// Entity-domain filters for the pickers.
export const isLight = (e: HassEntity) => e.entity_id.startsWith("light.") || e.entity_id.startsWith("switch.");
export const isFan = (e: HassEntity) => e.entity_id.startsWith("fan.");
export const isPowerSensor = (e: HassEntity) => {
  if (!e.entity_id.startsWith("sensor.")) return false;
  const dc = e.attributes?.device_class;
  const u = e.attributes?.unit_of_measurement;
  return dc === "power" || dc === "energy" || ["W", "kW", "Wh", "kWh"].includes(u ?? "");
};
export const isClimate = (e: HassEntity) => e.entity_id.startsWith("climate.");
export const isCover = (e: HassEntity) => e.entity_id.startsWith("cover.");
export const isMedia = (e: HassEntity) => e.entity_id.startsWith("media_player.");
export const isLock = (e: HassEntity) => e.entity_id.startsWith("lock.");
export const isVacuum = (e: HassEntity) => e.entity_id.startsWith("vacuum.");

// Deep link to an entity's more-info / history in Home Assistant.
export const moreInfoUrl = (base: string, id: string) => `${base}/history?entity_id=${encodeURIComponent(id)}`;

// A small "open in Home Assistant" external-link button for widget headers.
export function OpenInHass({ base, id }: { base: string; id: string }) {
  return (
    <a href={moreInfoUrl(base, id)} target="_blank" rel="noreferrer noopener" title="Open in Home Assistant" className="text-text-muted hover:text-accent shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
        <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    </a>
  );
}
export const isScene = (e: HassEntity) =>
  ["scene.", "script.", "button.", "automation.", "input_button."].some((p) => e.entity_id.startsWith(p));
export const isSensor = (e: HassEntity) => e.entity_id.startsWith("sensor.") || e.entity_id.startsWith("binary_sensor.");

// A small on/off pill toggle.
export function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors disabled:opacity-50 ${on ? "bg-accent" : "bg-border"}`}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
        style={{ transform: on ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}
