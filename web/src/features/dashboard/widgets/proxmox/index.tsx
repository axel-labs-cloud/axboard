import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatusDot, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { scaleColor } from "../colorScale";
import type { ProxmoxConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Proxmox VE widget — one /cluster/resources call returns every node, VM and
// LXC with live CPU / memory / disk, so we render the whole cluster from a
// single request (PVEAPIToken auth via the shared /api/fetch proxy).
// ---------------------------------------------------------------------------

interface Res {
  id: string;
  type: string; // node | qemu | lxc | storage | sdn | pool
  node?: string;
  status?: string; // online/offline (node) · running/stopped (guest)
  name?: string;
  vmid?: number;
  template?: number;
  cpu?: number; // 0..1 fraction of maxcpu
  maxcpu?: number; // cores
  mem?: number; // bytes
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
}

const CPU_OPTS = { lo: 0, hi: 100, warn: 75, crit: 90 };
const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const pct = (used?: number, max?: number) => (max && max > 0 ? (100 * (used ?? 0)) / max : 0);
const gb = (b?: number) => {
  const v = (b ?? 0) / 1e9;
  return v >= 100 ? `${v.toFixed(0)}G` : `${v.toFixed(1)}G`;
};
const uptime = (s?: number) => {
  if (!s || s <= 0) return "";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
};

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between text-[9.5px] text-text-muted leading-none mb-1">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-text-secondary">{value.toFixed(0)}%</span>
      </div>
      <Meter pct={value} color={scaleColor(value, undefined, CPU_OPTS)} />
    </div>
  );
}

function ProxmoxComponent({ config }: WidgetProps<ProxmoxConfig>) {
  const b = base(config?.baseUrl);
  const tokenId = config?.tokenId?.trim();
  const secret = config?.tokenSecret?.trim();
  const title = config?.title?.trim() || "Proxmox";
  const ready = !!b && !!tokenId && !!secret;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pve", b, tokenId],
    enabled: ready,
    refetchInterval: 10_000,
    queryFn: () =>
      api.fetchJson<{ data: Res[] }>({
        url: `${b}/api2/json/cluster/resources`,
        headers: { Authorization: `PVEAPIToken=${tokenId}=${secret}` },
      }),
  });

  if (!ready) {
    return (
      <EmptyState
        icon={PveIcon}
        title="Connect Proxmox"
        hint="Set the API URL (https://host:8006), an API token id (user@realm!name) and its secret in config."
      />
    );
  }
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach the PVE API."} onRetry={() => refetch()} />;
  if (isLoading) return <SkeletonLines rows={4} />;

  const all = data?.data ?? [];
  const nodes = all.filter((r) => r.type === "node").sort((a, z) => (a.node ?? "").localeCompare(z.node ?? ""));
  const guests = all
    .filter((r) => (r.type === "qemu" || r.type === "lxc") && !r.template)
    .sort((a, z) => (z.status === "running" ? 1 : 0) - (a.status === "running" ? 1 : 0) || (a.name ?? "").localeCompare(z.name ?? ""));
  const running = guests.filter((g) => g.status === "running").length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={PveIcon}
        title={title}
        right={<span className="text-[11px] font-mono text-text-muted">{running}/{guests.length} up</span>}
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 pb-2 space-y-2">
        {nodes.map((n) => (
          <div key={n.id} className="rounded-lg bg-bg-card/40 border border-border-subtle/50 p-2">
            <div className="flex items-center gap-2 mb-1.5">
              <StatusDot status={n.status === "online" ? "up" : "down"} size="md" title={n.status} />
              <span className="text-[12px] text-text font-medium truncate flex-1">{n.node}</span>
              <span className="text-[10px] font-mono text-text-muted shrink-0">
                {n.maxcpu ?? 0}c{uptime(n.uptime) ? ` · ${uptime(n.uptime)}` : ""}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <Bar label="CPU" value={(n.cpu ?? 0) * 100} />
              <Bar label={`RAM ${gb(n.mem)}/${gb(n.maxmem)}`} value={pct(n.mem, n.maxmem)} />
              <Bar label="Disk" value={pct(n.disk, n.maxdisk)} />
            </div>
          </div>
        ))}

        {guests.length > 0 && (
          <div className="pt-0.5">
            <div className="text-[10px] uppercase tracking-wide text-text-muted px-0.5 mb-0.5">
              Guests · {guests.length}
            </div>
            <div className="divide-y divide-border-subtle">
              {guests.map((g) => {
                const run = g.status === "running";
                return (
                  <div key={g.id} className="flex items-center gap-2 py-1">
                    <StatusDot status={run ? "up" : "unknown"} size="sm" title={g.status} />
                    <span className="text-[9px] font-mono px-1 py-px rounded bg-bg-elevated text-text-muted shrink-0">
                      {g.type === "lxc" ? "CT" : "VM"}
                    </span>
                    <span className="text-[11.5px] text-text-secondary truncate flex-1" title={`${g.name ?? g.vmid} · ${g.node}`}>
                      {g.name ?? g.vmid}
                    </span>
                    {run ? (
                      <span className="text-[10px] font-mono tabular-nums text-text-muted shrink-0">
                        {((g.cpu ?? 0) * 100).toFixed(0)}% · {pct(g.mem, g.maxmem).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-text-muted/60 shrink-0">stopped</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProxmoxConfigPanel({ config, save }: WidgetConfigProps<ProxmoxConfig>) {
  const F = (label: string, key: keyof ProxmoxConfig, ph: string, mono = true, hint?: string) => (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold flex items-center gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal text-text-muted/70 font-normal">{hint}</span>}
      </label>
      <input
        value={(config?.[key] as string) ?? ""}
        onChange={(e) => save({ [key]: e.target.value } as Partial<ProxmoxConfig>)}
        placeholder={ph}
        className={`w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
  return (
    <div className="space-y-3">
      {F("API URL", "baseUrl", "https://10.10.0.31:8006")}
      {F("Token ID", "tokenId", "root@pam!axboard")}
      {F("Token secret", "tokenSecret", "xxxxxxxx-xxxx-…")}
      {F("Title", "title", "Proxmox", false)}
      <p className="text-[11px] text-text-muted leading-snug">
        Create a read-only API token in PVE: Datacenter → Permissions → API Tokens. Give it{" "}
        <span className="font-mono">PVEAuditor</span> on <span className="font-mono">/</span>. The secret stays in your config.yaml.
      </p>
    </div>
  );
}

const PveIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="2" y="3" width="20" height="6" rx="1" />
    <rect x="2" y="15" width="20" height="6" rx="1" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

const definition: WidgetDefinition<ProxmoxConfig> = {
  type: "proxmox",
  title: "Proxmox",
  icon: PveIcon,
  category: "infrastructure",
  description: "Proxmox VE cluster — nodes + VMs/LXC with live CPU / RAM / disk.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 10,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: {},
  Component: ProxmoxComponent,
  ConfigPanel: ProxmoxConfigPanel,
};

export default definition;
