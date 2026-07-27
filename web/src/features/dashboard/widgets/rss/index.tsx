import { useQuery } from "@tanstack/react-query";
import type {
  FeedConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// RSS / Atom feed widget. Fetches the feed through the server proxy (to dodge
// CORS), parses it in the browser, and lists recent items.
// ---------------------------------------------------------------------------

interface FeedItem {
  title: string;
  link: string;
  date?: string;
}

function parseFeed(xmlText: string): FeedItem[] {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  const nodes = Array.from(doc.querySelectorAll("item, entry"));
  return nodes.map((el) => {
    const title = el.querySelector("title")?.textContent?.trim() ?? "(untitled)";
    // RSS uses <link>text</link>; Atom uses <link href="…"/>.
    const linkEl = el.querySelector("link");
    const link =
      linkEl?.getAttribute("href") || linkEl?.textContent?.trim() || "";
    const date =
      el.querySelector("pubDate, published, updated")?.textContent?.trim() ?? undefined;
    return { title, link, date };
  });
}

function FeedComponent({ config }: WidgetProps<FeedConfig>) {
  const url = config?.url?.trim();
  const count = config?.count ?? 8;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["rss", url],
    enabled: !!url,
    refetchInterval: 10 * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(url as string)}`);
      if (!r.ok) throw new Error(`feed fetch failed (${r.status})`);
      return parseFeed(await r.text());
    },
  });

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Set a feed URL in config.
      </div>
    );
  }
  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-text-muted text-[11px]">Loading…</div>;
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        {(error as Error)?.message ?? "Could not load feed."}
      </div>
    );
  }

  const items = data.slice(0, count);
  return (
    <div className="h-full overflow-auto p-2 divide-y divide-border-subtle">
      {items.length === 0 && (
        <div className="text-[11px] text-text-muted px-1 py-2">No items.</div>
      )}
      {items.map((it, i) => (
        <a
          key={i}
          href={it.link || undefined}
          target="_blank"
          rel="noreferrer noopener"
          className="block px-1.5 py-1.5 hover:bg-bg-hover rounded"
        >
          <div className="text-[12px] text-text-secondary leading-snug line-clamp-2">{it.title}</div>
          {it.date && (
            <div className="text-[10px] text-text-muted mt-0.5">
              {new Date(it.date).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </div>
          )}
        </a>
      ))}
    </div>
  );
}

function FeedConfigPanel({ config, save }: WidgetConfigProps<FeedConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Feed URL (RSS or Atom)
        </label>
        <input
          value={config?.url ?? ""}
          onChange={(e) => save({ url: e.target.value })}
          placeholder="https://example.com/feed.xml"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Items to show
        </label>
        <input
          type="number"
          min={1}
          max={30}
          value={config?.count ?? 8}
          onChange={(e) => save({ count: Number(e.target.value) || 8 })}
          className="w-24 px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

const FeedIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M4 11a9 9 0 0 1 9 9" />
    <path d="M4 4a16 16 0 0 1 16 16" />
    <circle cx="5" cy="19" r="1" />
  </svg>
);

const definition: WidgetDefinition<FeedConfig> = {
  type: "rss",
  title: "RSS feed",
  icon: FeedIcon,
  category: "external",
  description: "Latest items from an RSS or Atom feed (via the server proxy).",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 12,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: { count: 8 },
  Component: FeedComponent,
  ConfigPanel: FeedConfigPanel,
};

export default definition;
