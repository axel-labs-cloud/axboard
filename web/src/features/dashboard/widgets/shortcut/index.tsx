import type {
  ShortcutConfig,
  ShortcutItem,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";
import { SimpleIcon } from "../../SimpleIcon";

// ---------------------------------------------------------------------------
// Shortcut widget
// Grid of clickable brand-icon links. The icon grid resolution is
// `(w*2) cols × (h*2) rows`, so 2 icons per grid unit in each direction.
// 1×1 = 4 slots, 2×2 = 16 slots. A single shortcut renders as a big centered
// icon regardless of widget size.
// ---------------------------------------------------------------------------

function ShortcutComponent({ config, w, h }: WidgetProps<ShortcutConfig>) {
  const sc = config?.shortcuts ?? [];

  // Empty state — placeholder icon, low opacity
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
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="text-[10px]">No shortcuts</span>
      </div>
    );
  }

  // Single shortcut → one big centered icon
  if (sc.length === 1) {
    const s = sc[0];
    const size = Math.min(w, h) >= 2 ? 72 : 48;
    return (
      <div
        onClick={() => s.url && window.open(s.url, "_blank", "noopener")}
        className="flex items-center justify-center w-full h-full hover:bg-bg-hover transition-colors cursor-pointer"
        title={s.label}
      >
        {s.icon ? (
          <SimpleIcon slug={s.icon} size={size} />
        ) : (
          <span className="text-text-muted text-xs">?</span>
        )}
      </div>
    );
  }

  // Grid: 2 icons per grid unit in each direction. Fixed icon sizes,
  // tuned so the icons read clearly without overwhelming the slot.
  const gridCols = w * 2;
  const gridRows = h * 2;
  const maxSlots = gridCols * gridRows;
  const visible = sc.slice(0, maxSlots);
  const area = w * h;
  const iconSize = area >= 4 ? 36 : area >= 2 ? 32 : 28;

  return (
    <div
      className="grid w-full h-full p-1"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: maxSlots }).map((_, i) => {
        const s = visible[i];
        if (!s?.icon) return <div key={i} />;
        return (
          <div
            key={i}
            onClick={() => s.url && window.open(s.url, "_blank", "noopener")}
            className="flex items-center justify-center hover:bg-bg-hover rounded transition-colors cursor-pointer min-w-0 min-h-0"
            title={s.label}
          >
            <SimpleIcon slug={s.icon} size={iconSize} />
          </div>
        );
      })}
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
  title: "Shortcuts",
  icon: ShortcutIcon,
  category: "productivity",
  description: "Grid of brand-icon links. Up to 16 in a 2×2 widget.",
  minW: 1,
  minH: 1,
  maxW: 2,
  maxH: 2,
  defaultW: 1,
  defaultH: 1,
  defaultConfig: { shortcuts: [] },
  Component: ShortcutComponent,
  ConfigPanel: ShortcutConfigPanel,
};

export default definition;
