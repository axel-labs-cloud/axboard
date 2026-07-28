import type {
  SectionConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Section-label widget — a heading + divider to visually organize a board.
// ---------------------------------------------------------------------------

function SectionComponent({ config }: WidgetProps<SectionConfig>) {
  const text = config?.text ?? "Section";
  const align = config?.align ?? "left";
  return (
    <div className={`h-full flex flex-col justify-center px-3 gap-1.5 ${align === "center" ? "items-center" : "items-start"}`}>
      <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-text-secondary truncate max-w-full">
        {text}
      </span>
      <div className="h-px w-full bg-gradient-to-r from-border to-transparent" />
    </div>
  );
}

function SectionConfigPanel({ config, save }: WidgetConfigProps<SectionConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Label
        </label>
        <input
          value={config?.text ?? ""}
          onChange={(e) => save({ text: e.target.value })}
          placeholder="e.g. Media"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Align
        </label>
        <div className="inline-flex p-0.5 rounded-md border border-border-subtle bg-bg-card/40">
          {(["left", "center"] as const).map((a) => (
            <button
              key={a}
              onClick={() => save({ align: a })}
              className={`px-3 py-1 text-[11px] rounded capitalize transition-colors ${
                (config?.align ?? "left") === a
                  ? "bg-bg-elevated text-text shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const SectionIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="14" y2="12" />
    <line x1="4" y1="17" x2="18" y2="17" />
  </svg>
);

const definition: WidgetDefinition<SectionConfig> = {
  type: "section",
  title: "Section label",
  icon: SectionIcon,
  category: "productivity",
  description: "A heading and divider to group widgets on a busy board.",
  minW: 2,
  minH: 1,
  maxW: 24,
  maxH: 2,
  defaultW: 4,
  defaultH: 1,
  defaultConfig: { text: "Section", align: "left" },
  Component: SectionComponent,
  ConfigPanel: SectionConfigPanel,
};

export default definition;
