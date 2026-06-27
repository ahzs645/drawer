import type { BaseDrawing, Box } from './types'

// ---------------------------------------------------------------------------
// Parse an imported SVG string into our BaseDrawing layer: the inner markup,
// the viewBox, and a tight content bounding box used for normalized anchoring.
// ---------------------------------------------------------------------------

function parseViewBox(svg: SVGSVGElement): Box {
  const vb = svg.getAttribute('viewBox')
  if (vb) {
    const [x, y, w, h] = vb.split(/[\s,]+/).map(Number)
    if ([x, y, w, h].every((n) => Number.isFinite(n))) return { x, y, w, h }
  }
  const w = Number(svg.getAttribute('width')) || 100
  const h = Number(svg.getAttribute('height')) || 100
  return { x: 0, y: 0, w, h }
}

/**
 * Mount inner SVG markup offscreen and measure both the overall content box and
 * the bounding box of every addressable element (keyed by id / data-drawer-el).
 * Falls back to the viewBox if measurement is unavailable (non-DOM env).
 */
export function measureGeometry(
  inner: string,
  viewBox: Box,
): { contentBox: Box; targetBoxes: Record<string, Box> } {
  if (typeof document === 'undefined') return { contentBox: viewBox, targetBoxes: {} }
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`)
  svg.style.position = 'absolute'
  svg.style.left = '-100000px'
  svg.style.top = '0'
  svg.style.width = `${viewBox.w}px`
  svg.style.height = `${viewBox.h}px`
  const g = document.createElementNS(ns, 'g')
  g.innerHTML = inner
  svg.appendChild(g)
  document.body.appendChild(svg)
  let contentBox: Box = viewBox
  const targetBoxes: Record<string, Box> = {}
  try {
    const b = g.getBBox()
    if (b.width > 0 && b.height > 0) {
      contentBox = { x: b.x, y: b.y, w: b.width, h: b.height }
    }
    g.querySelectorAll<SVGGraphicsElement>('[id],[data-drawer-el]').forEach((el) => {
      const key = el.id || el.getAttribute('data-drawer-el')
      if (!key) return
      try {
        const eb = el.getBBox()
        if (eb.width > 0 || eb.height > 0) {
          targetBoxes[key] = { x: eb.x, y: eb.y, w: eb.width, h: eb.height }
        }
      } catch {
        /* skip un-measurable element */
      }
    })
  } catch {
    contentBox = viewBox
  } finally {
    document.body.removeChild(svg)
  }
  return { contentBox, targetBoxes }
}

/** Strip active/scriptable content in place (markup is injected via innerHTML). */
function sanitizeElement(root: Element) {
  root.querySelectorAll('script, foreignObject').forEach((el) => el.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || /(?:^|\b)javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })
}

/** Sanitize a markup string (used for body content from any source). */
export function sanitizeMarkup(inner: string): string {
  if (typeof document === 'undefined') return inner
  const ns = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(ns, 'g')
  g.innerHTML = inner
  sanitizeElement(g)
  return g.innerHTML
}

/** Parse a raw SVG document string into a BaseDrawing. */
export function parseSvg(raw: string): BaseDrawing {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  // DOMParser reports XML errors as a <parsererror> node instead of throwing
  if (doc.querySelector('parsererror')) {
    throw new Error('The file could not be parsed as valid SVG/XML.')
  }
  const svg = doc.querySelector('svg')
  if (!svg) throw new Error('No <svg> element found in the imported file.')
  const viewBox = parseViewBox(svg as unknown as SVGSVGElement)
  // strip <title> so it doesn't render as a tooltip we don't control
  svg.querySelectorAll('title').forEach((t) => t.remove())
  sanitizeElement(svg)
  // give every drawable element a stable handle so anchors can target a part
  let n = 0
  svg
    .querySelectorAll('path, circle, ellipse, rect, polygon, polyline, line')
    .forEach((el) => {
      if (!el.id && !el.getAttribute('data-drawer-el')) {
        el.setAttribute('data-drawer-el', `el${++n}`)
      }
    })
  const inner = svg.innerHTML.trim()
  const { contentBox, targetBoxes } = measureGeometry(inner, viewBox)
  return { inner, viewBox, contentBox, targetBoxes }
}
