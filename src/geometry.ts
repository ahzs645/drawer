import type {
  Anchor,
  BaseDrawing,
  Box,
  Landmark,
  ResolvedCallout,
  Vec2,
} from './types'

// ---------------------------------------------------------------------------
// Coordinate transforms + leader geometry. This module is pure (no React) so
// it can be unit-tested and reused by the exporters.
// ---------------------------------------------------------------------------

/**
 * The bounding box a normalized position (anchor or landmark) is relative to:
 * a specific targeted element's box if present, else the whole content box.
 * One source of truth shared by the store, resolver, and landmark catalog.
 */
export function boxForTarget(base: BaseDrawing, targetId: string | null | undefined): Box {
  if (targetId && base.targetBoxes?.[targetId]) return base.targetBoxes[targetId]
  return base.contentBox
}

/** Resolve a landmark to an absolute point in the drawing's user space. */
export function landmarkPoint(base: BaseDrawing, lm: Landmark): Vec2 {
  const box = boxForTarget(base, lm.targetId ?? null)
  return { x: box.x + lm.nx * box.w, y: box.y + lm.ny * box.h }
}

/**
 * Nearest landmark to a point, within maxDist (user units). Returns the
 * landmark plus its resolved point, or null. Used for snap-to-catalog.
 */
export function nearestLandmark(
  base: BaseDrawing,
  landmarks: Landmark[],
  p: Vec2,
  maxDist: number,
): { landmark: Landmark; point: Vec2; dist: number } | null {
  let best: { landmark: Landmark; point: Vec2; dist: number } | null = null
  for (const lm of landmarks) {
    const pt = landmarkPoint(base, lm)
    const dist = Math.hypot(pt.x - p.x, pt.y - p.y)
    if (dist <= maxDist && (!best || dist < best.dist)) {
      best = { landmark: lm, point: pt, dist }
    }
  }
  return best
}

/** Convert a client (screen) point to SVG user-space using the live CTM. */
export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Vec2 {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  try {
    const local = pt.matrixTransform(ctm.inverse())
    // a singular CTM (e.g. zero-size element) yields NaN/Infinity — reject it so
    // anchors/labels are never written with corrupt coordinates
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) {
      return { x: clientX, y: clientY }
    }
    return { x: local.x, y: local.y }
  } catch {
    return { x: clientX, y: clientY }
  }
}

/** Scale a client-space delta (dx,dy in px) into SVG user-space units. */
export function clientDeltaToSvg(svg: SVGSVGElement, dx: number, dy: number): Vec2 {
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: dx, y: dy }
  // CTM maps svg->screen; a/d hold the x/y scale (no rotation/skew here).
  return { x: dx / ctm.a, y: dy / ctm.d }
}

/** Resolve an anchor to an absolute point in the drawing's user space. */
export function resolveAnchor(anchor: Anchor, contentBox: Box): Vec2 {
  switch (anchor.mode) {
    case 'absolute':
      return anchor.absolute ?? { x: 0, y: 0 }
    case 'relative-bbox': {
      const r = anchor.relative
      if (!r) return { x: 0, y: 0 }
      // targetId-relative boxes are resolved by the caller when a target
      // element exists; the common case anchors to the whole content box.
      return {
        x: contentBox.x + r.nx * contentBox.w,
        y: contentBox.y + r.ny * contentBox.h,
      }
    }
    case 'path-offset':
      // Reserved: needs the live <path> element to call getPointAtLength.
      return { x: 0, y: 0 }
  }
}

/** Turn an absolute point into a normalized position inside the content box. */
export function pointToNormalized(p: Vec2, contentBox: Box): { nx: number; ny: number } {
  return {
    nx: contentBox.w ? (p.x - contentBox.x) / contentBox.w : 0,
    ny: contentBox.h ? (p.y - contentBox.y) / contentBox.h : 0,
  }
}

