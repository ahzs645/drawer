import type {
  Anchor,
  BaseDrawing,
  Box,
  DrawerDoc,
  DrawingElement,
  ImageInstance,
  Landmark,
  ResolvedCallout,
  TextAnnotation,
  Vec2,
} from './types'

// ---------------------------------------------------------------------------
// Coordinate transforms + leader geometry. This module is pure (no React) so
// it can be unit-tested and reused by the exporters.
//
// Two coordinate systems are in play:
//   - page space: the document's user units (callout labels, text, shapes)
//   - drawing space: each placed image's own SVG units. Anchors and landmarks
//     with an imageId are stored here, so they follow the image around.
// ---------------------------------------------------------------------------

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/**
 * The bounding box a normalized position (anchor or landmark) is relative to:
 * a specific targeted element's box if present, else the whole content box.
 * One source of truth shared by the store, resolver, and landmark catalog.
 */
export function boxForTarget(base: BaseDrawing, targetId: string | null | undefined): Box {
  if (targetId && own(base.targetBoxes ?? {}, targetId)) return base.targetBoxes[targetId]
  return base.contentBox
}

// --- placed images ---------------------------------------------------------

export function findImage(doc: DrawerDoc, id: string | null | undefined): ImageInstance | undefined {
  return id ? doc.images.find((i) => i.id === id) : undefined
}

/** The drawing an imageId refers to; the page itself when absent or unknown. */
export function drawingFor(doc: DrawerDoc, imageId: string | null | undefined): BaseDrawing {
  return findImage(doc, imageId)?.drawing ?? doc.base
}

export function isImageVisible(doc: DrawerDoc, imageId: string | null | undefined): boolean {
  if (!imageId) return true
  const image = findImage(doc, imageId)
  return !!image && image.visible !== false
}

/** Drawing space -> page space. */
export function imageToPage(image: ImageInstance, p: Vec2): Vec2 {
  const vb = image.drawing.viewBox
  const sx = (image.width / vb.w) * (image.flipX ? -1 : 1)
  const sy = image.height / vb.h
  const dx = (p.x - vb.x - vb.w / 2) * sx
  const dy = (p.y - vb.y - vb.h / 2) * sy
  const r = (image.rotation * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return {
    x: image.x + image.width / 2 + dx * c - dy * s,
    y: image.y + image.height / 2 + dx * s + dy * c,
  }
}

/** Page space -> drawing space (inverse of imageToPage). */
export function pageToImage(image: ImageInstance, p: Vec2): Vec2 {
  const vb = image.drawing.viewBox
  const r = (-image.rotation * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const ox = p.x - image.x - image.width / 2
  const oy = p.y - image.y - image.height / 2
  const dx = ox * c - oy * s
  const dy = ox * s + oy * c
  const sx = (image.width / vb.w) * (image.flipX ? -1 : 1)
  const sy = image.height / vb.h
  return { x: dx / sx + vb.x + vb.w / 2, y: dy / sy + vb.y + vb.h / 2 }
}

/** SVG transform attribute placing the drawing's markup on the page. */
export function imageTransform(image: ImageInstance): string {
  const vb = image.drawing.viewBox
  const sx = (image.width / vb.w) * (image.flipX ? -1 : 1)
  const sy = image.height / vb.h
  return `translate(${round(image.x + image.width / 2)} ${round(image.y + image.height / 2)}) rotate(${round(image.rotation)}) scale(${roundScale(sx)} ${roundScale(sy)}) translate(${round(-(vb.x + vb.w / 2))} ${round(-(vb.y + vb.h / 2))})`
}

/**
 * The placed box on the page, ignoring any mirror: center, rotation, and its
 * corners in on-screen order (top-left, top-right, bottom-right, bottom-left
 * before rotation). Used by the move / resize / rotate handles.
 */
export function imageFrame(image: ImageInstance): { center: Vec2; angle: number; corners: Vec2[] } {
  const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 }
  const angle = (image.rotation * Math.PI) / 180
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const at = (dx: number, dy: number) => ({ x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c })
  const hw = image.width / 2
  const hh = image.height / 2
  return { center, angle, corners: [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)] }
}

