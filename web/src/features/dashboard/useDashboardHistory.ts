import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardLayout } from "./widgets/types";

// ---------------------------------------------------------------------------
// Dashboard history (undo/redo)
// Maintains two stacks — past + future — capped at HISTORY_CAPACITY entries.
// Each stack entry is a full DashboardLayout snapshot. The hook does NOT
// know how to apply a snapshot back to the API; it returns the restored
// snapshot from undo()/redo() and the consumer is responsible for persisting.
//
// Usage pattern in DashboardPage:
//   const history = useDashboardHistory(layout);
//
//   // Before any layout-mutating action, push the CURRENT layout
//   // (the "before" state) onto history, then apply the change:
//   history.pushSnapshot(layout);
//   persist(nextLayout);
//
//   // For undo/redo, take the restored layout and persist it WITHOUT
//   // re-pushing to history:
//   const restored = history.undo();
//   if (restored) persistWithoutHistory(restored);
//
// Switching dashboards should reset the history — call clear() in an
// effect keyed on the active dashboard id.
// ---------------------------------------------------------------------------

const HISTORY_CAPACITY = 20;

export interface DashboardHistory {
  canUndo: boolean;
  canRedo: boolean;
  pastCount: number;
  futureCount: number;
  pushSnapshot: (snapshot: DashboardLayout) => void;
  undo: () => DashboardLayout | null;
  redo: () => DashboardLayout | null;
  clear: () => void;
}

export function useDashboardHistory(currentLayout: DashboardLayout): DashboardHistory {
  const [past, setPast] = useState<DashboardLayout[]>([]);
  const [future, setFuture] = useState<DashboardLayout[]>([]);

  // Refs so undo/redo callbacks can read the latest state without
  // having to be re-created on every layout change.
  const currentRef = useRef(currentLayout);
  const pastRef = useRef(past);
  const futureRef = useRef(future);
  useEffect(() => {
    currentRef.current = currentLayout;
  }, [currentLayout]);
  useEffect(() => {
    pastRef.current = past;
  }, [past]);
  useEffect(() => {
    futureRef.current = future;
  }, [future]);

  const pushSnapshot = useCallback((snapshot: DashboardLayout) => {
    setPast((p) => {
      const next = [...p, snapshot];
      // Drop oldest entries if we exceed capacity.
      while (next.length > HISTORY_CAPACITY) next.shift();
      return next;
    });
    // Any new action discards the redo stack.
    setFuture([]);
  }, []);

  const undo = useCallback((): DashboardLayout | null => {
    const p = pastRef.current;
    if (p.length === 0) return null;
    const restored = p[p.length - 1];
    setPast(p.slice(0, -1));
    setFuture([currentRef.current, ...futureRef.current]);
    return restored;
  }, []);

  const redo = useCallback((): DashboardLayout | null => {
    const f = futureRef.current;
    if (f.length === 0) return null;
    const restored = f[0];
    setFuture(f.slice(1));
    setPast([...pastRef.current, currentRef.current]);
    return restored;
  }, []);

  const clear = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    pastCount: past.length,
    futureCount: future.length,
    pushSnapshot,
    undo,
    redo,
    clear,
  };
}
