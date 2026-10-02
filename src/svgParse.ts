import { sanitizeSvgElement } from './svgSafety'
import type { BaseDrawing, Box } from './types'

// ---------------------------------------------------------------------------
// Parse an imported SVG string into our BaseDrawing layer: the inner markup,
// the viewBox, and a tight content bounding box used for normalized anchoring.
// ---------------------------------------------------------------------------

function parseViewBox(svg: SVGSVGElement): Box {
  const vb = svg.getAttribute('viewBox')
  if (vb) {
    const [x, y, w, h] = vb.split(/[\s,]+/).map(Number)
    if (vb.split(/[\s,]+/).length === 4 && [x, y, w, h].every((n) => Number.isFinite(n)) && w > 0 && h > 0) return { x, y, w, h }
    throw new Error('The SVG viewBox must have four finite numbers and a positive size.')
  }
  const w = Number(svg.getAttribute('width')) || 100
  const h = Number(svg.getAttribute('height')) || 100
  if (!(w > 0 && h > 0)) throw new Error('The SVG dimensions must be positive.')
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
  const targetBoxes: Record<string, Box> = Object.create(null)
  try {
    const b = g.getBBox()
    if (b.width > 0 && b.height > 0) {
      contentBox = { x: b.x, y: b.y, w: b.width, h: b.height }
    }
    g.querySelectorAll<SVGGraphicsElement>('[id],[data-drawer-el]').forEach((el) => {
      if (el.closest('[data-drawer-decoration="true"]')) return
      const key = el.id || el.getAttribute('data-drawer-el')
      if (!key) return
      try {
        const eb = el.getBBox()
        if (eb.width > 0 || eb.height > 0) {
          const rootMatrix = g.getCTM()
          const elementMatrix = el.getCTM()
          if (!rootMatrix || !elementMatrix) return
          const matrix = rootMatrix.inverse().multiply(elementMatrix)
          const corners = [[eb.x, eb.y], [eb.x + eb.width, eb.y], [eb.x, eb.y + eb.height], [eb.x + eb.width, eb.y + eb.height]]
            .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix))
          const xs = corners.map((p) => p.x)
          const ys = corners.map((p) => p.y)
          if (![...xs, ...ys].every(Number.isFinite)) return
          targetBoxes[key] = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
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
const sanitizeElement = sanitizeSvgElement

/** Sanitize a markup string (used for body content from any source). */
export function sanitizeMarkup(inner: string): string {
  if (typeof document === 'undefined') throw new Error('SVG sanitization requires a browser DOM.')
  const parsed = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`, 'image/svg+xml')
  if (parsed.querySelector('parsererror')) throw new Error('Invalid project SVG markup.')
  const root = parsed.documentElement
  sanitizeElement(root)
  return root.innerHTML
}

/** Parse a raw SVG document string into a BaseDrawing. */
export function parseSvg(raw: string): BaseDrawing {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  // DOMParser reports XML errors as a <parsererror> node instead of throwing
  if (doc.querySelector('parsererror')) {
    throw new Error('The file could not be parsed as valid SVG/XML.')
  }
  const svg = doc.querySelector('svg')
  if (!svg || svg !== (doc.documentElement as Element) || svg.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('The file must have a namespaced <svg> root.')
  const viewBox = parseViewBox(svg as unknown as SVGSVGElement)
  // strip <title> so it doesn't render as a tooltip we don't control
  svg.querySelectorAll('title').forEach((t) => t.remove())
  sanitizeElement(svg)
  // give every drawable element a stable handle so anchors can target a part
  const handles = new Set<string>()
  svg.querySelectorAll('[id],[data-drawer-el]').forEach((el) => {
    const id = el.id || el.getAttribute('data-drawer-el')!
    if (handles.has(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error(`Duplicate or reserved SVG target: ${id}`)
    handles.add(id)
  })
  let n = 0
  svg
    .querySelectorAll('path, circle, ellipse, rect, polygon, polyline, line')
    .forEach((el) => {
      if (!el.id && !el.getAttribute('data-drawer-el') && !el.closest('[data-drawer-decoration="true"]')) {
        while (handles.has(`el${++n}`)) { /* reserve a unique handle */ }
        el.setAttribute('data-drawer-el', `el${n}`)
        handles.add(`el${n}`)
      }
    })
  const inner = svg.innerHTML.trim()
  const { contentBox, targetBoxes } = measureGeometry(inner, viewBox)
  return { inner, viewBox, contentBox, targetBoxes }
}
