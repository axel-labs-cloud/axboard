import { createPortal } from "react-dom";
import { TEMPLATES, type DashboardTemplate } from "./templates";
import { getWidgetDefinition } from "./widgets/registry";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (template: DashboardTemplate) => void;
  atLimit: boolean;
}

// Pick a starter layout to instantiate as a new dashboard.
export function TemplatePickerModal({ open, onClose, onPick, atLimit }: Props) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-2xl ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-[13px] font-semibold text-text">New dashboard from template</span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text w-6 h-6 flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {atLimit ? (
          <div className="p-6 text-center text-[12px] text-text-muted">
            Maximum 5 dashboards. Delete one before creating another.
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => onPick(t)}
                className="text-left p-3 rounded border border-border-subtle bg-bg-card/40 hover:border-accent/40 hover:bg-bg-card transition-colors"
              >
                <div className="text-[12.5px] text-text font-medium mb-1">{t.name}</div>
                <div className="text-[11px] text-text-muted leading-snug mb-2">{t.description}</div>
                <div className="flex flex-wrap gap-1">
                  {t.widgets.map((w, i) => (
                    <span
                      key={i}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted"
                    >
                      {getWidgetDefinition(w.type)?.title ?? w.type}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
