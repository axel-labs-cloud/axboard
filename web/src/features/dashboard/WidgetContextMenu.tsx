import { useEffect, useRef } from "react";

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Widget right-click context menu
// Renders at fixed (x, y) screen coordinates so the caller can drop it
// straight from a contextmenu event without worrying about overflow:hidden
// parents. Closes on outside click and on Escape.
// ---------------------------------------------------------------------------

export function WidgetContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Outside-click + Escape close
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamp inside the viewport so the menu doesn't get clipped on the right
  // or bottom edges.
  const menuW = 200;
  const menuH = items.length * 28 + 8;
  const left = Math.min(x, window.innerWidth - menuW - 8);
  const top = Math.min(y, window.innerHeight - menuH - 8);

  return (
    <div
      ref={ref}
      className="fixed z-[300] bg-bg-elevated border border-border rounded shadow-2xl py-1"
      style={{ left, top, minWidth: menuW }}
      role="menu"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-[12px] transition-colors ${
            item.danger
              ? "text-text-secondary hover:bg-danger/10 hover:text-danger"
              : "text-text-secondary hover:bg-bg-hover hover:text-text"
          }`}
          role="menuitem"
        >
          <div className="flex items-center gap-2 min-w-0">
            {item.icon && <span className="shrink-0 text-text-muted">{item.icon}</span>}
            <span className="truncate">{item.label}</span>
          </div>
          {item.shortcut && (
            <span className="text-[10px] text-text-muted font-mono shrink-0">
              {item.shortcut}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