/** Page-space corners of a box given in drawing space (TL, TR, BR, BL). */
export function imageBoxCorners(image: ImageInstance, box: Box = image.drawing.viewBox): Vec2[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ].map((p) => imageToPage(image, p))
}

export function boundsOfPoints(points: Vec2[]): Box {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** Axis-aligned page bounds of a drawing-space box (the whole frame by default). */
export function imagePageBounds(image: ImageInstance, box: Box = image.drawing.viewBox): Box {
  return boundsOfPoints(imageBoxCorners(image, box))
}

/** Is a page point inside the image's placed frame (rotation aware)? */
export function imageContainsPoint(image: ImageInstance, p: Vec2): boolean {
  const local = pageToImage(image, p)
  const vb = image.drawing.viewBox
  return local.x >= vb.x && local.x <= vb.x + vb.w && local.y >= vb.y && local.y <= vb.y + vb.h
}

/** Topmost visible image whose frame contains the page point. */
export function imageAtPoint(doc: DrawerDoc, p: Vec2): ImageInstance | undefined {
  for (let i = doc.images.length - 1; i >= 0; i--) {
    const image = doc.images[i]
    if (image.visible !== false && imageContainsPoint(image, p)) return image
  }
  return undefined
}

/** Page bounds of the drawn artwork: every visible image's content plus legacy base markup. */
export function docContentBox(doc: DrawerDoc): Box {
  const boxes: Box[] = doc.images
    .filter((i) => i.visible !== false)
    .map((i) => imagePageBounds(i, i.drawing.contentBox))
  if (doc.base.inner.trim() || boxes.length === 0) boxes.push(doc.base.contentBox)
  const points = boxes.flatMap((b) => [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
  ])
  return boundsOfPoints(points)
}

// --- anchors & landmarks in page space -------------------------------------

/** Resolve an anchor to a page-space point, through its image when it has one. */
export function anchorPagePoint(doc: DrawerDoc, anchor: Anchor): Vec2 {
  const image = findImage(doc, anchor.imageId)
  const drawing = image?.drawing ?? doc.base
  const local = resolveAnchor(anchor, boxForTarget(drawing, anchor.relative?.targetId ?? null))
  return image ? imageToPage(image, local) : local
}

/**
 * Normalized position of a page point inside an image's (or the page's) target
 * box — the inverse of anchorPagePoint for 'relative-bbox' anchors.
 */
export function pageToRelative(
  doc: DrawerDoc,
  imageId: string | null | undefined,
  targetId: string | null | undefined,
  p: Vec2,
): { nx: number; ny: number } {
  const image = findImage(doc, imageId)
  const local = image ? pageToImage(image, p) : p
  return pointToNormalized(local, boxForTarget(image?.drawing ?? doc.base, targetId ?? null))
}

/** Resolve a landmark to an absolute point in page space. */
export function landmarkPoint(doc: DrawerDoc, lm: Landmark): Vec2 {
  const image = findImage(doc, lm.imageId)
  const box = boxForTarget(image?.drawing ?? doc.base, lm.targetId ?? null)
  const local = { x: box.x + lm.nx * box.w, y: box.y + lm.ny * box.h }
  return image ? imageToPage(image, local) : local
}

/**
 * Nearest landmark to a point, within maxDist (user units). Returns the
 * landmark plus its resolved point, or null. Used for snap-to-catalog.
 * Landmarks on hidden images are skipped.
 */
export function nearestLandmark(
  doc: DrawerDoc,
  landmarks: Landmark[],
  p: Vec2,
  maxDist: number,
): { landmark: Landmark; point: Vec2; dist: number } | null {
  let best: { landmark: Landmark; point: Vec2; dist: number } | null = null
  for (const lm of landmarks) {
    if (!isImageVisible(doc, lm.imageId)) continue
    const pt = landmarkPoint(doc, lm)
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

  // the balloon sits on the point itself: no leader at all
  if (c.leaderStyle === 'none') return { points: [], balloonCenter: center, radius, side }

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
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  if (c.labelOffset) {
    return {
      x: c.labelPos.x + c.labelOffset.x,
      y: c.labelPos.y + c.labelOffset.y,
      anchor: c.labelAlign ?? (geo.side === 'left' ? 'start' : 'end'),
    }
  }
  // text goes on the side AWAY from the body anchor
  const away = geo.side === 'left' ? 'right' : 'left'
  const gap = geo.radius + 6
  if (away === 'right') {
    return { x: c.labelPos.x + gap, y: c.labelPos.y, anchor: 'start' }
  }
  return { x: c.labelPos.x - gap, y: c.labelPos.y, anchor: 'end' }
}

/** Explicit line breaks, centered as a block; shared by React and SVG export. */
export function labelLines(text: string, fontSize: number): { text: string; dy: number }[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const step = fontSize * 1.05
  return lines.map((line, i) => ({ text: line, dy: (i - (lines.length - 1) / 2) * step }))
}

/**
 * Union box of the body content plus every *visible* callout — the leader
 * anchor, the balloon, any elbow bend, and the estimated label-text extent.
 * Shared by the SVG exporter's viewBox and the editor's "Fit" so that arranged
 * labels parked in the side columns are never cropped off the canvas.
 */
export function calloutContentBounds(
  contentBox: Box,
  resolved: ResolvedCallout[],
  fontSize: number,
): Box {
  let minX = contentBox.x
  let minY = contentBox.y
  let maxX = contentBox.x + contentBox.w
  let maxY = contentBox.y + contentBox.h
  const expand = (x: number, y: number) => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const c of resolved) {
    if (!c.visible) continue
    const cFontSize = c.fontSize || fontSize
    const geo = buildLeader(c, cFontSize)
    expand(c.anchorPoint.x, c.anchorPoint.y)
    expand(c.labelPos.x - geo.radius, c.labelPos.y - geo.radius)
    expand(c.labelPos.x + geo.radius, c.labelPos.y + geo.radius)
    if (c.elbow) expand(c.elbow.x, c.elbow.y)
    if (c.labelText) {
      const tp = labelTextPlacement(c, geo)
      // Conservative per-line estimate; unlike a single-line box this includes
      // both the top and bottom of a multiline block.
      for (const line of labelLines(c.labelText, cFontSize)) {
        const tw = line.text.length * cFontSize * 0.66
        const left = tp.anchor === 'start' ? tp.x : tp.anchor === 'middle' ? tp.x - tw / 2 : tp.x - tw
        expand(left, tp.y + line.dy - cFontSize * 0.65)
        expand(left + tw, tp.y + line.dy + cFontSize * 0.65)
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Approximate the exported/editor bounds of one standalone text annotation. */
export function textAnnotationBounds(item: TextAnnotation): Box {
  const textWidth = Math.max(item.fontSize * 0.6, item.text.length * item.fontSize * 0.58)
  const width = Math.max(textWidth, item.style === 'heading' ? item.ruleWidth : 0)
  let x = item.pos.x
  if (item.align === 'middle') x -= width / 2
  else if (item.align === 'end') x -= width
  const top = item.pos.y - item.fontSize * 0.65
  const bottom = item.pos.y + (item.style === 'heading' ? item.fontSize * 0.95 : item.fontSize * 0.65)
  return { x, y: top, w: width, h: bottom - top }
}

/** Union the body/callout bounds with standalone headings and figure text. */
export function diagramContentBounds(
  contentBox: Box,
  resolved: ResolvedCallout[],
  fontSize: number,
  textAnnotations: TextAnnotation[] = [],
  drawingElements: DrawingElement[] = [],
): Box {
  const callouts = calloutContentBounds(contentBox, resolved, fontSize)
  let minX = callouts.x
  let minY = callouts.y
  let maxX = callouts.x + callouts.w
  let maxY = callouts.y + callouts.h
  for (const item of textAnnotations) {
    const b = textAnnotationBounds(item)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  for (const item of drawingElements) {
    const pad = Math.max(1, item.strokeWidth) / 2
    minX = Math.min(minX, item.start.x - pad, item.end.x - pad)
    minY = Math.min(minY, item.start.y - pad, item.end.y - pad)
    maxX = Math.max(maxX, item.start.x + pad, item.end.x + pad)
    maxY = Math.max(maxY, item.start.y + pad, item.end.y + pad)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
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

/** Scale factors need more precision than coordinates. */
function roundScale(n: number): number {
  return Math.round(n * 1e6) / 1e6
}
