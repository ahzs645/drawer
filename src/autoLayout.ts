import { fontSizeFor } from './geometry'
import { getView, resolveCallouts } from './resolve'
import type { DrawerDoc, Vec2 } from './types'

// ---------------------------------------------------------------------------
// Auto label layout — "boundary labeling".
//
// The classic way textbook / anatomy figures avoid a tangle of overlapping
// leader lines: labels are parked in a vertical column just outside each side
// of the drawing, ordered top-to-bottom to match their anchor points, and
// spread apart so no two labels collide. Each callout keeps its body-locked
// anchor; only the label (balloon) position is arranged, as a per-view
// override, so it stays undoable and specific to the view you arrange.
//
// The 1-D spreading is the standard non-overlapping-interval pass: sort by the
// desired (anchor) y, push each label down until it clears the previous one by
// a minimum gap, then shift the whole stack up if it overran the bottom. When a
// side is too crowded to honour the preferred gap, the gap shrinks to an even
// distribution across the available height. Pure (no React) so it can be reused
// by the store and unit-tested.
// ---------------------------------------------------------------------------

/**
 * Compute arranged label positions (balloon centers) for every *visible*
 * callout in a view. Returns a map of calloutId -> new labelPos. Callouts hidden
 * in the view are left untouched.
 */
export function computeArrangement(doc: DrawerDoc, viewId?: string): Record<string, Vec2> {
  const view = getView(doc, viewId)
  const resolved = resolveCallouts(doc, view.id).filter((r) => r.visible)
  const out: Record<string, Vec2> = {}
  if (resolved.length === 0) return out

  const box = doc.base.contentBox
  const centerX = box.x + box.w / 2
  // park the label columns well clear of the silhouette so balloons/text don't
  // sit on top of the body (true per-row silhouette avoidance is future work —
  // this uses the content bounding box plus a generous gutter)
  const pad = Math.max(40, box.w * 0.09)
  const colLeft = box.x - pad
  const colRight = box.x + box.w + pad
  const top = box.y + box.h * 0.03
  const bottom = box.y + box.h * 0.97
  const preferredGap = Math.max(fontSizeFor(box) * 1.9, box.h * 0.035)

  const place = (list: typeof resolved, x: number) => {
    const n = list.length
    if (n === 0) return
    const items = list
      .map((r) => ({ id: r.id, y: r.anchorPoint.y }))
      .sort((a, b) => a.y - b.y)
    // shrink the gap to fit when a side is crowded (even distribution fallback)
    const gap = Math.min(preferredGap, (bottom - top) / Math.max(1, n - 1))
    // start from the desired (anchor) y, clamped into the usable band
    for (const it of items) it.y = Math.min(bottom, Math.max(top, it.y))
    // forward pass: keep each label at least `gap` below the previous one
    for (let i = 1; i < n; i++) {
      if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap
    }
    // if the stack ran past the bottom, slide it all up
    const overflow = items[n - 1].y - bottom
    if (overflow > 0) for (const it of items) it.y -= overflow
    // and if sliding up pushed the first label above the top, re-pack downward
    if (items[0].y < top) {
      let prev = top - gap
      for (const it of items) {
        it.y = Math.max(it.y, prev + gap)
        prev = it.y
      }
    }
    for (const it of items) out[it.id] = { x, y: it.y }
  }

  place(
    resolved.filter((r) => r.anchorPoint.x < centerX),
    colLeft,
  )
  place(
    resolved.filter((r) => r.anchorPoint.x >= centerX),
    colRight,
  )
  return out
}

/**
 * Return a new doc with the arranged label positions written into the view as
 * per-view overrides. Also clears any manual elbow bend so the leaders recompute
 * cleanly. No-op (returns the same doc) when there is nothing to arrange.
 */
export function applyArrangement(doc: DrawerDoc, viewId?: string): DrawerDoc {
  const view = getView(doc, viewId)
  const positions = computeArrangement(doc, view.id)
  if (Object.keys(positions).length === 0) return doc
  const overrides = { ...view.overrides }
  for (const [id, pos] of Object.entries(positions)) {
    overrides[id] = { ...overrides[id], labelPos: pos, elbow: null }
  }
  return {
    ...doc,
    views: doc.views.map((v) => (v.id === view.id ? { ...v, overrides } : v)),
  }
}
