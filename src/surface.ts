import { boxForTarget, findImage, imageToPage, isImageVisible, pageToImage, round } from './geometry'
import type { Area, Box, DrawerDoc, ImageInstance, Site, SurfaceGroup, SurfaceMark, Vec2 } from './types'

// ---------------------------------------------------------------------------
// The selection surface: areas (regions you select), sites (numbered points
// you mark) and marks (symbols or strokes the viewer places) on one drawing.
// Pure geometry and bookkeeping, shared by the editor, the exporter and any
// form runtime that renders a Drawer document.
// ---------------------------------------------------------------------------

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/** Drawing-space -> page-space for an area's image (identity for page areas). */
function toPage(doc: DrawerDoc, imageId: string | undefined, p: Vec2): Vec2 {
  const image = findImage(doc, imageId)
  return image ? imageToPage(image, p) : p
}

function toLocal(doc: DrawerDoc, imageId: string | undefined, p: Vec2): Vec2 {
  const image = findImage(doc, imageId)
  return image ? pageToImage(image, p) : p
}

/** The drawing an area or mark lives in (the page when it has no image). */
function drawingOf(doc: DrawerDoc, imageId: string | undefined) {
  return findImage(doc, imageId)?.drawing ?? doc.base
}

/** Outline of an area in drawing space (parts use their measured box). */
export function areaLocalPolygon(doc: DrawerDoc, area: Area, ellipseSteps = 32): Vec2[] {
  const s = area.shape
  switch (s.kind) {
    case 'rect':
      return [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y },
        { x: s.x + s.w, y: s.y + s.h },
        { x: s.x, y: s.y + s.h },
      ]
    case 'ellipse': {
      const pts: Vec2[] = []
      for (let i = 0; i < ellipseSteps; i++) {
        const a = (Math.PI * 2 * i) / ellipseSteps
        pts.push({ x: s.cx + s.rx * Math.cos(a), y: s.cy + s.ry * Math.sin(a) })
      }
      return pts
    }
    case 'polygon':
      return s.points.map((p) => ({ ...p }))
    case 'part': {
      const b: Box = boxForTarget(drawingOf(doc, area.imageId), s.targetId)
      return [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ]
    }
  }
}

/** Centre of an area on the page (polygon centroid of its outline). */
export function areaCenter(doc: DrawerDoc, area: Area): Vec2 {
  const s = area.shape
  if (s.kind === 'ellipse') return toPage(doc, area.imageId, { x: s.cx, y: s.cy })
  const pts = areaLocalPolygon(doc, area)
  const c = pts.reduce((acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }), { x: 0, y: 0 })
  return toPage(doc, area.imageId, c)
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside
  }
  return inside
}

/**
 * Is a page point inside an area? Drawn shapes are exact. A named part is
 * tested against its measured box here; a live renderer can hit-test the real
 * element instead (see the exporter's data-area-id attributes).
 */
export function pointInArea(doc: DrawerDoc, area: Area, page: Vec2): boolean {
  if (!isImageVisible(doc, area.imageId)) return false
  const p = toLocal(doc, area.imageId, page)
  const s = area.shape
  if (s.kind === 'ellipse') {
    if (s.rx <= 0 || s.ry <= 0) return false
    const dx = (p.x - s.cx) / s.rx
    const dy = (p.y - s.cy) / s.ry
    return dx * dx + dy * dy <= 1
  }
  if (s.kind === 'part' && !own(drawingOf(doc, area.imageId).targetBoxes ?? {}, s.targetId)) return false
  return pointInPolygon(p, areaLocalPolygon(doc, area))
}

/** The areas under a page point, smallest first (a joint before the limb it sits on). */
export function areasAtPoint(doc: DrawerDoc, page: Vec2): Area[] {
  const size = (a: Area) => {
    const pts = areaLocalPolygon(doc, a)
    let sum = 0
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) sum += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y)
    return Math.abs(sum / 2)
  }
  return (doc.areas ?? []).filter((a) => pointInArea(doc, a, page)).sort((a, b) => size(a) - size(b))
}

/** SVG markup for a drawn area's outline, in page space (parts are styled in place instead). */
export function areaOutlineMarkup(doc: DrawerDoc, area: Area, attrs: string): string {
  const s = area.shape
  if (s.kind === 'part') return ''
  const image = findImage(doc, area.imageId)
  // Drawn shapes are placed through their image's transform so rotation and
  // mirroring follow the artwork exactly.
  const wrap = (inner: string) => (image ? `<g transform="${imageTransformFor(image)}">${inner}</g>` : inner)
  if (s.kind === 'rect') return wrap(`<rect x="${round(s.x)}" y="${round(s.y)}" width="${round(s.w)}" height="${round(s.h)}" ${attrs}/>`)
  if (s.kind === 'ellipse') return wrap(`<ellipse cx="${round(s.cx)}" cy="${round(s.cy)}" rx="${round(s.rx)}" ry="${round(s.ry)}" ${attrs}/>`)
  return wrap(`<polygon points="${s.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')}" ${attrs}/>`)
}

