import type {
  NotesConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Notes widget — a free-text scratchpad persisted in config.yaml. Edited from
// the config panel (widget content is inert in edit mode); the surface renders
// the text with URLs auto-linked.
// ---------------------------------------------------------------------------

const URL_RE = /(https?:\/\/[^\s]+)/g;

function linkify(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <a
        key={i}
        href={m[0]}
        target="_blank"
        rel="noreferrer noopener"
        className="text-accent hover:underline break-all"
      >
        {m[0]}
      </a>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function NotesComponent({ config }: WidgetProps<NotesConfig>) {
  const text = config?.text ?? "";
  if (!text.trim()) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Empty note — open config to write something.
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto p-3 text-[13px] text-text-secondary whitespace-pre-wrap leading-relaxed">
      {linkify(text)}
    </div>
  );
}

function NotesConfigPanel({ config, save }: WidgetConfigProps<NotesConfig>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
        Note text
      </label>
      <textarea
        value={config?.text ?? ""}
        onChange={(e) => save({ text: e.target.value })}
        rows={8}
        placeholder="Anything — reminders, links, a todo…"
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent resize-y font-mono"
      />
      <p className="text-[11px] text-text-muted">URLs become clickable links.</p>
    </div>
  );
}

const NotesIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);

const definition: WidgetDefinition<NotesConfig> = {
  type: "notes",
  title: "Notes",
  icon: NotesIcon,
  category: "productivity",
  description: "A free-text scratchpad. URLs auto-link. Persists in config.yaml.",
  minW: 2,
  minH: 1,
  maxW: 12,
  maxH: 12,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { text: "" },
  Component: NotesComponent,
  ConfigPanel: NotesConfigPanel,
};

export default definition;
