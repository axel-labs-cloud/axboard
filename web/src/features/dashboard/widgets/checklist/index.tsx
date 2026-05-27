import { useRef, useState } from "react";
import type {
  ChecklistConfig,
  ChecklistItem,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Checklist widget
// Interactive todo list. All editing happens in-widget (no config panel) —
// progress bar at the top, item rows in the middle, add input at the bottom.
// Checkboxes remain interactive in normal mode (pointer-events-auto).
// ---------------------------------------------------------------------------

function ChecklistComponent({ config, save }: WidgetProps<ChecklistConfig>) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const items: ChecklistItem[] = config?.checklist ?? [];
  const done = items.filter((i) => i.done).length;

  const toggle = (i: number) =>
    save({
      checklist: items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)),
    });
  const addItem = () => {
    if (!draft.trim()) return;
    save({ checklist: [...items, { text: draft.trim(), done: false }] });
    setDraft("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const remove = (i: number) =>
    save({ checklist: items.filter((_, j) => j !== i) });

  return (
    <div className="flex flex-col w-full h-full pointer-events-auto">
      {/* Progress */}
      {items.length > 0 && (
        <div className="px-3 pt-2 pb-1 shrink-0">
          <div className="flex items-center justify-between text-[10px] text-text-muted font-mono mb-0.5">
            <span>
              {done}/{items.length}
            </span>
            <span>{Math.round((done / items.length) * 100)}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-auto px-3 py-1 min-h-0">
        {items.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px]">
            No items yet
          </div>
        )}
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 py-1.5 group min-h-[22px] border-b border-white/[0.04] last:border-b-0"
          >
            <button
              onClick={() => toggle(i)}
              className={`w-[18px] h-[18px] rounded-sm border-2 flex items-center justify-center shrink-0 transition-all ${
                item.done
                  ? "bg-accent border-accent"
                  : "border-[#555] hover:border-accent"
              }`}
            >
              {item.done && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3 h-3 text-white"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <span
              className={`text-[13px] leading-[18px] flex-1 min-w-0 ${
                item.done ? "text-text-muted" : "text-text"
              }`}
            >
              {/* Inline-block wrapper so the custom strikethrough only spans
                  the text glyphs, not the empty flex-1 space to the right. */}
              <span className="relative inline-block align-middle max-w-full break-words">
                {item.text}
                {item.done && (
                  <span
                    aria-hidden
                    // Geometric middle of the text box. Native `line-through`
                    // sits at the font's x-height which looks too low on
                    // all-caps text — this stays centered visually regardless
                    // of letter case.
                    className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-current"
                  />
                )}
              </span>
            </span>
            <button
              onClick={() => remove(i)}
              className="text-[10px] text-transparent group-hover:text-text-muted hover:!text-danger transition-colors shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-3 py-1.5 border-t border-border-subtle shrink-0">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
            placeholder="New item..."
            className="flex-1 min-w-0 px-2 py-1 rounded bg-bg border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={addItem}
            className="w-7 h-7 flex items-center justify-center rounded bg-accent/10 text-accent hover:bg-accent hover:text-white active:bg-accent-hover transition-colors shrink-0 cursor-pointer"
            title="Add item"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

const ChecklistIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-5 h-5"
  >
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const definition: WidgetDefinition<ChecklistConfig> = {
  type: "checklist",
  title: "Checklist",
  icon: ChecklistIcon,
  category: "productivity",
  description: "Interactive todo list with progress bar.",
  minW: 2,
  minH: 4,
  maxW: 6,
  maxH: 6,
  defaultW: 4,
  defaultH: 6,
  defaultConfig: { checklist: [] },
  Component: ChecklistComponent,
  // No ConfigPanel — all editing is in-widget
};

export default definition;
