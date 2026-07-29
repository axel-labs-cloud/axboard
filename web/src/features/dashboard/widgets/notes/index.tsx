import { useEffect, useRef, useState } from "react";
import type { NotesConfig, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Notes widget — a free-text scratchpad persisted in config.yaml. Edited
// directly in the widget (no edit mode needed, like the checklist); writes are
// debounced so we don't PUT config on every keystroke.
// ---------------------------------------------------------------------------

function NotesComponent({ config, save }: WidgetProps<NotesConfig>) {
  const [val, setVal] = useState(config?.text ?? "");
  const timer = useRef<number | null>(null);

  // Reflect external edits (hand-edited config.yaml, restore) when we're not
  // mid-type — a pending debounce means the local value is the source of truth.
  useEffect(() => {
    if (timer.current == null) setVal(config?.text ?? "");
  }, [config?.text]);

  const onChange = (t: string) => {
    setVal(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      save({ text: t });
    }, 500);
  };

  return (
    <textarea
      value={val}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write anything — reminders, links, a todo…"
      spellCheck={false}
      className="h-full w-full resize-none bg-transparent p-3 text-[13px] text-text-secondary leading-relaxed focus:outline-none placeholder:text-text-muted/50"
    />
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
};

export default definition;
