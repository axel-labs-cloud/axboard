import { createPortal } from "react-dom";

// Keyboard-shortcuts cheat sheet, opened with `?`.

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "General",
    items: [
      ["⌘/Ctrl K", "Open the command palette"],
      ["?", "Show this cheat sheet"],
      ["Esc", "Close panel / exit edit mode"],
    ],
  },
  {
    title: "Editing",
    items: [
      ["⌘/Ctrl E", "Toggle edit mode"],
      ["⌘/Ctrl Z", "Undo"],
      ["⌘/Ctrl ⇧ Z", "Redo"],
      ["Del / ⌫", "Remove selected widget"],
      ["Arrow keys", "Nudge selected widget"],
    ],
  },
  {
    title: "Navigation",
    items: [["⌘/Ctrl 1–9", "Jump to dashboard N"]],
  },
  {
    title: "Search bangs (in ⌘K)",
    items: [
      ["g …", "Google"],
      ["!yt …", "YouTube"],
      ["gh …", "GitHub"],
      ["w …", "Wikipedia"],
    ],
  },
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-bg-elevated border border-border rounded-xl shadow-2xl ring-1 ring-white/5 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-[13px] font-semibold text-text">Keyboard shortcuts</span>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg leading-none px-1">×</button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-1.5">{g.title}</div>
              <div className="space-y-1">
                {g.items.map(([k, d]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-text-secondary">{d}</span>
                    <kbd className="shrink-0 px-1.5 py-0.5 rounded bg-bg-card border border-border-subtle font-mono text-[10px] text-text-muted whitespace-nowrap">{k}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
