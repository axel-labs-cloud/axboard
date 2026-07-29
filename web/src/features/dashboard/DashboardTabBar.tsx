import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { AppDef, BackgroundDef, HeaderDef } from "../../api/types";
import { barStyleClass } from "./appearance";
import { HeaderWidgets } from "./HeaderWidgets";
import { AppearancePanel } from "./AppearancePanel";

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
  onCopyDashboard: () => void;
  copiedShare: boolean;
  onImportFile: (file: File) => void;
  onBackup: () => void;
  onRestoreFile: (file: File) => void;
  activeAccent?: string;
  onSetAccent: (color: string) => void;
  background?: BackgroundDef;
  onSetBackground: (bg: BackgroundDef | undefined) => void;
  barStyle?: string;
  onSetBarStyle: (style: string) => void;
  header?: HeaderDef;
  onSetHeader: (header: HeaderDef | undefined) => void;
  apps: AppDef[];
  onReorderDashboards: (fromId: string, toId: string) => void;
  onEditConfig: () => void;
  onNewFromTemplate: () => void;
  alertsEnabled: boolean;
  onToggleAlerts: () => void;
  onEnterKiosk: () => void;
  density: string;
  onSetDensity: (d: string) => void;
  onAddWidget: () => void;
  onManageServices: () => void;
  onAddDashboard: () => void;
  onRenameDashboard: (id: string, name: string) => void;
  onDeleteDashboard: (id: string) => void;
  onOpenSpotlight: () => void;
  onOpenAlerts: () => void;
  theme: string;
  setTheme: (t: string) => void;
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
  onCopyDashboard,
  copiedShare,
  onImportFile,
  onBackup,
  onRestoreFile,
  activeAccent,
  onSetAccent,
  background,
  onSetBackground,
  barStyle,
  onSetBarStyle,
  header,
  onSetHeader,
  apps,
  onReorderDashboards,
  onEditConfig,
  onNewFromTemplate,
  alertsEnabled,
  onToggleAlerts,
  onEnterKiosk,
  density,
  onSetDensity,
  onAddWidget,
  onManageServices,
  onAddDashboard,
  onRenameDashboard,
  onDeleteDashboard,
  onOpenSpotlight,
  onOpenAlerts,
  theme,
  setTheme,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const versionQ = useQuery({ queryKey: ["version"], queryFn: api.getVersion, staleTime: Infinity });
  const authQ = useQuery({ queryKey: ["auth"], queryFn: api.getAuth, staleTime: 10_000 });

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
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center px-6 py-2 gap-3 ${barStyleClass(barStyle)}`}>
      {/* LEFT — logo + dashboard tabs */}
      <div className="flex items-center gap-3 min-w-0">
        {(!header?.hideLogo || !header?.hideName) && (
          <div className="flex items-center gap-2 shrink-0 select-none">
            {!header?.hideLogo &&
              (header?.brandLogo ? (
                <img src={header.brandLogo} alt="" className="w-5 h-5 rounded object-contain" />
              ) : (
                <svg viewBox="0 0 64 64" className="w-5 h-5" aria-hidden>
                  <defs>
                    <linearGradient id="axboard-logo-g" x1="14" y1="48" x2="50" y2="16" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#22d3ee" />
                      <stop offset="0.5" stopColor="#6366f1" />
                      <stop offset="1" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                  <rect x="0.5" y="0.5" width="63" height="63" rx="14" fill="#13151f" stroke="rgba(255,255,255,0.07)" />
                  <circle cx="18" cy="44" r="6.2" fill="url(#axboard-logo-g)" />
                  <circle cx="32" cy="32" r="6.2" fill="url(#axboard-logo-g)" />
                  <circle cx="46" cy="20" r="6.2" fill="url(#axboard-logo-g)" />
                </svg>
              ))}
            {!header?.hideName && (
              <span className="text-[12px] font-semibold tracking-wide text-text">{header?.brandText || "axboard"}</span>
            )}
            <span className="w-px h-4 bg-border" />
          </div>
        )}
        <div
          className="flex items-center gap-0.5 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
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
              onDropTab={(fromId) => onReorderDashboards(fromId, db.id)}
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
          {editing && (
            <>
              <span className="w-px h-4 bg-border mx-1 shrink-0" />
              <label
                className="relative w-6 h-6 shrink-0 flex items-center justify-center rounded cursor-pointer hover:bg-bg-hover"
                title="This dashboard's accent color"
              >
                <span
                  className="w-3 h-3 rounded-full ring-1 ring-white/20"
                  style={{ background: activeAccent || "var(--color-accent)" }}
                />
                <input
                  type="color"
                  value={activeAccent || "#818cf8"}
                  onChange={(e) => onSetAccent(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              {activeAccent && (
                <button
                  onClick={() => onSetAccent("")}
                  title="Reset accent to theme default"
                  className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-text-muted hover:text-text"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* CENTER — dead-center search trigger */}
      {header?.hideSearch ? (
        <div />
      ) : (
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
      )}

      {/* RIGHT — header widgets + edit-mode actions + Done + menu */}
      <div className="flex items-center gap-2 justify-end min-w-0">
        {/* homepage-style header widgets (clock / weather / services-up) */}
        <div className="hidden sm:block mr-1">
          <HeaderWidgets header={header} apps={apps} />
        </div>
        {/* Always-mounted file inputs — the menu's Import/Restore actions
            trigger these from anywhere and they survive the menu portal closing. */}
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={restoreInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onRestoreFile(f);
            e.target.value = "";
          }}
        />
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
              className="fixed z-[300] w-[264px] max-h-[80vh] overflow-auto bg-bg-elevated border border-border rounded-lg shadow-2xl ring-1 ring-white/5 py-1"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              {/* Top-level primary actions — the things reached most often. */}
              <MenuItem
                label={editing ? "Done editing" : "Edit dashboard"}
                icon={GROUP_ICONS.dashboard}
                onClick={() => { setMenuOpen(false); onToggleEdit(); }}
              />
              <MenuItem
                label="Add widget"
                icon={GROUP_ICONS.widgets}
                onClick={() => { setMenuOpen(false); onAddWidget(); }}
              />
              <MenuItem
                label="Manage services"
                icon={GROUP_ICONS.services}
                onClick={() => { setMenuOpen(false); onManageServices(); }}
              />
              <MenuItem
                label="Appearance & themes…"
                icon={GROUP_ICONS.display}
                onClick={() => { setMenuOpen(false); setAppearanceOpen(true); }}
              />
              <div className="my-1 border-t border-border-subtle/60" />

              <MenuGroup
                label="Dashboard & backup"
                icon={GROUP_ICONS.backup}
                open={openGroup === "dashboard"}
                onToggle={() => setOpenGroup((g) => (g === "dashboard" ? null : "dashboard"))}
              >
                <MenuItem label="New dashboard from template…" icon={ITEM_ICONS.template} onClick={() => { setMenuOpen(false); onNewFromTemplate(); }} />
                <MenuItem label="Import a dashboard…" icon={ITEM_ICONS.import} onClick={() => { setMenuOpen(false); importInputRef.current?.click(); }} />
                <MenuItem label="Export this dashboard" icon={ITEM_ICONS.export} onClick={() => { setMenuOpen(false); onExport(); }} />
                <MenuItem label={copiedShare ? "Copied to clipboard ✓" : "Copy dashboard (share)"} icon={ITEM_ICONS.share} onClick={() => onCopyDashboard()} />
                <MenuItem label="Edit config.yaml…" icon={ITEM_ICONS.config} onClick={() => { setMenuOpen(false); onEditConfig(); }} />
                <MenuItem label="Back up everything" icon={ITEM_ICONS.backup} onClick={() => { setMenuOpen(false); onBackup(); }} />
                <MenuItem label="Restore from backup…" icon={ITEM_ICONS.restore} onClick={() => { setMenuOpen(false); restoreInputRef.current?.click(); }} />
              </MenuGroup>

              <div className="my-1 border-t border-border-subtle/60" />
              <MenuItem
                label="Alerts (down/recover/cert)…"
                icon={ITEM_ICONS.bell}
                onClick={() => { setMenuOpen(false); onOpenAlerts(); }}
              />
              <MenuItem
                label="Open status page"
                icon={ITEM_ICONS.external}
                onClick={() => { setMenuOpen(false); window.open("/status", "_blank", "noopener"); }}
              />
              <MenuItem
                label={alertsEnabled ? "Desktop alerts: on" : "Desktop alerts: off"}
                icon={ITEM_ICONS.bell}
                onClick={() => { setMenuOpen(false); onToggleAlerts(); }}
              />
              <MenuItem
                label="Enter kiosk mode"
                icon={ITEM_ICONS.kiosk}
                onClick={() => { setMenuOpen(false); onEnterKiosk(); }}
              />
              {authQ.data?.enabled && authQ.data?.authenticated && (
                <MenuItem
                  label={`Log out${authQ.data.user ? ` (${authQ.data.user})` : ""}`}
                  icon={ITEM_ICONS.logout}
                  onClick={async () => {
                    setMenuOpen(false);
                    await api.logout().catch(() => {});
                    window.location.reload();
                  }}
                />
              )}
              <div className="px-3 py-2 border-t border-border-subtle flex items-center justify-between">
                <span className="text-[10px] text-text-muted">axboard</span>
                <span className="text-[10px] font-mono text-text-muted/70" title={versionQ.data?.buildDate || ""}>
                  {versionQ.data?.version ? (versionQ.data.version.length > 10 ? versionQ.data.version.slice(0, 8) : versionQ.data.version) : "…"}
                </span>
              </div>
            </div>,
            document.body,
          )}
      </div>

      <AppearancePanel
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        background={background}
        onSetBackground={onSetBackground}
        barStyle={barStyle}
        onSetBarStyle={onSetBarStyle}
        header={header}
        onSetHeader={onSetHeader}
        apps={apps}
        theme={theme}
        setTheme={setTheme}
        accent={activeAccent}
        onSetAccent={onSetAccent}
        density={density}
        onSetDensity={onSetDensity}
      />
    </div>
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
  onDropTab,
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
  onDropTab: (fromId: string) => void;
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
    <div
      className="relative flex items-center group/tab"
      draggable={editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/axboard-tab", db.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (editing && e.dataTransfer.types.includes("text/axboard-tab")) e.preventDefault();
      }}
      onDrop={(e) => {
        const fromId = e.dataTransfer.getData("text/axboard-tab");
        if (fromId) {
          e.preventDefault();
          onDropTab(fromId);
        }
      }}
    >
      <button
        onClick={onSelect}
        onDoubleClick={() => editing && onStartRename()}
        title={editing ? "Drag to reorder · double-click to rename" : undefined}
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

// Collapsible submenu group inside the general menu (accordion-style).
function MenuGroup({
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-subtle/60 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-text-secondary hover:text-text hover:bg-bg-hover transition-colors"
      >
        {icon && <span className="text-text-muted shrink-0">{icon}</span>}
        <span className="flex-1 text-left">{label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

// Per-action icons for menu items (all 14×14 line icons).
const I = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    {d}
  </svg>
);
const ITEM_ICONS: Record<string, React.ReactNode> = {
  template: I(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M17.5 14v7M14 17.5h7" /></>),
  import: I(<><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>),
  export: I(<><path d="M12 15V3" /><path d="m8 7 4-4 4 4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>),
  share: I(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" /></>),
  config: I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 14 2 2-2 2M15 18h-2" /></>),
  backup: I(<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>),
  restore: I(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>),
  bell: I(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  kiosk: I(<><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></>),
  status: I(<><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>),
  external: I(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></>),
  logout: I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>),
};

const GROUP_ICONS: Record<string, React.ReactNode> = {
  services: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <rect x="2" y="3" width="20" height="6" rx="1" />
      <rect x="2" y="15" width="20" height="6" rx="1" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  widgets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  ),
  backup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  ),
  display: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
};

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
