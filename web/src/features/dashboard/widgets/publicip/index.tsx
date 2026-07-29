import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type {
  PublicIPConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Public-IP / VPN widget — axboard's WAN IP + coarse geo/ISP. If an "expected
// ISP" keyword is set, shows VPN on/off by matching it against the live ISP —
// handy to verify a tunnel / kill-switch is up.
// ---------------------------------------------------------------------------

function PublicIPComponent({ config }: WidgetProps<PublicIPConfig>) {
  const box = useSize<HTMLDivElement>();
  const { data, isError } = useQuery({
    queryKey: ["publicip"],
    queryFn: api.getPublicIp,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  if (isError || !data?.ip) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        Public IP unavailable.
      </div>
    );
  }

  const expect = config?.expectIsp?.trim().toLowerCase();
  const ispText = `${data.isp ?? ""} ${data.org ?? ""}`.toLowerCase();
  const vpnOn = expect ? ispText.includes(expect) : null;

  // Short → IP (+ VPN) only; taller → geo + ISP. IP grows with room.
  const showGeo = box.h === 0 || box.h >= 82;
  const bigIp = box.h >= 128 || box.w >= 268;

  return (
    <div ref={box.ref} className="h-full flex flex-col justify-center gap-1.5 px-3.5 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`${bigIp ? "text-2xl" : "text-xl"} font-mono tabular-nums text-text leading-none truncate`}>{data.ip}</span>
        {vpnOn !== null && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ring-1 shrink-0 ${
              vpnOn ? "bg-up/15 text-up ring-up/30" : "bg-down/15 text-down ring-down/30"
            }`}
          >
            {vpnOn ? "VPN on" : "VPN off"}
          </span>
        )}
      </div>
      {showGeo && (
        <>
          <div className="text-[11px] text-text-muted truncate">
            {[data.city, data.country].filter(Boolean).join(", ")}
          </div>
          {data.isp && <div className="text-[11px] text-text-secondary truncate">{data.isp}</div>}
        </>
      )}
    </div>
  );
}

function PublicIPConfigPanel({ config, save }: WidgetConfigProps<PublicIPConfig>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
        Expected ISP keyword (optional)
      </label>
      <input
        value={config?.expectIsp ?? ""}
        onChange={(e) => save({ expectIsp: e.target.value })}
        placeholder="e.g. Mullvad"
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
      <p className="text-[11px] text-text-muted leading-snug">
        If the live ISP contains this keyword, the widget shows “VPN on”.
      </p>
    </div>
  );
}

const IPIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const definition: WidgetDefinition<PublicIPConfig> = {
  type: "publicip",
  title: "Public IP",
  icon: IPIcon,
  category: "infrastructure",
  description: "WAN IP + geo/ISP, with an optional VPN on/off check.",
  minW: 2,
  minH: 1,
  maxW: 6,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: PublicIPComponent,
  ConfigPanel: PublicIPConfigPanel,
};

export default definition;
