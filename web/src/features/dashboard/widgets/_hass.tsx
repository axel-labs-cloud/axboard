import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";

// Shared Home Assistant plumbing for the HA widget family (overview, lights,
// fan, power). All widgets pointed at the same base+token share ONE /api/states
// query (deduped by React Query key), and control actions POST to
// /api/services/{domain}/{service} then refresh that shared query.

export const hbase = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

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

// A mutation that calls an HA service and refreshes the shared states query.
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
    onSuccess: () => qc.invalidateQueries({ queryKey: statesKey(base, token) }),
  });
}

export const friendly = (e: HassEntity | undefined, id: string) => e?.attributes?.friendly_name ?? id;
export const isOn = (s?: string) => s === "on" || s === "playing" || s === "home" || s === "open";

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
