import { useEffect, useRef, useState } from "react";
import type {
  NotesConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Notes widget — a free-text scratchpad persisted in config.yaml. Edited
// directly in the widget (no edit mode needed, like the checklist); writes are
// debounced so we don't PUT config on every keystroke. Optionally renders the
// body as Markdown (click the rendered view to edit).
// ---------------------------------------------------------------------------

// Inline: `code`, **bold**, *italic*, [text](url).
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={i} className="px-1 rounded bg-bg-elevated font-mono text-[12px]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={i} className="text-text font-semibold">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={i}>{tok.slice(1, -1)}</em>);
    else {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      out.push(<a key={i} href={mm[2]} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline break-all">{mm[1]}</a>);
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Block-level markdown: headings, checkboxes, bullets, paragraphs.
function renderMarkdown(text: string): React.ReactNode {
  return text.split("\n").map((line, i) => {
    if (/^###\s/.test(line)) return <h3 key={i} className="text-[13px] font-semibold text-text mt-2 mb-0.5">{inline(line.replace(/^###\s/, ""))}</h3>;
    if (/^##\s/.test(line)) return <h2 key={i} className="text-[15px] font-semibold text-text mt-2 mb-0.5">{inline(line.replace(/^##\s/, ""))}</h2>;
    if (/^#\s/.test(line)) return <h1 key={i} className="text-[17px] font-bold text-text mt-2 mb-1">{inline(line.replace(/^#\s/, ""))}</h1>;
    const cb = /^- \[([ xX])\]\s(.*)$/.exec(line);
    if (cb) {
      const done = cb[1] !== " ";
      return (
        <div key={i} className="flex items-start gap-2 my-0.5">
          <input type="checkbox" checked={done} readOnly className="accent-accent mt-0.5 pointer-events-none" />
          <span className={done ? "line-through text-text-muted" : ""}>{inline(cb[2])}</span>
        </div>
      );
    }
    if (/^[-*]\s/.test(line)) return <div key={i} className="flex gap-2 my-0.5"><span className="text-text-muted">•</span><span>{inline(line.replace(/^[-*]\s/, ""))}</span></div>;
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return <div key={i}>{inline(line)}</div>;
  });
}

function NotesComponent({ config, save }: WidgetProps<NotesConfig>) {
  const [val, setVal] = useState(config?.text ?? "");
  const [title, setTitle] = useState(config?.title ?? "");
  const tText = useRef<number | null>(null);
  const tTitle = useRef<number | null>(null);

  // Reflect external edits (hand-edited config.yaml, restore) when we're not
  // mid-type — a pending debounce means the local value is the source of truth.
  useEffect(() => {
    if (tText.current == null) setVal(config?.text ?? "");
  }, [config?.text]);
  useEffect(() => {
    if (tTitle.current == null) setTitle(config?.title ?? "");
  }, [config?.title]);

  const onText = (t: string) => {
    setVal(t);
    if (tText.current) clearTimeout(tText.current);
    tText.current = window.setTimeout(() => {
      tText.current = null;
      save({ text: t });
    }, 500);
  };
  const onTitle = (t: string) => {
    setTitle(t);
    if (tTitle.current) clearTimeout(tTitle.current);
    tTitle.current = window.setTimeout(() => {
      tTitle.current = null;
      save({ title: t });
    }, 500);
  };

  const markdown = config?.markdown ?? false;
  const [editingBody, setEditingBody] = useState(false);
  const showRendered = markdown && !editingBody;

  return (
    <div className="h-full flex flex-col">
      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder="Title…"
        spellCheck={false}
        className="shrink-0 bg-transparent px-3 pt-2.5 pb-1.5 text-[12px] font-semibold text-text focus:outline-none placeholder:text-text-muted/40 border-b border-border-subtle/60"
      />
      {showRendered ? (
        <div
          onClick={() => setEditingBody(true)}
          className="flex-1 min-h-0 overflow-auto px-3 py-2.5 text-[13px] text-text-secondary leading-relaxed cursor-text"
          title="Click to edit"
        >
          {val.trim() ? renderMarkdown(val) : <span className="text-text-muted/40">Click to write Markdown…</span>}
        </div>
      ) : (
        <textarea
          value={val}
          onChange={(e) => onText(e.target.value)}
          onBlur={() => markdown && setEditingBody(false)}
          autoFocus={markdown && editingBody}
          placeholder="Write anything — reminders, links, a todo…"
          spellCheck={false}
          className="flex-1 min-h-0 w-full resize-none bg-transparent px-3 py-2.5 text-[13px] text-text-secondary leading-relaxed focus:outline-none placeholder:text-text-muted/50"
        />
      )}
    </div>
  );
}

function NotesConfigPanel({ config, save }: WidgetConfigProps<NotesConfig>) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
        <input
          type="checkbox"
          checked={config?.markdown ?? false}
          onChange={(e) => save({ markdown: e.target.checked })}
          className="accent-accent"
        />
        Render as Markdown
      </label>
      <p className="text-[11px] text-text-muted leading-snug">
        Supports <span className="font-mono"># headings</span>, <span className="font-mono">**bold**</span>,
        <span className="font-mono"> *italic*</span>, <span className="font-mono">`code`</span>, links,
        <span className="font-mono"> - bullets</span> and <span className="font-mono">- [ ] checkboxes</span>.
        Click the note to edit.
      </p>
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
