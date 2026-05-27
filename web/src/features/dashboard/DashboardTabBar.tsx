import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Dashboard {
  id: string;
  name: string;
  is_default: boolean;
}

interface Props {
  dashboards: Dashboard[];
  activeId: string | null;
  editing: boolean;
  onSelect: (id: string) => void;
  onToggleEdit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onAddWidget: () => void;
  onManageServices: () => void;
  onAddDashboard: () => void;
  onRenameDashboard: (id: string, name: string) => void;
  onDeleteDashboard: (id: string) => void;
  onOpenSpotlight: () => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
}

export function DashboardTabBar({
  dashboards,
  activeId,
  editing,
  onSelect,
  onToggleEdit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
  onAddWidget,
  onManageServices,
  onAddDashboard,
  onRenameDashboard,
  onDeleteDashboard,
  onOpenSpotlight,
  theme,
  setTheme,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuButtonRef.current && !menuButtonRef.current.contains(e.target as Node)) {
        const tgt = e.target as HTMLElement;
        if (!tgt.closest("[data-general-menu]")) setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [menuOpen]);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border-subtle bg-bg-card/40 backdrop-blur-sm px-6 py-2 gap-3">
      {/* LEFT — logo + dashboard tabs */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0 select-none">
          <div className="w-5 h-5 rounded-md flex items-center justify-center bg-accent/15 ring-1 ring-accent/30">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3 text-accent"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
          </div>
          <span className="text-[12px] font-semibold tracking-wide text-text">ianua</span>
          <span className="w-px h-4 bg-border" />
        </div>
        <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
          {dashboards.map((db) => (
            <DashboardTab
              key={db.id}
              db={db}
              active={activeId === db.id}
              editing={editing}
              canDelete={editing && dashboards.length > 1}
              renaming={renamingId === db.id}
              onSelect={() => onSelect(db.id)}
              onStartRename={() => setRenamingId(db.id)}
              onCommitRename={(name) => {
                setRenamingId(null);
                if (name && name !== db.name) onRenameDashboard(db.id, name);
              }}
              onCancelRename={() => setRenamingId(null)}
              onDelete={() => onDeleteDashboard(db.id)}
            />
          ))}
          {editing && (
            <button
              onClick={onAddDashboard}
              title="New dashboard"
              className="ml-1 w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-accent/10"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* CENTER — dead-center search trigger */}
      <button
        onClick={onOpenSpotlight}
        className="w-[min(420px,90vw)] flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-subtle bg-bg-card/60 text-text-muted hover:text-text-secondary hover:border-border transition-colors"
        title="Search apps, bookmarks, the web (⌘K)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5 shrink-0"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="flex-1 text-left text-[12px] truncate">Search…</span>
        <kbd className="px-1 py-0.5 rounded bg-bg-elevated border border-border-subtle font-mono text-[10px] shrink-0">
          ⌘K
        </kbd>
      </button>

      {/* RIGHT — edit-mode actions + Done + menu */}
      <div className="flex items-center gap-1 justify-end min-w-0">
        {editing && (
          <>
            <IconButton title="Undo (⌘Z)" disabled={!canUndo} onClick={onUndo}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
              </svg>
            </IconButton>
            <IconButton title="Redo (⌘⇧Z)" disabled={!canRedo} onClick={onRedo}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 15-6.7l3 2.7" />
              </svg>
            </IconButton>
            <IconButton title="Export dashboard" onClick={onExport}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </IconButton>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={onManageServices}
              className="px-2.5 py-1 text-[12px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted flex items-center gap-1.5"
              title="Manage services and groups"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Services
            </button>
            <button
              onClick={onAddWidget}
              className="px-2.5 py-1 text-[12px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted flex items-center gap-1.5"
              title="Add widget"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Widget
            </button>
          </>
        )}
        {editing && (
          <button
            onClick={onToggleEdit}
            className="px-3 py-1 text-[12px] rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            title="Exit edit mode"
          >
            Done
          </button>
        )}
        <button
          ref={menuButtonRef}
          onClick={() => setMenuOpen((v) => !v)}
          className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
            menuOpen
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border text-text-muted hover:text-text hover:border-text-muted"
          }`}
          title="Menu"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
        {menuOpen &&
          menuPos &&
          createPortal(
            <div
              data-general-menu
              className="fixed z-[300] min-w-[220px] bg-bg-elevated border border-border rounded-lg shadow-2xl ring-1 ring-white/5 py-1"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              <MenuItem
                label={editing ? "Done editing" : "Edit dashboard"}
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                }
                onClick={() => {
                  setMenuOpen(false);
                  onToggleEdit();
                }}
              />
              <div className="my-1 border-t border-border-subtle" />
              <div className="px-3 py-1.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-1.5">
                  Theme
                </div>
                <div className="inline-flex p-0.5 rounded-md border border-border-subtle bg-bg-card w-full">
                  <ThemeButton active={theme === "dark"} onClick={() => setTheme("dark")}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3 h-3"
                    >
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                    Dark
                  </ThemeButton>
                  <ThemeButton active={theme === "light"} onClick={() => setTheme("light")}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3 h-3"
                    >
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                    Light
                  </ThemeButton>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] rounded transition-colors ${
        active
          ? "bg-bg-elevated text-text shadow-sm"
          : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function DashboardTab({
  db,
  active,
  editing,
  canDelete,
  renaming,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: {
  db: Dashboard;
  active: boolean;
  editing: boolean;
  canDelete: boolean;
  renaming: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  if (renaming) {
    return (
      <input
        ref={inputRef}
        defaultValue={db.name}
        onBlur={(e) => onCommitRename(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") onCancelRename();
        }}
        className="px-2 py-1 mx-1 text-[12px] font-medium bg-bg-card border border-accent/40 rounded text-text focus:outline-none w-32"
      />
    );
  }

  return (
    <div className="relative flex items-center group/tab">
      <button
        onClick={onSelect}
        onDoubleClick={() => editing && onStartRename()}
        title={editing ? "Double-click to rename" : undefined}
        className={`relative px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
          active ? "text-text" : "text-text-muted hover:text-text-secondary"
        }`}
      >
        {db.name}
        {active && <span className="absolute bottom-0 left-0 right-0 h-px bg-accent" />}
      </button>
      {canDelete && (
        <button
          onClick={onDelete}
          title={`Delete "${db.name}"`}
          className="w-4 h-4 mr-1 flex items-center justify-center rounded text-text-muted/50 hover:text-rose-400 hover:bg-rose-400/10 opacity-0 group-hover/tab:opacity-100"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

function MenuItem({
  label,
  shortcut,
  icon,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-secondary hover:text-text hover:bg-bg-hover transition-colors"
    >
      {icon && <span className="text-text-muted shrink-0">{icon}</span>}
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <kbd className="text-[10px] text-text-muted/70 font-mono">{shortcut}</kbd>
      )}
    </button>
  );
}

function IconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
        disabled
          ? "text-text-muted/50 cursor-not-allowed"
          : "text-text-muted hover:text-text hover:bg-bg-hover"
      }`}
    >
      {children}
    </button>
  );
}
