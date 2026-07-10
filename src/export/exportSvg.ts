import {
  arrowHead,
  buildLeader,
  diagramContentBounds,
  fontSizeFor,
  hexPoints,
  labelTextPlacement,
  polylineToPoints,
  round,
} from '../geometry'
import { buildLegend, resolveCallouts } from '../resolve'
import type { Anchor, Box, DrawerDoc, DrawingElement, ResolvedCallout, TextAnnotation } from '../types'

export interface ExportOptions {
  viewId?: string
  includeMetadata?: boolean
  includeAnchors?: boolean
  includeLegend?: boolean
  background?: string | null
}

const FONT_FAMILY =
  "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif"

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Compute a viewBox that contains the body + all visible callouts + legend. */
function computeBounds(
  doc: DrawerDoc,
  resolved: ResolvedCallout[],
  fontSize: number,
  legendWidth: number,
  legendCount: number,
): Box {
  const raw = diagramContentBounds(
    doc.base.contentBox,
    resolved,
    fontSize,
    doc.textAnnotations,
    doc.drawingElements,
  )
  const m = fontSize
  // the legend grows downward from y = top + 1.5*fontSize; make sure the box is
  // tall enough to contain it for callout-heavy documents.
  const legendHeight = legendCount > 0 ? (1.5 + legendCount * 1.35) * fontSize + m : 0
  return {
    x: round(raw.x - m),
    y: round(raw.y - m),
    w: round(raw.w + m * 2 + legendWidth),
    h: round(Math.max(raw.h + m * 2, legendHeight)),
  }
}

function renderTextAnnotation(item: TextAnnotation): string {
  const parts: string[] = []
  if (item.style === 'heading') {
    const center =
      item.align === 'middle'
        ? item.pos.x
        : item.align === 'start'
          ? item.pos.x + item.ruleWidth / 2
          : item.pos.x - item.ruleWidth / 2
    const y = item.pos.y + item.fontSize * 0.78
    parts.push(
      `<line x1="${round(center - item.ruleWidth / 2)}" y1="${round(y)}" x2="${round(center + item.ruleWidth / 2)}" y2="${round(y)}" stroke="${esc(item.color)}" stroke-width="${round(Math.max(1.5, item.fontSize * 0.065))}" stroke-linecap="round"/>`,
    )
  }
  parts.unshift(
    `<text x="${round(item.pos.x)}" y="${round(item.pos.y)}" text-anchor="${item.align}" dominant-baseline="central" font-size="${round(item.fontSize)}" font-weight="${item.fontWeight}" fill="${esc(item.color)}">${esc(item.text)}</text>`,
  )
  return `  <g class="text-annotation" data-text-id="${esc(item.id)}" data-text-style="${item.style}">\n    ${parts.join('\n    ')}\n  </g>`
}

function renderDrawingElement(item: DrawingElement): string {
  const dash = item.dashed ? ` stroke-dasharray="${round(item.strokeWidth * 4)} ${round(item.strokeWidth * 3)}"` : ''
  if (item.kind === 'line') {
    return `  <line class="drawing-element" data-drawing-id="${esc(item.id)}" x1="${round(item.start.x)}" y1="${round(item.start.y)}" x2="${round(item.end.x)}" y2="${round(item.end.y)}" fill="none" stroke="${esc(item.stroke)}" stroke-width="${round(item.strokeWidth)}" stroke-linecap="round"${dash}/>`
  }
  const x = Math.min(item.start.x, item.end.x)
  const y = Math.min(item.start.y, item.end.y)
  const w = Math.abs(item.end.x - item.start.x)
  const h = Math.abs(item.end.y - item.start.y)
  return `  <rect class="drawing-element" data-drawing-id="${esc(item.id)}" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="${item.fill ? esc(item.fill) : 'none'}" stroke="${esc(item.stroke)}" stroke-width="${round(item.strokeWidth)}"${dash}/>`
}

