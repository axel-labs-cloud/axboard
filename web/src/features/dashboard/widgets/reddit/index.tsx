import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import { ConfigField, KindPicker } from "../_fields";
import { FeedList, type FeedItem } from "../_feed";
import type { RedditConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Reddit widget — top posts from a subreddit via the public JSON endpoint.
// ---------------------------------------------------------------------------

interface Post {
  data: { title: string; score: number; num_comments: number; permalink: string; url: string; subreddit_name_prefixed?: string; created_utc: number; stickied?: boolean };
}

function RedditComponent({ config }: WidgetProps<RedditConfig>) {
  const sub = (config?.subreddit ?? "").replace(/^r\//i, "").trim();
  const sort = config?.sort ?? "hot";
  const max = config?.max ?? 12;
  const title = config?.title?.trim() || (sub ? `r/${sub}` : "Reddit");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reddit", sub, sort, max],
    enabled: !!sub,
    refetchInterval: 600_000,
    queryFn: () => api.fetchJson<{ data: { children: Post[] } }>({ url: `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sort}.json?limit=${max}&raw_json=1`, headers: { "User-Agent": "axboard/1.0 (self-hosted dashboard)" } }),
  });

  if (!sub) return <EmptyState icon={RedditIcon} title="Pick a subreddit" hint="Set a subreddit (e.g. selfhosted) in this widget's config." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Reddit (it may be rate-limiting)."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={5} />;

  const items: FeedItem[] = (data.data.children ?? [])
    .filter((p) => !p.data.stickied)
    .slice(0, max)
    .map((p) => ({
      title: p.data.title,
      url: `https://www.reddit.com${p.data.permalink}`,
      score: p.data.score,
      comments: p.data.num_comments,
      time: timeAgo(new Date(p.data.created_utc * 1000)),
    }));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={RedditIcon} title={title} />
      <FeedList items={items} />
    </div>
  );
}

function RedditConfigPanel({ config, save }: WidgetConfigProps<RedditConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Subreddit" value={config?.subreddit} onChange={(subreddit) => save({ subreddit })} placeholder="selfhosted" />
      <KindPicker label="Sort" value={(config?.sort ?? "hot") as "hot" | "new" | "top" | "rising"} onChange={(sort) => save({ sort })} options={[{ value: "hot", label: "Hot" }, { value: "new", label: "New" }, { value: "top", label: "Top" }, { value: "rising", label: "Rising" }]} />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(auto)" mono={false} />
    </div>
  );
}

const RedditIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="13" r="8" /><circle cx="8.5" cy="12.5" r="1" fill="currentColor" /><circle cx="15.5" cy="12.5" r="1" fill="currentColor" /><path d="M9 16s1.2 1 3 1 3-1 3-1M18 7a2 2 0 1 0-1.5 3.3M15 5l1-2 3 1" /></svg>
);

const definition: WidgetDefinition<RedditConfig> = {
  type: "reddit",
  title: "Reddit",
  icon: RedditIcon,
  category: "external",
  description: "Top posts from a subreddit — score, comments and age, linking to the thread.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 10,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: { sort: "hot" },
  Component: RedditComponent,
  ConfigPanel: RedditConfigPanel,
};

export default definition;
