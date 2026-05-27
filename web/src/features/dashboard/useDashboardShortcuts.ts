import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Dashboard keyboard shortcuts
//
// All shortcuts in one place so the bindings stay coherent. Modifier:
// Cmd on macOS, Ctrl elsewhere — caller doesn't need to think about it.
//
// Shortcuts:
//   Cmd/Ctrl + E         → toggle edit mode
//   Escape               → exit edit mode (also closes any open config panel
//                          or modal — handled by the consumer's `onEscape`)
//   Cmd/Ctrl + Z         → undo
//   Cmd/Ctrl + Shift + Z → redo
//   Cmd/Ctrl + 1..9      → switch to dashboard tab N (1-indexed)
//   Delete / Backspace   → remove the currently selected widget
//                          (only fires when editing && a widget is selected)
//
// Shortcuts are suppressed when the user is typing in an input/textarea/
// contenteditable/select to avoid trapping keystrokes meant for forms.
// ---------------------------------------------------------------------------

export interface DashboardShortcutHandlers {
  /** Whether the dashboard is currently in edit mode. Some shortcuts only
   *  fire in edit mode (Delete, undo/redo). */
  editing: boolean;
  /** Id of the currently selected widget, or null. Used by the Delete
   *  shortcut. The page tracks selection via right-click / focus. */
  selectedWidgetId: string | null;
  toggleEdit: () => void;
  onEscape: () => void;
  undo: () => void;
  redo: () => void;
  selectDashboard: (index: number) => void;
  removeWidget: (id: string) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useDashboardShortcuts(handlers: DashboardShortcutHandlers) {
  // Stash handlers in a ref so we don't re-bind the keydown listener on
  // every callback identity change. The listener reads the latest handlers
  // via the ref. The ref is updated after commit (not during render) to
  // satisfy the react-hooks 'no refs during render' rule.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const h = handlersRef.current;

      // Escape always works (even if focus is in a modal input — modal
      // close handlers usually want this too).
      if (e.key === "Escape") {
        h.onEscape();
        return;
      }

      // Suppress everything else when typing.
      if (isTypingTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + E → toggle edit
      if (mod && !e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        h.toggleEdit();
        return;
      }

      // Cmd/Ctrl + Shift + Z → redo (check before plain Cmd+Z)
      if (mod && e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (h.editing) h.redo();
        return;
      }

      // Cmd/Ctrl + Z → undo
      if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (h.editing) h.undo();
        return;
      }

      // Cmd/Ctrl + 1..9 → switch dashboard tab
      if (mod && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        h.selectDashboard(Number(e.key) - 1);
        return;
      }

      // Delete / Backspace → remove selected widget (edit mode only)
      if ((e.key === "Delete" || e.key === "Backspace") && h.editing && h.selectedWidgetId) {
        e.preventDefault();
        h.removeWidget(h.selectedWidgetId);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

