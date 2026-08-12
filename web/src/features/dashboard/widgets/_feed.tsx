// Shared list layout for "content"/feed widgets (Reddit, Hacker News, Lobsters).
// A vertical, center-filling list of link rows with an upvote/comments/source
// meta line.

export interface FeedItem {
  title: string;
  url: string;
  score?: number;
  comments?: number;
  source?: string;
  time?: string;
}

export function FeedList({ items }: { items: FeedItem[] }) {
  return (
    <div className="flex-1 min-h-0 overflow-auto px-2.5 py-1.5 flex flex-col">
      <div className="divide-y divide-border-subtle my-auto w-full">
        {items.length === 0 && <div className="text-[11px] text-text-muted py-2 text-center">Nothing to show.</div>}
        {items.map((it, i) => (
          <a
            key={i}
            href={it.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block py-1.5 -mx-1 px-1 rounded hover:bg-bg-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <div className="text-[12px] text-text-secondary leading-snug line-clamp-2">{it.title}</div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted mt-0.5">
              {it.score != null && <span className="text-degraded">▲ {it.score.toLocaleString()}</span>}
              {it.comments != null && <span>{it.comments.toLocaleString()} comments</span>}
              {it.source && <span className="truncate">{it.source}</span>}
              {it.time && <span className="ml-auto shrink-0">{it.time}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
