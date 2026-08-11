import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, StatusDot, Meter } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { scaleColor } from "../colorScale";
import type { ProxmoxConfig, ProxmoxServer, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Proxmox VE widget — one or more PVE endpoints. Each /cluster/resources call
// returns every node, VM, LXC and storage with live CPU / memory / disk;
// results merge into one panel. Node names open the PVE UI; guests open their
// noVNC console. Optional backup-age lookup walks each backup datastore.
// Auth: a PVEAPIToken (created WITHOUT privilege separation, or granted
// PVEAuditor on /) forwarded via the shared /api/fetch proxy.
// ---------------------------------------------------------------------------

interface Res {
  id: string;
  type: string; // node | qemu | lxc | storage | …
  node?: string;
  status?: string;
  name?: string;
  vmid?: number;
  template?: number;
  cpu?: number; // 0..1
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  storage?: string; // storage entries: datastore name
  shared?: number;
}
interface ServerResult {
  server: ProxmoxServer;
  resources: Res[];
  error: string | null;
}

const CPU_OPTS = { lo: 0, hi: 100, warn: 75, crit: 90 };
const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");
const authHeader = (s: ProxmoxServer) => ({ Authorization: `PVEAPIToken=${s.tokenId}=${s.tokenSecret}` });
const clampPct = (used?: number, max?: number) => (max && max > 0 ? Math.min(100, (100 * (used ?? 0)) / max) : 0);
const gb = (b?: number) => {
  const v = (b ?? 0) / 1e9;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}T`;
  return v >= 100 ? `${v.toFixed(0)}G` : `${v.toFixed(1)}G`;
};
const uptime = (s?: number) => {
  if (!s || s <= 0) return "";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
};
const hostOf = (u?: string) => {
  try {
    return new URL(u ?? "").hostname;
  } catch {
    return u ?? "";
  }
};
const consoleUrl = (s: ProxmoxServer, g: Res) =>
  `${base(s.baseUrl)}/?console=${g.type === "lxc" ? "lxc" : "kvm"}&novnc=1&vmid=${g.vmid}&node=${g.node}&resize=off`;

// Normalise config → a list of complete servers (honours the legacy single-server fields).
function serverList(config?: ProxmoxConfig): ProxmoxServer[] {
  const list = config?.servers?.length
    ? config.servers
    : config?.baseUrl
      ? [{ baseUrl: config.baseUrl, tokenId: config.tokenId, tokenSecret: config.tokenSecret }]
      : [];
  return list.filter((s) => s.baseUrl && s.tokenId && s.tokenSecret);
}

// Best-effort: latest backup ctime (unix seconds) per vmid across a server's
// backup-capable datastores. Shared stores are queried once.
async function fetchBackups(s: ProxmoxServer): Promise<Record<number, number>> {
  const b = base(s.baseUrl);
  const headers = authHeader(s);
  const latest: Record<number, number> = {};
  const nodes = await api.fetchJson<{ data: { node: string; status: string }[] }>({
    url: `${b}/api2/json/nodes`,
    headers,
  });
  const online = (nodes.data ?? []).filter((n) => n.status === "online");
  const seen = new Set<string>();
  for (const n of online) {
    let stores: { data: { storage: string; shared?: number }[] };
    try {
      stores = await api.fetchJson({ url: `${b}/api2/json/nodes/${n.node}/storage?content=backup`, headers });
    } catch {
      continue;
    }
    for (const st of stores.data ?? []) {
      const key = st.shared ? st.storage : `${n.node}/${st.storage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const content = await api.fetchJson<{ data: { vmid?: number; ctime?: number }[] }>({
          url: `${b}/api2/json/nodes/${n.node}/storage/${st.storage}/content?content=backup`,
          headers,
        });
        for (const it of content.data ?? []) {
          if (it.vmid == null || it.ctime == null) continue;
          if ((latest[it.vmid] ?? 0) < it.ctime) latest[it.vmid] = it.ctime;
        }
      } catch {
        /* ignore a store we can't read */
      }
    }
  }
  return latest;
}

// A full-width host resource bar (label above, fill below).
function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between text-[9.5px] text-text-muted leading-none mb-1">
        <span className="truncate">{label}</span>
        <span className="font-mono tabular-nums text-text-secondary shrink-0">{value.toFixed(0)}%</span>
      </div>
      <Meter pct={value} color={scaleColor(value, undefined, CPU_OPTS)} />
    </div>
  );
}

// A compact right-column metric cell: a mini bar + % that lines up row-to-row.
function Cell({ value }: { value: number }) {
  return (
    <div className="w-[74px] shrink-0 flex items-center gap-1.5">
      <div className="flex-1 min-w-0">
        <Meter pct={value} color={scaleColor(value, undefined, CPU_OPTS)} />
      </div>
      <span className="w-7 text-right font-mono tabular-nums text-[10px] text-text-secondary">{value.toFixed(0)}%</span>
    </div>
  );
}