/** Font size in user units, scaled to the drawing so text is readable. */
export function fontSizeFor(box: Box): number {
  const s = Math.max(box.w, box.h) * 0.02
  return Math.min(30, Math.max(11, Math.round(s)))
}

/** Radius for a balloon given its text, shape and font size. */
export function balloonRadius(
  text: string,
  shape: ResolvedCallout['balloonShape'],
  fontSize = 14,
): number {
  if (shape === 'none') return Math.max(4, fontSize * 0.3)
  const base = fontSize * 0.95
  const extra = Math.max(0, text.length - 2) * fontSize * 0.36
  return base + extra
}

export interface LeaderGeometry {
  /** polyline from the body anchor to the balloon edge */
  points: Vec2[]
  balloonCenter: Vec2
  radius: number
  /** which horizontal side the anchor is on relative to the balloon */
  side: 'left' | 'right'
}

const SHOULDER_LEN = 14

/**
 * Build the leader polyline + balloon placement for a resolved callout.
 * 'straight' points directly at the anchor; 'elbow' adds a short horizontal
 * landing stub into the balloon (the classic SolidWorks look).
 */
export function buildLeader(c: ResolvedCallout, fontSize = 14): LeaderGeometry {
  const center = c.labelPos
  const anchor = c.anchorPoint
  const radius = balloonRadius(c.balloonText, c.balloonShape, fontSize)
  const side: 'left' | 'right' = anchor.x <= center.x ? 'left' : 'right'

  // 'straight' always renders straight — a stale elbow from a previous style
  // must not bend it.
  if (c.leaderStyle === 'straight') {
    const dx = anchor.x - center.x
    const dy = anchor.y - center.y
    const len = Math.hypot(dx, dy) || 1
    const edge: Vec2 = {
      x: center.x + (dx / len) * radius,
      y: center.y + (dy / len) * radius,
    }
    return { points: [anchor, edge], balloonCenter: center, radius, side }
  }

  // Elbow: land horizontally into the balloon on the anchor-facing side.
  const sign = side === 'left' ? -1 : 1
  const landing: Vec2 = { x: center.x + sign * radius, y: center.y }
  const shoulder: Vec2 = { x: landing.x + sign * SHOULDER_LEN, y: landing.y }
  const bend: Vec2 = c.elbow ?? shoulder
  const points = c.elbow
    ? [anchor, c.elbow, landing]
    : [anchor, bend, landing]
  return { points, balloonCenter: center, radius, side }
}

/** Where the text label should be drawn relative to the balloon. */
export function labelTextPlacement(
  c: ResolvedCallout,
  geo: LeaderGeometry,
): { x: number; y: number; anchor: 'start' | 'end' } {
  // text goes on the side AWAY from the body anchor
  const away = geo.side === 'left' ? 'right' : 'left'
  const gap = geo.radius + 6
  if (away === 'right') {
    return { x: c.labelPos.x + gap, y: c.labelPos.y, anchor: 'start' }
  }
  return { x: c.labelPos.x - gap, y: c.labelPos.y, anchor: 'end' }
}

export function polylineToPoints(points: Vec2[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')
}

/**
 * Arrowhead polygon points for a leader whose body end is `tip`, with the line
 * arriving from `from`. Returns a small triangle pointing at `tip`.
 */
export function arrowHead(tip: Vec2, from: Vec2, size: number): string {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // base of the triangle, `size` back along the line; corners spread sideways
  const bx = tip.x - ux * size
  const by = tip.y - uy * size
  const half = size * 0.5
  const p1 = `${round(bx - uy * half)},${round(by + ux * half)}`
  const p2 = `${round(bx + uy * half)},${round(by - ux * half)}`
  return `${round(tip.x)},${round(tip.y)} ${p1} ${p2}`
}

export function hexPoints(center: Vec2, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    pts.push(`${round(center.x + r * Math.cos(a))},${round(center.y + r * Math.sin(a))}`)
  }
  return pts.join(' ')
}

export function round(n: number): number {
  return Math.round(n * 100) / 100
}
