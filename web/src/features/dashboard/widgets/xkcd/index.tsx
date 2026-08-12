import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import type { XkcdConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// XKCD widget — the latest comic (ambient). Uses the public info.0.json.
// ---------------------------------------------------------------------------

interface Comic {
  num: number;
  title: string;
  img: string;
  alt: string;
}

function XkcdComponent({ config }: WidgetProps<XkcdConfig>) {
  const title = config?.title?.trim() || "XKCD";
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["xkcd"],
    refetchInterval: 3_600_000,
    queryFn: () => api.fetchJson<Comic>({ url: `https://xkcd.com/info.0.json` }),
  });

  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach XKCD."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={3} />;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={ComicIcon} title={title} right={<a href={`https://xkcd.com/${data.num}`} target="_blank" rel="noreferrer noopener" className="text-[11px] font-mono text-text-muted hover:text-accent">#{data.num}</a>} />
      <div className="flex-1 min-h-0 overflow-auto p-2 flex flex-col items-center justify-center gap-1.5">
        <div className="text-[11px] text-text-secondary text-center">{data.title}</div>
        <img src={data.img} alt={data.alt} title={data.alt} className="max-w-full max-h-full object-contain bg-white rounded" loading="lazy" />
      </div>
    </div>
  );
}

function XkcdConfigPanel({ config, save }: WidgetConfigProps<XkcdConfig>) {
  return (
    <div className="space-y-3">
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="XKCD" mono={false} />
      <p className="text-[11px] text-text-muted leading-snug">Shows the latest XKCD comic. Hover the image for the alt-text.</p>
    </div>
  );
}

const ComicIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h.01M12 9h4M8 13h8" /></svg>
);

const definition: WidgetDefinition<XkcdConfig> = {
  type: "xkcd",
  title: "XKCD",
  icon: ComicIcon,
  category: "external",
  description: "The latest XKCD comic, with the alt-text on hover.",
  minW: 2,
  minH: 3,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: {},
  Component: XkcdComponent,
  ConfigPanel: XkcdConfigPanel,
};

export default definition;