function renderCallout(
  c: ResolvedCallout,
  anchor: Anchor | undefined,
  baseName: string,
  fontSize: number,
  opts: ExportOptions,
): string {
  const fs = c.fontSize || fontSize
  const geo = buildLeader(c, fs)
  const tp = labelTextPlacement(c, geo)
  const col = esc(c.color)
  const parts: string[] = []
  const anc = c.anchorPoint
  const fromPoint = geo.points[1] ?? c.labelPos
  const dashAttr = c.dashed ? ` stroke-dasharray="${round(fs * 0.5)} ${round(fs * 0.36)}"` : ''

  parts.push(
    `<polyline points="${polylineToPoints(geo.points)}" fill="none" stroke="${col}" stroke-width="${round(c.leaderWidth)}" stroke-linejoin="round" stroke-linecap="round"${dashAttr}/>`,
  )
  // leader end decoration at the body
  if (c.leaderEnd === 'arrow') {
    parts.push(`<polygon points="${arrowHead(anc, fromPoint, fs * 0.55)}" fill="${col}"/>`)
  } else if (c.leaderEnd === 'dot') {
    parts.push(`<circle cx="${round(anc.x)}" cy="${round(anc.y)}" r="${round(fs * 0.17)}" fill="${col}"/>`)
  }
  // anchor marker on the body (skipped entirely when anchors are excluded)
  if (opts.includeAnchors !== false) {
    if (c.anchorMarker === 'ring') {
      parts.push(
        `<circle cx="${round(anc.x)}" cy="${round(anc.y)}" r="${round(fs * 0.32)}" fill="#fff" stroke="${col}" stroke-width="${round(c.leaderWidth)}"/>`,
        `<circle cx="${round(anc.x)}" cy="${round(anc.y)}" r="${round(fs * 0.11)}" fill="${col}"/>`,
      )
    } else if (c.anchorMarker === 'dot') {
      parts.push(`<circle cx="${round(anc.x)}" cy="${round(anc.y)}" r="${round(fs * 0.2)}" fill="${col}"/>`)
    } else if (c.anchorMarker === 'tick') {
      const ldx = fromPoint.x - anc.x
      const ldy = fromPoint.y - anc.y
      const llen = Math.hypot(ldx, ldy) || 1
      const px = (-ldy / llen) * fs * 0.32
      const py = (ldx / llen) * fs * 0.32
      parts.push(
        `<line x1="${round(anc.x - px)}" y1="${round(anc.y - py)}" x2="${round(anc.x + px)}" y2="${round(anc.y + py)}" stroke="${col}" stroke-width="${round(c.leaderWidth)}" stroke-linecap="round"/>`,
      )
    }
  }
  if (c.balloonShape === 'circle') {
    parts.push(
      `<circle cx="${round(c.labelPos.x)}" cy="${round(c.labelPos.y)}" r="${round(geo.radius)}" fill="#fff" stroke="${col}" stroke-width="${round(c.leaderWidth)}"/>`,
    )
  } else if (c.balloonShape === 'hex') {
    parts.push(
      `<polygon points="${hexPoints(c.labelPos, geo.radius)}" fill="#fff" stroke="${col}" stroke-width="${round(c.leaderWidth)}"/>`,
    )
  }
  if (c.balloonShape !== 'none' && c.balloonText) {
    parts.push(
      `<text x="${round(c.labelPos.x)}" y="${round(c.labelPos.y)}" text-anchor="middle" dominant-baseline="central" font-size="${round(fs * 0.82)}" font-weight="${c.fontWeight}" fill="${col}">${esc(c.balloonText)}</text>`,
    )
  }
  if (c.labelText) {
    parts.push(
      `<text x="${round(tp.x)}" y="${round(tp.y)}" text-anchor="${tp.anchor}" dominant-baseline="central" font-size="${round(fs)}" font-weight="${c.fontWeight}" fill="#111">${esc(c.labelText)}</text>`,
    )
  }

  let attrs = `class="callout" data-callout-id="${esc(c.id)}"`
  if (opts.includeMetadata !== false) {
    attrs += ` data-name="${esc(baseName)}" data-anchor-x="${round(c.anchorPoint.x)}" data-anchor-y="${round(c.anchorPoint.y)}"`
    if (anchor) {
      attrs += ` data-anchor-mode="${anchor.mode}"`
      if (anchor.mode === 'relative-bbox' && anchor.relative) {
        attrs += ` data-target="${esc(anchor.relative.targetId ?? '')}" data-nx="${round(anchor.relative.nx)}" data-ny="${round(anchor.relative.ny)}"`
      }
    }
  }
  return `  <g ${attrs}>\n    ${parts.join('\n    ')}\n  </g>`
}

function renderLegend(
  doc: DrawerDoc,
  bounds: Box,
  fontSize: number,
  viewId?: string,
): string {
  const legend = buildLegend(doc, viewId)
  if (!legend.length) return ''
  const x = bounds.x + bounds.w - fontSize * 11
  let y = bounds.y + fontSize * 1.5
  const lines = legend
    .map((l) => {
      const line = `<text x="${round(x)}" y="${round(y)}" font-size="${round(fontSize * 0.85)}" fill="#111">${l.index}. ${esc(l.name)}</text>`
      y += fontSize * 1.35
      return line
    })
    .join('\n    ')
  return `  <g class="legend">\n    ${lines}\n  </g>`
}

/** Serialize the document (for a given view) into a standalone static SVG. */
export function exportSvg(doc: DrawerDoc, opts: ExportOptions = {}): string {
  const resolved = resolveCallouts(doc, opts.viewId)
  const fontSize = fontSizeFor(doc.base.viewBox)
  const wantLegend =
    opts.includeLegend ?? doc.views.find((v) => v.id === (opts.viewId ?? doc.activeViewId))?.labelMode !== 'names'
  const legendCount = wantLegend ? buildLegend(doc, opts.viewId).length : 0
  const legendWidth = legendCount ? fontSize * 12 : 0
  const bounds = computeBounds(doc, resolved, fontSize, legendWidth, legendCount)

  const bg =
    opts.background === null
      ? ''
      : `  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="${opts.background ?? '#ffffff'}"/>\n`

  const callouts = resolved
    .filter((c) => c.visible)
    .map((c) =>
      renderCallout(
        c,
        doc.anchors.find((a) => a.id === c.anchorId),
        doc.callouts.find((b) => b.id === c.id)?.labelText ?? c.labelText,
        fontSize,
        opts,
      ),
    )
    .join('\n')

  const legend = wantLegend ? renderLegend(doc, bounds, fontSize, opts.viewId) : ''
  const textAnnotations = doc.textAnnotations.map(renderTextAnnotation).join('\n')
  const drawingElements = doc.drawingElements.map(renderDrawingElement).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}" font-family="${FONT_FAMILY}" data-generator="drawer" data-doc-name="${esc(doc.name)}">
  <title>${esc(doc.name)}</title>
${bg}  <g class="body-layer">${doc.base.inner}</g>
${drawingElements}
${textAnnotations}
${callouts}
${legend}
</svg>
`
}
