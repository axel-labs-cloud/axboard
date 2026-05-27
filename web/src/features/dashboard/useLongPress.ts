import { useRef, useCallback } from "react";

export function useLongPress(onLongPress: () => void, ms = 300) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const start = useCallback(() => {
    activeRef.current = false;
    timerRef.current = setTimeout(() => {
      activeRef.current = true;
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: cancel,
    isActive: () => activeRef.current,
  };
}
