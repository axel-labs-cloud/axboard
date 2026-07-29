import { SkeletonLines } from "../../../../components/Skeleton";
import type { AxServiceConfig, WidgetDefinition, WidgetProps } from "../types";
import { useAxService, envelopeItems } from "../ax/useAxService";
import { AxConfigPanel } from "../ax/AxConfigPanel";
import { useSize } from "../useSize";

// ---------------------------------------------------------------------------
// AXLBD widget — load balancers and their status from an axlbd instance.
// ---------------------------------------------------------------------------

const PATHS = ["/api/v1/load-balancers?limit=100"];

function lbTone(status: string): string {
  const s = status.toLowerCase();
  if (["active", "healthy", "up", "online", "ready"].includes(s)) return "bg-up";
  if (["degraded", "provisioning", "pending"].includes(s)) return "bg-degraded";
  if (!s) return "bg-unknown/60";
  return "bg-down";
}

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function AxlbdComponent({ config }: WidgetProps<AxServiceConfig>) {
  const box = useSize<HTMLDivElement>();
  const { data, error, loading } = useAxService(config?.baseUrl, config?.username, config?.password, PATHS);
  const host = hostOf(config?.baseUrl);

  const header = (
    <div className="flex items-center gap-1.5 px-3 pt-2 shrink-0">
      <span className="text-accent shrink-0">{LbIcon}</span>
      <span className="text-[12px] font-semibold text-text-secondary">axlbd</span>
      {host && <span className="text-[10px] text-text-muted font-mono truncate ml-auto">{host}</span>}
    </div>
  );

  if (error) {
    return (
      <div ref={box.ref} className="h-full flex flex-col">
        {header}
        <div className="flex-1 flex items-center justify-center text-text-muted/70 text-[11px] px-3 text-center">
          {error}
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div ref={box.ref} className="h-full flex flex-col">
        {header}
        <div className="flex-1 px-1"><SkeletonLines rows={3} /></div>
      </div>
    );
  }

  const lbs = envelopeItems(data[PATHS[0]]);
  const compact = box.h > 0 && box.h < 132;
  const showStatus = box.w >= 168;

  const count = (
    <div className="flex items-baseline gap-1.5 px-3 pt-1 pb-1 shrink-0">
      <span className="text-2xl font-mono tabular-nums text-text leading-none">{lbs.length}</span>
      <span className="text-[12px] text-text-muted">load balancer{lbs.length === 1 ? "" : "s"}</span>
    </div>
  );

  return (
    <div ref={box.ref} className="h-full flex flex-col">
      {header}
      {count}
      {compact ? (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {lbs.map((lb, i) => {
            const status = String(lb.status ?? lb.state ?? "");
            return <span key={String(lb.id ?? i)} title={`${String(lb.name ?? lb.id ?? "lb")}${status ? ` · ${status}` : ""}`} className={`w-2 h-2 rounded-full ${lbTone(status)}`} />;
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto px-2 pb-2 divide-y divide-border-subtle">
          {lbs.length === 0 && <div className="text-[11px] text-text-muted px-1 py-2">None.</div>}
          {lbs.map((lb, i) => {
            const status = String(lb.status ?? lb.state ?? "");
            return (
              <div key={String(lb.id ?? i)} className="flex items-center gap-2 px-1.5 py-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${lbTone(status)}`} title={status} />
                <span className="text-[12px] text-text-secondary truncate flex-1">
                  {String(lb.name ?? lb.id ?? "lb")}
                </span>
                {showStatus && status && <span className="text-[10px] text-text-muted truncate shrink-0">{status}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const LbIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="9" y="2" width="6" height="6" rx="1" />
    <rect x="2" y="16" width="6" height="6" rx="1" />
    <rect x="16" y="16" width="6" height="6" rx="1" />
    <path d="M12 8v4M12 12H5v4M12 12h7v4" />
  </svg>
);

const definition: WidgetDefinition<AxServiceConfig> = {
  type: "axlbd",
  title: "axlbd",
  icon: LbIcon,
  category: "infrastructure",
  description: "Load balancers + status from an axlbd instance.",
  minW: 2,
  minH: 2,
  maxW: 5,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: AxlbdComponent,
  ConfigPanel: AxConfigPanel,
};

export default definition;