// Backup-age chip: muted when fresh, amber >2d, red >7d or never.
function BackupChip({ ctime }: { ctime?: number }) {
  if (!ctime) {
    return (
      <span className="w-12 shrink-0 text-right text-[10px] font-mono text-down/70" title="No backup found">
        no bkp
      </span>
    );
  }
  const days = (Date.now() / 1000 - ctime) / 86400;
  const tone = days > 7 ? "text-down" : days > 2 ? "text-degraded" : "text-text-muted";
  const label = timeAgoShort(ctime);
  return (
    <span className={`w-12 shrink-0 text-right text-[10px] font-mono ${tone}`} title={`Last backup ${new Date(ctime * 1000).toLocaleString()}`}>
      {label}
    </span>
  );
}
function timeAgoShort(ctime: number): string {
  const s = Date.now() / 1000 - ctime;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function ProxmoxComponent({ config }: WidgetProps<ProxmoxConfig>) {
  const servers = serverList(config);
  const title = config?.title?.trim() || "Proxmox";
  const compact = config?.compact === true;
  const showSummary = config?.showSummary !== false;
  const showGuests = config?.showGuests !== false && !compact;
  const showStorage = config?.showStorage !== false && !compact;
  const showBackups = config?.showBackups === true && showGuests;

  const { data, isLoading } = useQuery({
    queryKey: ["pve", servers.map((s) => `${s.baseUrl}|${s.tokenId}`)],
    enabled: servers.length > 0,
    refetchInterval: 10_000,
    queryFn: (): Promise<ServerResult[]> =>
      Promise.all(
        servers.map(async (s): Promise<ServerResult> => {
          try {
            const r = await api.fetchJson<{ data: Res[] }>({
              url: `${base(s.baseUrl)}/api2/json/cluster/resources`,
              headers: authHeader(s),
            });
            return { server: s, resources: r.data ?? [], error: null };
          } catch (e) {
            return { server: s, resources: [], error: (e as Error).message };
          }
        }),
      ),
  });

  // Separate, slower query for backup ages — keyed by server + toggle.
  const { data: backups } = useQuery({
    queryKey: ["pve-backups", servers.map((s) => `${s.baseUrl}|${s.tokenId}`)],
    enabled: showBackups && servers.length > 0,
    refetchInterval: 300_000,
    queryFn: async (): Promise<Record<number, number>[]> =>
      Promise.all(servers.map((s) => fetchBackups(s).catch(() => ({}) as Record<number, number>))),
  });

  if (servers.length === 0) {
    return (
      <EmptyState
        icon={PveIcon}
        title="Connect Proxmox"
        hint="Add a server: API URL (https://host:8006), a token id (user@realm!name) and its secret."
      />
    );
  }
  if (isLoading || !data) return <SkeletonLines rows={4} />;

  const guestsOf = (rs: Res[]) => rs.filter((r) => (r.type === "qemu" || r.type === "lxc") && !r.template);
  const allGuests = data.flatMap((d) => guestsOf(d.resources));
  const running = allGuests.filter((g) => g.status === "running").length;
  const multi = data.length > 1;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={PveIcon}
        title={title}
        right={<span className="text-[11px] font-mono text-text-muted">{running}/{allGuests.length} up</span>}
      />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 pb-2 space-y-2">
        {data.map((d, si) => {
          const nodes = d.resources
            .filter((r) => r.type === "node")
            .sort((a, z) => (a.node ?? "").localeCompare(z.node ?? ""));
          const guests = guestsOf(d.resources).sort(
            (a, z) =>
              (z.status === "running" ? 1 : 0) - (a.status === "running" ? 1 : 0) ||
              (a.name ?? "").localeCompare(z.name ?? ""),
          );
          // Storage: dedupe shared datastores (they repeat per node); keep any with capacity.
          const storeMap = new Map<string, Res>();
          for (const r of d.resources) {
            if (r.type !== "storage" || !(r.maxdisk && r.maxdisk > 0)) continue;
            const key = r.shared ? (r.storage ?? r.id) : r.id;
            if (!storeMap.has(key)) storeMap.set(key, r);
          }
          const stores = [...storeMap.values()].sort((a, z) => clampPct(z.disk, z.maxdisk) - clampPct(a.disk, a.maxdisk));
          const label = d.server.name?.trim() || hostOf(d.server.baseUrl);
          const bkp = backups?.[si];

          // Cluster capacity summary (weighted CPU across nodes).
          const cores = nodes.reduce((n, x) => n + (x.maxcpu ?? 0), 0);
          const ramUsed = nodes.reduce((n, x) => n + (x.mem ?? 0), 0);
          const ramTotal = nodes.reduce((n, x) => n + (x.maxmem ?? 0), 0);
          const cpuPct = cores > 0 ? (100 * nodes.reduce((n, x) => n + (x.cpu ?? 0) * (x.maxcpu ?? 0), 0)) / cores : 0;
          const gRun = guests.filter((g) => g.status === "running").length;

          return (
            <div key={si} className="space-y-2">
              {showSummary ? (
                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 px-0.5 pt-1 text-[10px] text-text-muted">
                  {multi && <span className="uppercase tracking-wide font-semibold text-text-muted/80">{label}</span>}
                  <span>{nodes.length} node{nodes.length === 1 ? "" : "s"}</span>
                  <span className="text-text-muted/40">·</span>
                  <span>{cores}c</span>
                  <span className="text-text-muted/40">·</span>
                  <span>CPU {cpuPct.toFixed(0)}%</span>
                  <span className="text-text-muted/40">·</span>
                  <span>RAM {gb(ramUsed)}/{gb(ramTotal)}</span>
                  <span className="text-text-muted/40">·</span>
                  <span>{gRun}/{guests.length} up</span>
                </div>
              ) : (
                multi && <div className="text-[10px] uppercase tracking-wide text-text-muted/80 px-0.5 pt-1 font-semibold">{label}</div>
              )}
              {d.error && <div className="text-[11px] text-down px-1 py-1.5">{label}: {d.error}</div>}

              {compact ? (
                <div>
                  <div className="flex items-center text-[10px] uppercase tracking-wide text-text-muted px-0.5 mb-0.5">
                    <span className="flex-1">Nodes</span>
                    <span className="w-[74px] text-right pr-8">CPU</span>
                    <span className="w-[74px] text-right pr-8">RAM</span>
                    <span className="w-[74px] text-right pr-8">Disk</span>
                  </div>
                  <div className="divide-y divide-border-subtle">
                    {nodes.map((n) => (
                      <a
                        key={n.id}
                        href={base(d.server.baseUrl)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-2 py-1 hover:bg-bg-hover/60 rounded -mx-1 px-1"
                        title="Open PVE web UI"
                      >
                        <StatusDot status={n.status === "online" ? "up" : "down"} size="sm" title={n.status} />
                        <span className="text-[11.5px] text-text truncate flex-1">{n.node}</span>
                        <Cell value={(n.cpu ?? 0) * 100} />
                        <Cell value={clampPct(n.mem, n.maxmem)} />
                        <Cell value={clampPct(n.disk, n.maxdisk)} />
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                nodes.map((n) => {
                  const worst = Math.max((n.cpu ?? 0) * 100, clampPct(n.mem, n.maxmem), clampPct(n.disk, n.maxdisk));
                  const alert = n.status !== "online" || worst >= 90 ? "var(--color-down)" : worst >= 75 ? "var(--color-degraded)" : undefined;
                  return (
                    <div
                      key={n.id}
                      className="rounded-lg bg-bg-card/40 border p-2"
                      style={{ borderColor: alert ?? "var(--color-border-subtle)" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <StatusDot status={n.status === "online" ? "up" : "down"} size="md" title={n.status} />
                        <a
                          href={base(d.server.baseUrl)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[12px] text-text font-medium truncate flex-1 hover:text-accent focus-visible:outline-none focus-visible:underline"
                          title="Open PVE web UI"
                        >
                          {n.node}
                        </a>
                        <span className="text-[10px] font-mono text-text-muted shrink-0">
                          {n.maxcpu ?? 0}c{uptime(n.uptime) ? ` · ${uptime(n.uptime)}` : ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2.5">
                        <Bar label="CPU" value={(n.cpu ?? 0) * 100} />
                        <Bar label={`RAM ${gb(n.mem)}/${gb(n.maxmem)}`} value={clampPct(n.mem, n.maxmem)} />
                        <Bar label="Disk" value={clampPct(n.disk, n.maxdisk)} />
                      </div>
                    </div>
                  );
                })
              )}

              {showGuests && guests.length > 0 && (
                <div>
                  <div className="flex items-center text-[10px] uppercase tracking-wide text-text-muted px-0.5 mb-0.5">
                    <span className="flex-1">Guests · {guests.length}</span>
                    {showBackups && <span className="w-12 text-right">Bkp</span>}
                    <span className="w-[74px] text-right pr-8">CPU</span>
                    <span className="w-[74px] text-right pr-8">RAM</span>
                  </div>
                  <div className="divide-y divide-border-subtle">
                    {guests.map((g) => {
                      const run = g.status === "running";
                      return (
                        <a
                          key={g.id}
                          href={consoleUrl(d.server, g)}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={`Open ${g.name ?? g.vmid} console`}
                          className="flex items-center gap-2 py-1 hover:bg-bg-hover/60 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 -mx-1 px-1"
                        >
                          <StatusDot status={run ? "up" : "unknown"} size="sm" title={g.status} />
                          <span className="text-[9px] font-mono px-1 py-px rounded bg-bg-elevated text-text-muted shrink-0">
                            {g.type === "lxc" ? "CT" : "VM"}
                          </span>
                          <span className="text-[11.5px] text-text-secondary truncate flex-1">{g.name ?? g.vmid}</span>
                          {showBackups && <BackupChip ctime={g.vmid != null ? bkp?.[g.vmid] : undefined} />}
                          {run ? (
                            <>
                              <Cell value={(g.cpu ?? 0) * 100} />
                              <Cell value={clampPct(g.mem, g.maxmem)} />
                            </>
                          ) : (
                            <span className="w-[164px] text-right text-[10px] text-text-muted/60 shrink-0">stopped</span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {showStorage && stores.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted px-0.5 mb-0.5">Storage · {stores.length}</div>
                  <div className="space-y-1">
                    {stores.map((s) => {
                      const v = clampPct(s.disk, s.maxdisk);
                      return (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="text-[11px] text-text-secondary truncate flex-1" title={s.storage}>
                            {s.storage}
                          </span>
                          <div className="w-[74px] shrink-0">
                            <Meter pct={v} color={scaleColor(v, undefined, CPU_OPTS)} />
                          </div>
                          <span className="w-[84px] text-right font-mono tabular-nums text-[10px] text-text-muted shrink-0">
                            {gb(s.disk)}/{gb(s.maxdisk)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProxmoxConfigPanel({ config, save }: WidgetConfigProps<ProxmoxConfig>) {
  // Seed from legacy single-server fields the first time.
  const servers: ProxmoxServer[] =
    config?.servers ??
    (config?.baseUrl ? [{ baseUrl: config.baseUrl, tokenId: config.tokenId, tokenSecret: config.tokenSecret }] : [{}]);

  const setServer = (i: number, patch: Partial<ProxmoxServer>) =>
    save({
      servers: servers.map((s, j) => (j === i ? { ...s, ...patch } : s)),
      baseUrl: undefined,
      tokenId: undefined,
      tokenSecret: undefined,
    });
  const addServer = () => save({ servers: [...servers, {}] });
  const removeServer = (i: number) => save({ servers: servers.filter((_, j) => j !== i) });

  const inp = (v: string | undefined, on: (s: string) => void, ph: string, mono = true) => (
    <input
      value={v ?? ""}
      onChange={(e) => on(e.target.value)}
      placeholder={ph}
      className={`w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent ${mono ? "font-mono" : ""}`}
    />
  );

  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button
      onClick={() => set(!on)}
      className={`px-2 py-1.5 text-[11px] rounded border transition-colors ${
        on ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Title</label>
        {inp(config?.title, (title) => save({ title }), "Proxmox", false)}
      </div>

      {servers.map((s, i) => (
        <div key={i} className="rounded-lg border border-border-subtle p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Server {i + 1}</span>
            {servers.length > 1 && (
              <button onClick={() => removeServer(i)} aria-label="Remove server" className="text-text-muted hover:text-down inline-flex">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {inp(s.name, (name) => setServer(i, { name }), "Label (optional)", false)}
          {inp(s.baseUrl, (baseUrl) => setServer(i, { baseUrl }), "https://10.10.0.31:8006")}
          {inp(s.tokenId, (tokenId) => setServer(i, { tokenId }), "root@pam!axboard")}
          {inp(s.tokenSecret, (tokenSecret) => setServer(i, { tokenSecret }), "token secret")}
        </div>
      ))}

      <button
        onClick={addServer}
        className="w-full px-2 py-2 rounded border border-dashed border-border text-text-muted hover:text-text hover:border-text-muted text-[12px] transition-colors"
      >
        + Add server
      </button>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Display</label>
        <div className="grid grid-cols-3 gap-1">
          {toggle(config?.showSummary !== false, (v) => save({ showSummary: v }), "Summary")}
          {toggle(config?.showGuests !== false, (v) => save({ showGuests: v }), "Guests")}
          {toggle(config?.showStorage !== false, (v) => save({ showStorage: v }), "Storage")}
          {toggle(config?.showBackups === true, (v) => save({ showBackups: v }), "Backups")}
          {toggle(config?.compact === true, (v) => save({ compact: v }), "Compact")}
        </div>
      </div>

      <p className="text-[11px] text-text-muted leading-snug">
        Create the API token WITHOUT privilege separation (or grant the token <span className="font-mono">PVEAuditor</span> on{" "}
        <span className="font-mono">/</span>). Backups adds per-datastore lookups. Secrets stay in your config.yaml.
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
  description: "Proxmox VE — nodes, VMs/LXC and storage with live CPU / RAM / disk. Multiple servers; click to open the console.",
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
