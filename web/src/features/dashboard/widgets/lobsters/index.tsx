import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import { ConfigField } from "../_fields";
import { FeedList, type FeedItem } from "../_feed";
import type { LobstersConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Lobsters widget — hottest stories via the public JSON feed.
// ---------------------------------------------------------------------------

interface Story {
  title: string;
  url: string;
  score: number;
  comment_count: number;
  comments_url: string;
  created_at: string;
  tags?: string[];
}

function LobstersComponent({ config }: WidgetProps<LobstersConfig>) {
  const max = config?.max ?? 12;
  const title = config?.title?.trim() || "Lobsters";

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["lobsters", max],
    refetchInterval: 600_000,
    queryFn: () => api.fetchJson<Story[]>({ url: `https://lobste.rs/hottest.json` }),
  });

  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Lobsters."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={5} />;

  const items: FeedItem[] = data.slice(0, max).map((s) => ({
    title: s.title,
    url: s.comments_url || s.url,
    score: s.score,
    comments: s.comment_count,
    source: s.tags?.slice(0, 2).join(" "),
    time: timeAgo(s.created_at),
  }));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={LobIcon} title={title} />
      <FeedList items={items} />
    </div>
  );
}

function LobstersConfigPanel({ config, save }: WidgetConfigProps<LobstersConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Lobsters" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Shows the current hottest stories from lobste.rs.</p>
    </div>
  );
}

const LobIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 3v4M7 5l2 3M17 5l-2 3M5 12a7 7 0 0 1 14 0v3a5 5 0 0 1-10 0M5 12l-2 2M19 12l2 2" /></svg>
);

const definition: WidgetDefinition<LobstersConfig> = {
  type: "lobsters",
  title: "Lobsters",
  icon: LobIcon,
  category: "external",
  description: "Lobste.rs hottest stories — score, comments, tags and age.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 10,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: {},
  Component: LobstersComponent,
  ConfigPanel: LobstersConfigPanel,
};

export default definition;
