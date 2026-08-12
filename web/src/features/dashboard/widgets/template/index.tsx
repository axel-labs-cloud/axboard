import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { timeAgo } from "../../../../lib/time";
import { ConfigField } from "../_fields";
import type { TemplateConfig, TemplateRequest, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Template widget — fetch one or more JSON APIs and render them with a small JS
// template that returns an HTML string. The template runs client-side (like the
// custom-CSS feature: it's your own config, one trust boundary) and gets `data`
// (single request) / `results` (by name) plus helpers `h`. Output is styled
// with the theme-aware `.tw` utility classes (see index.css).
// ---------------------------------------------------------------------------

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const helpers = {
  esc,
  num: (n: unknown, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d }),
  relTime: (t: unknown) => timeAgo(typeof t === "number" ? new Date(t * 1000) : (t as string)),
  get: (obj: unknown, path: string, dflt?: unknown) =>
    path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj) ?? dflt,
  bar: (pct: number, color?: string) =>
    `<div class="tw-bar"><div style="width:${Math.max(0, Math.min(100, pct))}%;background:${color || "var(--color-accent)"}"></div></div>`,
};

function parseHeaders(s?: string): Record<string, string> {
  const out: Record<string, string> = {};
  (s ?? "").split("\n").forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return out;
}

function TemplateComponent({ config }: WidgetProps<TemplateConfig>) {
  const reqs = (config?.requests ?? []).filter((r) => r.url?.trim());
  const tpl = config?.template ?? "";
  const title = config?.title?.trim() || "Template";

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["template", reqs.map((r) => `${r.name}|${r.url}`).join("~")],
    enabled: reqs.length > 0,
    refetchInterval: Math.max(5, config?.refreshSec ?? 60) * 1000,
    queryFn: async () => {
      const entries = await Promise.all(
        reqs.map(async (r, i) => {
          const val = await api.fetchJson({ url: r.url!.trim(), method: r.method || "GET", headers: parseHeaders(r.headers), body: r.body || undefined });
          return [r.name?.trim() || `req${i + 1}`, val] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, unknown>;
    },
  });

  // Compile + run the template (memoised on the template + fetched data).
  const rendered = useMemo(() => {
    if (!data || !tpl.trim()) return { html: "", err: "" };
    try {
      const keys = Object.keys(data);
      const single = keys.length === 1 ? data[keys[0]] : data;
      // eslint-disable-next-line no-new-func
      const fn = new Function("data", "results", "h", `"use strict";\n${tpl}`);
      const html = fn(single, data, helpers);
      return { html: typeof html === "string" ? html : String(html ?? ""), err: "" };
    } catch (e) {
      return { html: "", err: (e as Error).message };
    }
  }, [data, tpl]);

  if (reqs.length === 0 || !tpl.trim()) {
    return <EmptyState icon={CodeIcon} title="Build a template" hint="Add a request (JSON URL) and a template that returns HTML in this widget's config." />;
  }
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Request failed."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={4} />;
  if (rendered.err) return <ErrorState message={`Template error: ${rendered.err}`} onRetry={() => refetch()} />;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader icon={CodeIcon} title={title} />
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 tw" dangerouslySetInnerHTML={{ __html: rendered.html }} />
    </div>
  );
}

function TemplateConfigPanel({ config, save }: WidgetConfigProps<TemplateConfig>) {
  const reqs = config?.requests ?? [{}];
  const setReq = (i: number, patch: Partial<TemplateRequest>) => save({ requests: reqs.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addReq = () => save({ requests: [...reqs, {}] });
  const removeReq = (i: number) => save({ requests: reqs.filter((_, j) => j !== i) });

  return (
    <div className="space-y-3">
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="Template" mono={false} />

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Requests</label>
        {reqs.map((r, i) => (
          <div key={i} className="rounded-lg border border-border-subtle p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input value={r.name ?? ""} onChange={(e) => setReq(i, { name: e.target.value })} placeholder={`req${i + 1}`} className="w-24 px-1.5 py-1 rounded bg-bg-elevated border border-border text-[11.5px] text-text font-mono focus:outline-none focus:border-accent" />
              <span className="text-[10px] text-text-muted">= variable</span>
              {reqs.length > 1 && <button onClick={() => removeReq(i)} className="ml-auto text-text-muted hover:text-down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
            </div>
            <input value={r.url ?? ""} onChange={(e) => setReq(i, { url: e.target.value })} placeholder="https://api.example.com/data.json" className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent" />
            <input value={r.headers ?? ""} onChange={(e) => setReq(i, { headers: e.target.value })} placeholder="Authorization: Bearer …  (one per line)" className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[11px] text-text font-mono focus:outline-none focus:border-accent" />
          </div>
        ))}
        <button onClick={addReq} className="w-full px-2 py-1.5 rounded border border-dashed border-border text-text-muted hover:text-text text-[12px]">+ Add request</button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Template (returns HTML)</label>
        <textarea
          value={config?.template ?? ""}
          onChange={(e) => save({ template: e.target.value })}
          rows={9}
          spellCheck={false}
          placeholder={"// data = single request; results = { name: json }; h = helpers\nreturn data.items.slice(0,5).map(x =>\n  `<div class=\"row\"><span>${h.esc(x.title)}</span>` +\n  `<span class=\"muted\" style=\"margin-left:auto\">${h.num(x.value)}</span></div>`\n).join('');"}
          className="w-full px-2 py-1.5 rounded bg-bg-elevated border border-border text-[11px] text-text font-mono focus:outline-none focus:border-accent resize-y"
        />
        <p className="text-[10px] text-text-muted leading-snug">
          Return an HTML string. Vars: <span className="font-mono">data</span>, <span className="font-mono">results</span>, helpers{" "}
          <span className="font-mono">h.esc/num/relTime/get/bar</span>. Style with classes <span className="font-mono">row / muted / big / label / grid</span> or <span className="font-mono">var(--color-*)</span>. Runs in your browser — your own config.
        </p>
      </div>

      <ConfigField label="Refresh (seconds)" value={String(config?.refreshSec ?? 60)} onChange={(v) => save({ refreshSec: Math.max(5, parseInt(v) || 60) })} placeholder="60" />
    </div>
  );
}

const CodeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m8 16-4-4 4-4M16 8l4 4-4 4M14 4l-4 16" /></svg>
);

const definition: WidgetDefinition<TemplateConfig> = {
  type: "template",
  title: "Template (advanced)",
  icon: CodeIcon,
  category: "external",
  description: "Fetch any JSON API(s) and render them with a small JS template that returns HTML.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 12,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: {},
  Component: TemplateComponent,
  ConfigPanel: TemplateConfigPanel,
};

export default definition;
