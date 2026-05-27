import type {
  ShortcutConfig,
  ShortcutItem,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";
import { SimpleIcon } from "../../SimpleIcon";

// ---------------------------------------------------------------------------
// Bookmarks widget — list of links rendered as small icon + name rows.
// Single bookmark renders as a big centered icon (favicon-style tile).
// Multi-bookmark mode is a vertical list — small icons, labels, no grid.
// (The Apps grid widget is the icons-in-cells layout; this is the list.)
// ---------------------------------------------------------------------------

function ShortcutComponent({ config }: WidgetProps<ShortcutConfig>) {
  const sc = config?.shortcuts ?? [];

  if (sc.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted/40 gap-1.5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        <span className="text-[10px]">No bookmarks</span>
      </div>
    );
  }

  if (sc.length === 1) {
    const s = sc[0];
    return (
      <a
        href={s.url || undefined}
        target="_blank"
        rel="noreferrer noopener"
        className="flex flex-col items-center justify-center w-full h-full hover:bg-bg-hover transition-colors p-2 gap-1.5"
        title={s.label}
      >
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          {s.icon ? (
            <SimpleIcon slug={s.icon} fill />
          ) : (
            <span className="text-text-muted text-xs">?</span>
          )}
        </div>
        {s.label && (
          <span className="text-[11px] text-text-secondary truncate max-w-full">{s.label}</span>
        )}
      </a>
    );
  }

  return (
    <div className="flex flex-col w-full h-full overflow-hidden p-1.5 gap-0.5">
      {sc.map((s, i) => (
        <a
          key={i}
          href={s.url || undefined}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-hover transition-colors min-w-0 shrink-0"
          title={s.label}
        >
          <div className="w-4 h-4 shrink-0 flex items-center justify-center">
            {s.icon ? (
              <SimpleIcon slug={s.icon} fill />
            ) : (
              <span className="text-text-muted text-[10px]">?</span>
            )}
          </div>
          <span className="text-[12px] text-text-secondary truncate flex-1">
            {s.label || s.url}
          </span>
        </a>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config panel
// ---------------------------------------------------------------------------

function ShortcutConfigPanel({ config, save }: WidgetConfigProps<ShortcutConfig>) {
  const sc = config?.shortcuts ?? [];

  const update = (i: number, field: keyof ShortcutItem, value: string) => {
    const next = [...sc];
    next[i] = { ...next[i], [field]: value };
    save({ shortcuts: next });
  };
  const remove = (i: number) => save({ shortcuts: sc.filter((_, j) => j !== i) });
  const add = () => save({ shortcuts: [...sc, { label: "", url: "", icon: "" }] });

  return (
    <div className="space-y-2">
      {sc.map((s, i) => (
        <div key={i} className="p-2 rounded bg-bg border border-border-subtle space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-bg-card rounded border border-border-subtle shrink-0">
              {s.icon ? (
                <SimpleIcon slug={s.icon} size={18} />
              ) : (
                <span className="text-text-muted text-[10px]">?</span>
              )}
            </div>
            <input
              value={s.icon}
              onChange={(e) => update(i, "icon", e.target.value)}
              placeholder="Icon slug"
              className="flex-1 min-w-0 px-2 py-1 rounded bg-bg-card border border-border text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <input
              value={s.label}
              onChange={(e) => update(i, "label", e.target.value)}
              placeholder="Label"
              className="flex-1 min-w-0 px-2 py-1 rounded bg-bg-card border border-border text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => remove(i)}
              className="text-text-muted hover:text-danger text-[11px] shrink-0"
            >
              ×
            </button>
          </div>
          <input
            value={s.url}
            onChange={(e) => update(i, "url", e.target.value)}
            placeholder="https://..."
            className="w-full px-2 py-1 rounded bg-bg-card border border-border text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      ))}
      {sc.length < 16 && (
        <button
          onClick={add}
          className="w-full py-1.5 rounded border border-dashed border-accent/30 text-[12px] text-accent hover:bg-accent/5"
        >
          + Add shortcut ({sc.length}/16)
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

const ShortcutIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-5 h-5"
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const definition: WidgetDefinition<ShortcutConfig> = {
  type: "shortcut",
  title: "Bookmarks",
  icon: ShortcutIcon,
  category: "productivity",
  description: "List of links — small icon + label per row. Single bookmark renders as a big tile.",
  minW: 1,
  minH: 1,
  maxW: 4,
  maxH: 4,
  defaultW: 1,
  defaultH: 1,
  defaultConfig: { shortcuts: [] },
  Component: ShortcutComponent,
  ConfigPanel: ShortcutConfigPanel,
};

export default definition;
