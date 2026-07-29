// Reusable "pick + order + rename" list for widgets that show a chosen subset
// of items (temperatures, filesystems …). Shown items appear first in their
// order with up/down controls; available items can be added below.

export interface PickItem {
  key: string; // stable id (e.g. the raw sensor label / mount path)
  label: string; // display label
  extra?: string; // trailing hint (temp, size…)
}

function Arrow({ dir, onClick, disabled }: { dir: "up" | "down"; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-5 h-5 flex items-center justify-center rounded ${disabled ? "text-text-muted/30" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
      title={dir === "up" ? "Move up" : "Move down"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
        {dir === "up" ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
    </button>
  );
}

export function ReorderPicker({
  all,
  enabled,
  onChange,
  names,
  onRename,
}: {
  all: PickItem[];
  enabled: string[];
  onChange: (keys: string[]) => void;
  names?: Record<string, string>;
  onRename?: (key: string, value: string) => void;
}) {
  const byKey = new Map(all.map((i) => [i.key, i]));
  const shown = enabled.filter((k) => byKey.has(k));
  const available = all.filter((i) => !enabled.includes(i.key));

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= shown.length) return;
    const next = [...shown];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (key: string) => onChange(shown.filter((k) => k !== key));
  const add = (key: string) => onChange([...shown, key]);

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Shown — reorder with the arrows</label>
        {shown.length === 0 ? (
          <p className="text-[11px] text-text-muted">Nothing selected — add from below.</p>
        ) : (
          <div className="rounded border border-border-subtle divide-y divide-border-subtle">
            {shown.map((key, i) => {
              const item = byKey.get(key)!;
              return (
                <div key={key} className="flex items-center gap-1 px-1.5 py-1">
                  <div className="flex flex-col -my-1">
                    <Arrow dir="up" onClick={() => move(i, -1)} disabled={i === 0} />
                    <Arrow dir="down" onClick={() => move(i, 1)} disabled={i === shown.length - 1} />
                  </div>
                  {onRename ? (
                    <input
                      value={names?.[key] ?? ""}
                      onChange={(e) => onRename(key, e.target.value)}
                      placeholder={item.label}
                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-bg-card border border-transparent hover:border-border focus:border-accent text-[12px] text-text placeholder:text-text-muted/70 focus:outline-none"
                    />
                  ) : (
                    <span className="flex-1 min-w-0 truncate text-[12px] text-text-secondary font-mono">{item.label}</span>
                  )}
                  {item.extra && <span className="font-mono tabular-nums text-[11px] text-text-muted shrink-0">{item.extra}</span>}
                  <button onClick={() => remove(key)} className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-text-muted hover:text-down" title="Remove">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {available.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Available</label>
          <div className="flex flex-wrap gap-1.5">
            {available.map((item) => (
              <button
                key={item.key}
                onClick={() => add(item.key)}
                className="px-2 py-1 rounded border border-border text-[11px] text-text-muted hover:text-text hover:border-accent/50 transition-colors font-mono"
                title={`Add ${item.label}`}
              >
                + {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
