// Shimmer placeholders for widgets that fetch, so loading reads as "content on
// the way" instead of a bare spinner. Uses the .skeleton class from index.css.

export function SkeletonLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="h-full p-3 flex flex-col gap-2.5 justify-center">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="skeleton h-3" style={{ width: `${88 - ((i * 17) % 30)}%` }} />
          <div className="skeleton h-2 opacity-60" style={{ width: `${40 - ((i * 7) % 18)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock() {
  return (
    <div className="h-full p-3 flex flex-col gap-3 justify-center">
      <div className="skeleton h-8 w-2/3" />
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-4/5" />
    </div>
  );
}
