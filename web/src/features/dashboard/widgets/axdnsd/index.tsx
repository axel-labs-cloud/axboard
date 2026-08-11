import { SkeletonLines } from "../../../../components/Skeleton";
import type { AxServiceConfig, WidgetDefinition, WidgetProps } from "../types";
import { useAxService, envelopeCount, envelopeItems } from "../ax/useAxService";
import { AxConfigPanel } from "../ax/AxConfigPanel";
import { useSize } from "../useSize";

// ---------------------------------------------------------------------------
// AXDNSD widget — zones + health-check status from an axdnsd instance.
// ---------------------------------------------------------------------------

const PATHS = ["/api/v1/zones?limit=1", "/api/v1/health-checks?limit=200"];

function isHealthy(hc: Record<string, unknown>): boolean {
  const s = String(hc.status ?? hc.state ?? hc.last_status ?? "").toLowerCase();
  return hc.healthy === true || ["healthy", "up", "passing", "ok"].includes(s);
}

function Stat({ label, value, tone = "text-text", big = false }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div className="rounded-md bg-bg-card/40 px-3 py-2 min-w-0">
      <div className="text-[10px] text-text-muted uppercase tracking-wider truncate">{label}</div>
      <div className={`${big ? "text-3xl" : "text-2xl"} font-mono tabular-nums leading-none mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}

function ServiceHeader({ host }: { host?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2 shrink-0">
      <span className="text-accent shrink-0">{DnsIcon}</span>
      <span className="text-[12px] font-semibold text-text-secondary">axdnsd</span>
      {host && <span className="text-[10px] text-text-muted font-mono truncate ml-auto">{host}</span>}
    </div>
  );
}

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function AxdnsdComponent({ config }: WidgetProps<AxServiceConfig>) {
  const box = useSize<HTMLDivElement>();
  const { data, error, loading } = useAxService(config?.baseUrl, config?.username, config?.password, PATHS);
  const host = hostOf(config?.baseUrl);

  if (error) {
    return (
      <div ref={box.ref} className="h-full flex flex-col">
        <ServiceHeader host={host} />
        <div className="flex-1 flex items-center justify-center text-text-muted/70 text-[11px] px-3 text-center">
          {error}
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div ref={box.ref} className="h-full flex flex-col">
        <ServiceHeader host={host} />
        <div className="flex-1 px-1"><SkeletonLines rows={2} /></div>
      </div>
    );
  }

  const zones = envelopeCount(data[PATHS[0]]);
  const hcs = envelopeItems(data[PATHS[1]]);
  const hcUp = hcs.filter(isHealthy).length;
  const hcTone = hcs.length === 0 ? "text-text" : hcUp === hcs.length ? "text-up" : "text-degraded";
  const twoCol = box.w === 0 || box.w >= 200; // stack the stats when narrow
  const big = box.h >= 150;

  return (
    <div ref={box.ref} className="h-full flex flex-col">
      <ServiceHeader host={host} />
      <div className="flex-1 flex flex-col justify-center gap-2 px-3 py-2">
        <div className="grid gap-2" style={{ gridTemplateColumns: twoCol ? "1fr 1fr" : "1fr" }}>
          <Stat label="Zones" value={String(zones)} big={big} />
          <Stat
            label="Health checks"
            value={hcs.length ? `${hcUp}/${hcs.length}` : "—"}
            tone={hcTone}
            big={big}
          />
        </div>
      </div>
    </div>
  );
}

const DnsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z" />
  </svg>
);

const definition: WidgetDefinition<AxServiceConfig> = {
  type: "axdnsd",
  title: "axdnsd",
  icon: DnsIcon,
  category: "services",
  description: "Zones + health-check status from an axdnsd instance.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: AxdnsdComponent,
  ConfigPanel: AxConfigPanel,
};

export default definition;
