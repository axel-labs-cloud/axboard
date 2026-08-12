import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import { ConfigField } from "../_fields";
import type { YouTubeConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// YouTube channel widget — recent uploads via the channel's public RSS feed
// (no API key). The feed is XML, parsed client-side.
// ---------------------------------------------------------------------------

interface Video {
  id: string;
  title: string;
  published?: string;
  thumb?: string;
}

function YouTubeComponent({ config }: WidgetProps<YouTubeConfig>) {
  const cid = config?.channelId?.trim();
  const max = config?.max ?? 6;
  const title = config?.title?.trim();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["youtube", cid],
    enabled: !!cid,
    refetchInterval: 1_800_000,
    queryFn: async (): Promise<{ channel: string; videos: Video[] }> => {
      const res = await api.fetchRaw({ url: `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cid!)}`, headers: { "User-Agent": "Mozilla/5.0 (axboard)" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
      const channel = doc.getElementsByTagName("title")[0]?.textContent ?? "YouTube";
      const videos: Video[] = Array.from(doc.getElementsByTagName("entry")).map((e) => ({
        id: e.getElementsByTagName("yt:videoId")[0]?.textContent ?? "",
        title: e.getElementsByTagName("title")[0]?.textContent ?? "",
        published: e.getElementsByTagName("published")[0]?.textContent ?? undefined,
        thumb: e.getElementsByTagName("media:thumbnail")[0]?.getAttribute("url") ?? undefined,
      }));
      return { channel, videos };
    },
  });

  if (!cid) return <EmptyState icon={PlayIcon} title="Add a channel" hint="Set a YouTube channel id (UC…) in this widget's config." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not load the channel feed."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  const videos = data.videos.slice(0, max);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={PlayIcon} title={title || data.channel} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 flex flex-col">
        <div className="space-y-1.5 my-auto w-full">
          {videos.map((v) => (
            <a key={v.id} href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer noopener" className="flex gap-2 -mx-1 px-1 py-1 rounded hover:bg-bg-hover/50">
              {v.thumb && <img src={v.thumb} alt="" className="w-20 h-11 rounded object-cover shrink-0 bg-bg-elevated" loading="lazy" />}
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-text-secondary leading-snug line-clamp-2">{v.title}</div>
                {v.published && <div className="text-[10px] font-mono text-text-muted mt-0.5">{timeAgo(v.published)}</div>}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function YouTubeConfigPanel({ config, save }: WidgetConfigProps<YouTubeConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Channel id" value={config?.channelId} onChange={(channelId) => save({ channelId })} placeholder="UCXuqSBlHAE6Xw-yeJA0Tunw" hint="from the channel URL" />
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(channel name)" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Use the channel's UC… id (View source of the channel page → "channelId", or a tool like ChannelID finder). No API key needed.</p>
    </div>
  );
}

const PlayIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="m10 9 5 3-5 3z" fill="currentColor" /></svg>
);

const definition: WidgetDefinition<YouTubeConfig> = {
  type: "youtube",
  title: "YouTube channel",
  icon: PlayIcon,
  category: "external",
  description: "Recent uploads from a YouTube channel with thumbnails (via the channel RSS).",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 10,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: {},
  Component: YouTubeComponent,
  ConfigPanel: YouTubeConfigPanel,
};

export default definition;