function imageTransformFor(image: ImageInstance): string {
  const vb = image.drawing.viewBox
  const sx = (image.width / vb.w) * (image.flipX ? -1 : 1)
  const sy = image.height / vb.h
  return `translate(${round(image.x + image.width / 2)} ${round(image.y + image.height / 2)}) rotate(${round(image.rotation)}) scale(${Math.round(sx * 1e6) / 1e6} ${Math.round(sy * 1e6) / 1e6}) translate(${round(-(vb.x + vb.w / 2))} ${round(-(vb.y + vb.h / 2))})`
}

/** Mean of an image's x/y scale: drawing units -> page units for sizes. */
export function imageScale(doc: DrawerDoc, imageId: string | undefined): number {
  const image = findImage(doc, imageId)
  if (!image) return 1
  const vb = image.drawing.viewBox
  return (image.width / vb.w + image.height / vb.h) / 2
}

/** A mark's points on the page. */
export function markPagePoints(doc: DrawerDoc, mark: SurfaceMark): Vec2[] {
  return mark.points.map((p) => toPage(doc, mark.imageId, p))
}

/** SVG markup for a placed mark (symbols are drawn upright on the page). */
export function markMarkup(doc: DrawerDoc, mark: SurfaceMark, extraAttrs = ''): string {
  const pts = markPagePoints(doc, mark)
  const size = mark.size * imageScale(doc, mark.imageId)
  const sw = round(Math.max(1, size / 4.5))
  const col = mark.color.replace(/[<>"&]/g, '')
  const attrs = `class="drawer-mark" data-mark-id="${mark.id.replace(/[<>"&]/g, '')}"${mark.areaId ? ` data-area-id="${mark.areaId.replace(/[<>"&]/g, '')}"` : ''}${mark.siteId ? ` data-site-id="${mark.siteId.replace(/[<>"&]/g, '')}"` : ''}${extraAttrs} pointer-events="none"`
  if (mark.kind === 'stroke') {
    if (pts.length < 2) return ''
    return `<polyline ${attrs} points="${pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  const c = pts[0]
  if (!c) return ''
  const h = size / 2
  if (mark.symbol === 'circle') return `<circle ${attrs} cx="${round(c.x)}" cy="${round(c.y)}" r="${round(h)}" fill="none" stroke="${col}" stroke-width="${sw}"/>`
  if (mark.symbol === 'triangle') {
    return `<polygon ${attrs} points="${round(c.x)},${round(c.y - h)} ${round(c.x - h)},${round(c.y + h)} ${round(c.x + h)},${round(c.y + h)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"/>`
  }
  return `<g ${attrs}><line x1="${round(c.x - h)}" y1="${round(c.y - h)}" x2="${round(c.x + h)}" y2="${round(c.y + h)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/><line x1="${round(c.x + h)}" y1="${round(c.y - h)}" x2="${round(c.x - h)}" y2="${round(c.y + h)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/></g>`
}

/**
 * Selection totals per group. Labels follow the document's area order, then
 * site number, so a group report reads like the selection itself.
 */
export function groupSelection(
  doc: DrawerDoc,
  selectedAreaIds: Iterable<string>,
  selectedSiteIds: Iterable<string> = [],
): { countsByGroup: Record<string, number>; labelsByGroup: Record<string, string[]> } {
  const areas = new Set(selectedAreaIds)
  const sites = new Set(selectedSiteIds)
  const countsByGroup: Record<string, number> = {}
  const labelsByGroup: Record<string, string[]> = {}
  const sortedSites = [...(doc.sites ?? [])].sort((a, b) => a.number - b.number)
  for (const g of doc.groups ?? []) {
    const inAreas = new Set(g.areaIds)
    const inSites = new Set(g.siteIds)
    const labels = [
      ...(doc.areas ?? []).filter((a) => inAreas.has(a.id) && areas.has(a.id)).map((a) => a.label || a.id),
      ...sortedSites.filter((s: Site) => inSites.has(s.id) && sites.has(s.id)).map((s) => s.label),
    ]
    countsByGroup[g.id] = labels.length
    labelsByGroup[g.id] = labels
  }
  return { countsByGroup, labelsByGroup }
}

/** Groups that show a running count. */
export function countedGroups(doc: DrawerDoc): SurfaceGroup[] {
  return (doc.groups ?? []).filter((g) => g.showCount !== false)
}

/**
 * Add attributes to the element of an image's artwork that a 'part' area
 * names, so a renderer can style and hit-test the real outline. Works on the
 * serialized (sanitized) markup; ids are matched exactly.
 */
export function tagPartElements(inner: string, tags: Record<string, string>): string {
  const ids = Object.keys(tags)
  if (!ids.length) return inner
  return inner.replace(/<([A-Za-z][\w:-]*)(\s[^<>]*?)?(\/?)>/g, (whole, tag: string, attrs: string | undefined, selfClose: string) => {
    if (!attrs) return whole
    const m = /\s(?:id|data-drawer-el)="([^"]*)"/.exec(attrs)
    if (!m || !own(tags, m[1])) return whole
    return `<${tag}${attrs} ${tags[m[1]]}${selfClose}>`
  })
}
