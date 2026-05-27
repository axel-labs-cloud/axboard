import type { GridItem } from "./widgets/types";

// ---------------------------------------------------------------------------
// Grid placement helpers
//
// react-grid-layout's `compactType={null}` means new items don't get pulled
// upward to fill gaps — but it ALSO means y:Infinity isn't resolved into a
// real bottom-most slot. Combined with `preventCollision={true}`, dropping
// a new item at (0, 0) will collide with whatever's already there and the
// item ends up rendered outside the visible drop area.
//
// We compute the placement ourselves: scan rows + columns from the top-left
// looking for the first empty rectangle that fits the new item. If nothing
// fits in the existing footprint, fall back to placing the item directly
// below all current widgets (an empty new row).
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsCollide(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

export function collidesWithAny(items: GridItem[], rect: Rect): boolean {
  return items.some((item) => rectsCollide(item, rect));
}

/**
 * Find the first empty (x, y) slot where a widget of size (w, h) fits without
 * colliding with any existing item, scanning row-by-row top-down. If no slot
 * is available within the existing footprint, returns a position one row
 * below every other item — guaranteeing a fresh, empty row.
 */
export function findFreeSlot(
  items: GridItem[],
  w: number,
  h: number,
  cols: number
): { x: number; y: number } {
  if (items.length === 0) return { x: 0, y: 0 };

  const maxBottom = items.reduce((acc, it) => Math.max(acc, it.y + it.h), 0);

  for (let y = 0; y <= maxBottom; y++) {
    for (let x = 0; x + w <= cols; x++) {
      if (!collidesWithAny(items, { x, y, w, h })) {
        return { x, y };
      }
    }
  }

  // Nothing fits inside the current footprint — drop a fresh row below.
  return { x: 0, y: maxBottom };
}
