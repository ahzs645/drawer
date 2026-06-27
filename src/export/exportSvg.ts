import {
  buildLeader,
  fontSizeFor,
  hexPoints,
  labelTextPlacement,
  polylineToPoints,
  round,
} from '../geometry'
import { buildLegend, resolveCallouts } from '../resolve'
import type { Anchor, Box, DrawerDoc, ResolvedCallout } from '../types'

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

function expand(box: { minX: number; minY: number; maxX: number; maxY: number }, x: number, y: number) {
  box.minX = Math.min(box.minX, x)
  box.minY = Math.min(box.minY, y)
  box.maxX = Math.max(box.maxX, x)
  box.maxY = Math.max(box.maxY, y)
}

/** Compute a viewBox that contains the body + all visible callouts + legend. */
function computeBounds(
  doc: DrawerDoc,
  resolved: ResolvedCallout[],
  fontSize: number,
  legendWidth: number,
  legendCount: number,
): Box {
  const cb = doc.base.contentBox
  const b = { minX: cb.x, minY: cb.y, maxX: cb.x + cb.w, maxY: cb.y + cb.h }
  for (const c of resolved) {
    if (!c.visible) continue
    const geo = buildLeader(c, fontSize)
    expand(b, c.anchorPoint.x, c.anchorPoint.y)
    expand(b, c.labelPos.x - geo.radius, c.labelPos.y - geo.radius)
    expand(b, c.labelPos.x + geo.radius, c.labelPos.y + geo.radius)
    if (c.elbow) expand(b, c.elbow.x, c.elbow.y)
    if (c.labelText) {
      const tp = labelTextPlacement(c, geo)
      const tw = c.labelText.length * fontSize * 0.58
      expand(b, tp.x, tp.y)
      expand(b, tp.anchor === 'start' ? tp.x + tw : tp.x - tw, tp.y + fontSize)
    }
  }
  const m = fontSize
  // the legend grows downward from y = top + 1.5*fontSize; make sure the box is
  // tall enough to contain it for callout-heavy documents.
  const legendHeight = legendCount > 0 ? (1.5 + legendCount * 1.35) * fontSize + m : 0
  return {
    x: round(b.minX - m),
    y: round(b.minY - m),
    w: round(b.maxX - b.minX + m * 2 + legendWidth),
    h: round(Math.max(b.maxY - b.minY + m * 2, legendHeight)),
  }
}

function renderCallout(
  c: ResolvedCallout,
  anchor: Anchor | undefined,
  baseName: string,
  fontSize: number,
  opts: ExportOptions,
): string {
  const geo = buildLeader(c, fontSize)
  const tp = labelTextPlacement(c, geo)
  const col = esc(c.color)
  const parts: string[] = []

  parts.push(
    `<polyline points="${polylineToPoints(geo.points)}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`,
  )
  if (opts.includeAnchors !== false) {
    parts.push(
      `<circle cx="${round(c.anchorPoint.x)}" cy="${round(c.anchorPoint.y)}" r="${round(fontSize * 0.32)}" fill="#fff" stroke="${col}" stroke-width="2"/>`,
      `<circle cx="${round(c.anchorPoint.x)}" cy="${round(c.anchorPoint.y)}" r="${round(fontSize * 0.11)}" fill="${col}"/>`,
    )
  }
  if (c.balloonShape === 'circle') {
    parts.push(
      `<circle cx="${round(c.labelPos.x)}" cy="${round(c.labelPos.y)}" r="${round(geo.radius)}" fill="#fff" stroke="${col}" stroke-width="1.6"/>`,
    )
  } else if (c.balloonShape === 'hex') {
    parts.push(
      `<polygon points="${hexPoints(c.labelPos, geo.radius)}" fill="#fff" stroke="${col}" stroke-width="1.6"/>`,
    )
  }
  if (c.balloonShape !== 'none' && c.balloonText) {
    parts.push(
      `<text x="${round(c.labelPos.x)}" y="${round(c.labelPos.y)}" text-anchor="middle" dominant-baseline="central" font-size="${round(fontSize * 0.82)}" font-weight="600" fill="${col}">${esc(c.balloonText)}</text>`,
    )
  }
  if (c.labelText) {
    parts.push(
      `<text x="${round(tp.x)}" y="${round(tp.y)}" text-anchor="${tp.anchor}" dominant-baseline="central" font-size="${round(fontSize)}" fill="#111">${esc(c.labelText)}</text>`,
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}" font-family="${FONT_FAMILY}" data-generator="drawer" data-doc-name="${esc(doc.name)}">
  <title>${esc(doc.name)}</title>
${bg}  <g class="body-layer">${doc.base.inner}</g>
${callouts}
${legend}
</svg>
`
}
