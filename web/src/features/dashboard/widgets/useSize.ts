import { useLayoutEffect, useRef, useState } from "react";

// Tracks a container's pixel size via ResizeObserver so a widget can adapt its
// internal layout to how big it's actually drawn — not just the grid units.
// The shared standard for size-responsive widgets (markets, monitor, …).
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ w: Math.round(cr.width), h: Math.round(cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}
