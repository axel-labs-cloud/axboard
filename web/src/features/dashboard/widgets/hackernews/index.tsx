import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import { KindPicker, ConfigField } from "../_fields";
import { FeedList, type FeedItem } from "../_feed";
import type { HackerNewsConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Hacker News widget — front page / Ask HN / Show HN via the Algolia API.
// ---------------------------------------------------------------------------

interface Hit {
  objectID: string;
  title: string;
  url?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
}

function HackerNewsComponent({ config }: WidgetProps<HackerNewsConfig>) {
  const kind = config?.kind ?? "front_page";
  const max = config?.max ?? 12;
  const title = config?.title?.trim() || (kind === "ask_hn" ? "Ask HN" : kind === "show_hn" ? "Show HN" : "Hacker News");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["hn", kind, max],
    refetchInterval: 600_000,
    queryFn: () => api.fetchJson<{ hits: Hit[] }>({ url: `https://hn.algolia.com/api/v1/search?tags=${kind}&hitsPerPage=${max}` }),
  });

  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Hacker News."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={5} />;

  const items: FeedItem[] = (data.hits ?? []).slice(0, max).map((h) => ({
    title: h.title,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    score: h.points,
    comments: h.num_comments,
    time: h.created_at ? timeAgo(h.created_at) : undefined,
  }));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={YIcon} title={title} />
      <FeedList items={items} />
    </div>
  );
}

function HackerNewsConfigPanel({ config, save }: WidgetConfigProps<HackerNewsConfig>) {
  return (
    <div className="space-y-3">
      <KindPicker
        label="Feed"
        value={config?.kind ?? "front_page"}
        onChange={(kind) => save({ kind })}
        options={[{ value: "front_page", label: "Front" }, { value: "ask_hn", label: "Ask" }, { value: "show_hn", label: "Show" }]}
      />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(auto)" mono={false} />
    </div>
  );
}

const YIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8l4 5 4-5M12 13v3" /></svg>
);

const definition: WidgetDefinition<HackerNewsConfig> = {
  type: "hackernews",
  title: "Hacker News",
  icon: YIcon,
  category: "external",
  description: "Hacker News front page (or Ask/Show HN) — points, comments and age.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 10,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: { kind: "front_page" },
  Component: HackerNewsComponent,
  ConfigPanel: HackerNewsConfigPanel,
};

export default definition;
