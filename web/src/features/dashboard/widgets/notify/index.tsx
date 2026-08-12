import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState, StatTiles } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import { ConfigField, KindPicker } from "../_fields";
import type { NotifyConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Notifications widget — Gotify or ntfy. Gotify (X-Gotify-Key) exposes apps /
// clients / recent messages; ntfy reads a topic's cached messages (NDJSON, so
// parsed line-by-line via fetchRaw). Both render a recent-message list.
// ---------------------------------------------------------------------------

interface Msg {
  title?: string;
  message: string;
  date?: string | number; // ISO (gotify) or unix seconds (ntfy)
}
interface NotifyData {
  tiles: { label: string; value: string; color?: string }[];
  messages: Msg[];
}

const base = (u?: string) => (u ?? "").trim().replace(/\/+$/, "");

async function gotify(b: string, token: string): Promise<NotifyData> {
  const h = { "X-Gotify-Key": token };
  const [apps, clients, msgs] = await Promise.all([
    api.fetchJson<{ id: number }[]>({ url: `${b}/application`, headers: h }),
    api.fetchJson<{ id: number }[]>({ url: `${b}/client`, headers: h }).catch(() => [] as { id: number }[]),
    api.fetchJson<{ messages: { title?: string; message: string; date?: string }[] }>({ url: `${b}/message?limit=20`, headers: h }),
  ]);
  const messages = (msgs.messages ?? []).map((m) => ({ title: m.title, message: m.message, date: m.date }));
  return {
    tiles: [
      { label: "Apps", value: String(apps.length) },
      { label: "Clients", value: String(clients.length) },
      { label: "Messages", value: String(messages.length) },
    ],
    messages,
  };
}

async function ntfy(b: string, topic: string, token: string | undefined): Promise<NotifyData> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await api.fetchRaw({ url: `${b}/${encodeURIComponent(topic)}/json?poll=1&since=24h`, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const text = await res.text();
  const messages: Msg[] = text
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as { event?: string; message?: string; title?: string; time?: number };
      } catch {
        return null;
      }
    })
    .filter((m): m is { event?: string; message?: string; title?: string; time?: number } => !!m && m.event === "message")
    .map((m) => ({ title: m.title, message: m.message ?? "", date: m.time }))
    .reverse();
  return { tiles: [{ label: `Topic · ${topic}`, value: String(messages.length), color: "var(--color-accent)" }], messages };
}

function NotifyComponent({ config }: WidgetProps<NotifyConfig>) {
  const kind = config?.kind ?? "gotify";
  const b = base(config?.baseUrl);
  const token = config?.token?.trim();
  const topic = config?.topic?.trim();
  const title = config?.title?.trim() || (kind === "ntfy" ? "ntfy" : "Gotify");
  const ready = kind === "ntfy" ? !!b && !!topic : !!b && !!token;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["notify", kind, b, token, topic],
    enabled: ready,
    refetchInterval: 20_000,
    queryFn: (): Promise<NotifyData> => (kind === "ntfy" ? ntfy(b, topic!, token) : gotify(b, token!)),
  });

  if (!ready) {
    return (
      <EmptyState
        icon={BellIcon}
        title={`Connect ${title}`}
        hint={kind === "ntfy" ? "Set the base URL and a topic to read." : "Set the base URL and a client token."}
      />
    );
  }
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach the server."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={BellIcon} title={title} right={<span className="text-[11px] font-mono text-text-muted">{data.messages.length} recent</span>} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2">
       <div className="w-full space-y-2.5">
        <StatTiles tiles={data.tiles} cols={data.tiles.length} />
        <div className="divide-y divide-border-subtle">
          {data.messages.length === 0 && <div className="text-[11px] text-text-muted py-1">No recent messages.</div>}
          {data.messages.slice(0, 12).map((m, i) => (
            <div key={i} className="py-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[11.5px] text-text-secondary truncate flex-1" title={m.message}>{m.title || m.message}</span>
                {m.date != null && (
                  <span className="text-[9.5px] font-mono text-text-muted shrink-0">
                    {timeAgo(typeof m.date === "number" ? new Date(m.date * 1000) : m.date)}
                  </span>
                )}
              </div>
              {m.title && <div className="text-[10px] text-text-muted truncate">{m.message}</div>}
            </div>
          ))}
        </div>
       </div>
      </div>
    </div>
  );
}

function NotifyConfigPanel({ config, save }: WidgetConfigProps<NotifyConfig>) {
  const kind = config?.kind ?? "gotify";
  return (
    <div className="space-y-3">
      <KindPicker
        label="Server"
        value={kind}
        onChange={(k) => save({ kind: k })}
        options={[
          { value: "gotify", label: "Gotify" },
          { value: "ntfy", label: "ntfy" },
        ]}
      />
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder={kind === "ntfy" ? "https://ntfy.sh" : "http://172.24.2.100:8080"} />
      {kind === "ntfy" && <ConfigField label="Topic" value={config?.topic} onChange={(topic) => save({ topic })} placeholder="alerts" />}
      <ConfigField
        label={kind === "ntfy" ? "Access token" : "Client token"}
        value={config?.token}
        onChange={(token) => save({ token })}
        placeholder={kind === "ntfy" ? "optional (if protected)" : "Cxxxxxxxx"}
        hint={kind === "gotify" ? "Clients → create client" : undefined}
      />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder={kind === "ntfy" ? "ntfy" : "Gotify"} mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">
        {kind === "gotify" ? "Needs a Gotify client token (not an app token)." : "Reads a topic's cached messages (last 24h)."} Credentials stay in your config.yaml.
      </p>
    </div>
  );
}

const BellIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const definition: WidgetDefinition<NotifyConfig> = {
  type: "notify",
  title: "Notifications",
  icon: BellIcon,
  category: "services",
  description: "Gotify or ntfy — recent messages, plus app/client counts (Gotify) or a topic feed (ntfy).",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { kind: "gotify" },
  Component: NotifyComponent,
  ConfigPanel: NotifyConfigPanel,
};

export default definition;
