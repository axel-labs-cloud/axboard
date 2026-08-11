// Small shared form controls for widget config panels — a labelled text input
// and a segmented kind-picker — so the many service widgets don't each
// re-implement the same markup.

export function ConfigField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  mono = true,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold flex items-center gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal text-text-muted/70 font-normal">{hint}</span>}
      </label>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

export function KindPicker<T extends string>({
  value,
  options,
  onChange,
  label = "Type",
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">{label}</label>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-2 py-1.5 text-[11px] rounded border transition-colors ${
              value === o.value ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
