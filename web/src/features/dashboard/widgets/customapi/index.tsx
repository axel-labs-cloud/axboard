import { useQuery } from "@tanstack/react-query";
import { SkeletonLines } from "../../../../components/Skeleton";
import { useSize } from "../useSize";
import type {
  CustomApiConfig,
  CustomApiField,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Custom-API widget — fetch any JSON endpoint (through the proxy) and render a
// few fields picked by dot/bracket path (e.g. "data.queue", "items[0].name").
// One generic widget that covers endless integrations without bespoke code.
// ---------------------------------------------------------------------------

function getPath(obj: unknown, path: string): unknown {
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return Array.isArray(v) ? `${v.length} items` : "{…}";
  return String(v);
}

function CustomApiComponent({ config }: WidgetProps<CustomApiConfig>) {
  const url = config?.url?.trim();
  const fields = config?.fields ?? [];
  const box = useSize<HTMLDivElement>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["customapi", url],
    enabled: !!url,
    refetchInterval: Math.max(1, config?.refreshMin ?? 5) * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(url as string)}`);
      if (!r.ok) throw new Error(`fetch failed (${r.status})`);
      return r.json();
    },
  });

  if (!url) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Set a JSON endpoint + fields in config.
      </div>
    );
  }
  if (isLoading) {
    return (
      <div ref={box.ref} className="h-full">
        <SkeletonLines rows={Math.max(2, fields.length)} />
      </div>
    );
  }
  if (isError) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        {(error as Error)?.message ?? "Request failed."}
      </div>
    );
  }

  // Columns scale with width; values grow when there's vertical room and few fields.
  const cols = box.w >= 460 ? 4 : box.w >= 320 ? 3 : box.w >= 188 ? 2 : 1;
  const bigVal = box.h >= 150 && fields.length <= 4;

  return (
    <div ref={box.ref} className="h-full flex flex-col p-3 gap-2 overflow-auto">
      {config?.title && (
        <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-semibold shrink-0">
          {config.title}
        </div>
      )}
      {fields.length === 0 ? (
        <div className="text-[11px] text-text-muted">Add fields in config (label + JSON path).</div>
      ) : (
        <div className="flex-1 grid gap-2 content-start" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {fields.map((f, i) => (
            <div key={i} className="rounded-md bg-bg-card/40 px-2.5 py-2 min-w-0">
              <div className="text-[10px] text-text-muted truncate">{f.label}</div>
              <div className={`${bigVal ? "text-[22px]" : "text-[15px]"} font-mono tabular-nums text-text truncate leading-tight`}>
                {fmt(getPath(data, f.path))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomApiConfigPanel({ config, save }: WidgetConfigProps<CustomApiConfig>) {
  const fields = config?.fields ?? [];
  const setFields = (next: CustomApiField[]) => save({ fields: next });
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Title (optional)
        </label>
        <input
          value={config?.title ?? ""}
          onChange={(e) => save({ title: e.target.value })}
          placeholder="e.g. Sonarr"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          JSON endpoint
        </label>
        <input
          value={config?.url ?? ""}
          onChange={(e) => save({ url: e.target.value })}
          placeholder="https://host/api/v3/queue?apikey=…"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
            Fields (label · path)
          </label>
          <button
            onClick={() => setFields([...fields, { label: "", path: "" }])}
            className="text-[11px] text-accent hover:underline"
          >
            + Add
          </button>
        </div>
        {fields.map((f, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              value={f.label}
              onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              placeholder="Queue"
              className="w-24 px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text focus:outline-none focus:border-accent"
            />
            <input
              value={f.path}
              onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))}
              placeholder="totalRecords"
              className="flex-1 min-w-0 px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text focus:outline-none focus:border-accent font-mono"
            />
            <button
              onClick={() => setFields(fields.filter((_, j) => j !== i))}
              aria-label="Remove field"
              className="w-7 shrink-0 flex items-center justify-center rounded text-text-muted hover:text-danger"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <p className="text-[10.5px] text-text-muted leading-snug">
          Path uses dots/brackets: <span className="font-mono">data.queue</span>,{" "}
          <span className="font-mono">items[0].name</span>.
        </p>
      </div>
    </div>
  );
}

const ApiIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const definition: WidgetDefinition<CustomApiConfig> = {
  type: "customapi",
  title: "Custom API",
  icon: ApiIcon,
  category: "external",
  description: "Render fields from any JSON endpoint — map paths to labeled stats.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 8,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: { fields: [] },
  Component: CustomApiComponent,
  ConfigPanel: CustomApiConfigPanel,
};

export default definition;
