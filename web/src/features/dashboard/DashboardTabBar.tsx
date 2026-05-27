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
}: Props) {
  return (
    <div className="flex items-center border-b border-border-subtle bg-bg-card/40 backdrop-blur-sm px-6 py-2 gap-3">
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
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
        {dashboards.map((db) => (
          <button
            key={db.id}
            onClick={() => onSelect(db.id)}
            className={`relative px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
              activeId === db.id
                ? "text-text"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {db.name}
            {activeId === db.id && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 shrink-0">
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
            <div className="w-px h-4 bg-bg-hover mx-1" />
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
        <button
          onClick={onToggleEdit}
          className={`px-3 py-1 text-[12px] rounded border transition-colors ${
            editing
              ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
              : "border-border text-text-secondary hover:text-text hover:border-text-muted"
          }`}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>
    </div>
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
