import {
  arrowHead,
  buildLeader,
  diagramContentBounds,
  docContentBox,
  fontSizeFor,
  hexPoints,
  imageTransform,
  isImageVisible,
  labelTextPlacement,
  labelLines,
  polylineToPoints,
  round,
} from '../geometry'
import { siteById, siteLegendBox, siteLegendLayout } from '../docModel'
import { buildLegend, resolveCallouts } from '../resolve'
import { areaCenter, areaOutlineMarkup, markMarkup, tagPartElements } from '../surface'
import type { Anchor, Area, Box, DrawerDoc, DrawingElement, MappingValue, ResolvedCallout, Site, SurfaceMark, TextAnnotation } from '../types'

export type SurfaceConnections = 'none' | 'active' | 'selected' | 'all'

/**
 * Viewer state drawn on top of the document — what a form (or any viewer)
 * has selected, valued and marked. Everything is optional; with no state the
 * export is exactly the static document.
 */
export interface SurfaceState {
  selectedSiteIds?: readonly string[]
  selectedAreaIds?: readonly string[]
  /** colour per selected site/area id; wins over selectedColor */
  colors?: Record<string, string>
  selectedColor?: string
  /** colour of unselected site markers (default: each callout's own) */
  markerColor?: string
  /** values by site id, read by a "values" view and (with legendValues) the legend */
  siteValues?: Record<string, MappingValue>
  legendValues?: boolean
  /** text a "values" view shows for a site without a value (default an em dash) */
  emptyValueText?: string
  marks?: readonly SurfaceMark[]
  activeSiteId?: string | null
  connections?: SurfaceConnections
  /** outline drawn areas: always, only when selected, or never (they stay clickable) */
  areaOutlines?: 'always' | 'selected' | 'never'
  areaLabels?: boolean
  /** focusable, clickable targets (role/tabindex/aria) for a live renderer */
  interactive?: { sites?: boolean; areas?: boolean }
}

export interface ExportOptions {
  /** Explicit output crop; callers must ensure it contains the labels/legend. */
  viewBox?: Box
  viewId?: string
  includeMetadata?: boolean
  includeAnchors?: boolean
  includeLegend?: boolean
  background?: string | null
  /** layers; all default to shown */
  showSiteMarkers?: boolean
  showCallouts?: boolean
  showTexts?: boolean
  showGuides?: boolean
  showSiteLegend?: boolean
  showAreas?: boolean
  /** override the view's black-lines setting */
  mono?: boolean
  /** override the document's export frame */
  frame?: 'page' | 'content'
  state?: SurfaceState
  /** omit the XML prolog (for inline HTML) */
  omitProlog?: boolean
  /** width 100% / height auto instead of a bare viewBox */
  responsive?: boolean
  /** fixed pixel size = viewBox size × scale */
  scale?: number
  /** id on the root <svg>; scopes the state stylesheet */
  rootId?: string
  /** return the state stylesheet as `css` instead of a <style> inside the SVG (live renderers) */
  externalStyle?: boolean
}

export const DEFAULT_SELECTED_COLOR = '#c50f1f'
const LEGEND_VALUE_SCALE = 0.72

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
  texts: TextAnnotation[] = doc.textAnnotations.filter((t) => isImageVisible(doc, t.imageId)),
  guides: DrawingElement[] = doc.drawingElements.filter((d) => isImageVisible(doc, d.imageId)),
  withSiteLegend = true,
): Box {
  const raw = diagramContentBounds(docContentBox(doc), resolved, fontSize, texts, guides)
  const legend = withSiteLegend ? siteLegendBox(doc) : null
  if (legend) {
    const x2 = Math.max(raw.x + raw.w, legend.x + legend.w)
    const y2 = Math.max(raw.y + raw.h, legend.y + legend.h)
    raw.x = Math.min(raw.x, legend.x)
    raw.y = Math.min(raw.y, legend.y)
    raw.w = x2 - raw.x
    raw.h = y2 - raw.y
  }
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

interface CalloutState {
  selected: boolean
  interactive: boolean
  ariaLabel?: string
}

function renderCallout(
  c: ResolvedCallout,
  anchor: Anchor | undefined,
  baseName: string,
  fontSize: number,
  opts: ExportOptions,
  site?: Site,
  state?: CalloutState,
): string {
  const fs = c.fontSize || fontSize
  const geo = buildLeader(c, fs)
  const tp = labelTextPlacement(c, geo)
  const col = esc(c.color)
  const parts: string[] = []
  const anc = c.anchorPoint
  const fromPoint = geo.points[1] ?? c.labelPos
  const dashAttr = c.dashed ? ` stroke-dasharray="${round(fs * 0.5)} ${round(fs * 0.36)}"` : ''

  if (state?.interactive && site) {
    // a generous, invisible hit and focus target around the marker
    parts.push(`<circle class="drawer-hit" cx="${round(c.labelPos.x)}" cy="${round(c.labelPos.y)}" r="${round(Math.max(geo.radius * 1.55, fs * 0.9))}" fill="transparent" stroke="none" pointer-events="all"/>`)
  }
  if (geo.points.length) {
    parts.push(
      `<polyline points="${polylineToPoints(geo.points)}" fill="none" stroke="${col}" stroke-width="${round(c.leaderWidth)}" stroke-linejoin="round" stroke-linecap="round"${dashAttr}/>`,
    )
  }
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
  if (state?.selected) {
    // a halo keeps a selection readable in black-and-white print
    parts.push(`<circle class="drawer-selected-ring" cx="${round(c.labelPos.x)}" cy="${round(c.labelPos.y)}" r="${round(geo.radius + Math.max(2.5, fs * 0.22))}" fill="none" stroke="${col}" stroke-width="${round(Math.max(1.5, fs * 0.12))}"/>`)
  }
  const balloonClass = state ? ' class="drawer-balloon"' : ''
  if (c.balloonShape === 'circle') {
    parts.push(
      `<circle${balloonClass} cx="${round(c.labelPos.x)}" cy="${round(c.labelPos.y)}" r="${round(geo.radius)}" fill="#fff" stroke="${col}" stroke-width="${round(c.leaderWidth)}"/>`,
    )
  } else if (c.balloonShape === 'hex') {
    parts.push(
      `<polygon${balloonClass} points="${hexPoints(c.labelPos, geo.radius)}" fill="#fff" stroke="${col}" stroke-width="${round(c.leaderWidth)}"/>`,
    )
  } else if (c.balloonShape === 'badge') {
    parts.push(
      `<circle${balloonClass} cx="${round(c.labelPos.x)}" cy="${round(c.labelPos.y)}" r="${round(geo.radius)}" fill="${col}" stroke="#fff" stroke-width="${round(c.leaderWidth)}"/>`,
    )
  }
  if (c.balloonShape !== 'none' && c.balloonText) {
    const badge = c.balloonShape === 'badge'
    parts.push(
      `<text x="${round(c.labelPos.x)}" y="${round(c.labelPos.y)}" text-anchor="middle" dominant-baseline="central" font-size="${round(fs * (badge ? 1.05 : 0.82))}" font-weight="${c.fontWeight}" fill="${badge ? '#fff' : col}">${esc(c.balloonText)}</text>`,
    )
  }
  if (c.labelText) {
    const fill = state?.selected ? col : '#111'
    const weight = state?.selected ? 700 : c.fontWeight
    parts.push(
      `<text x="${round(tp.x)}" y="${round(tp.y)}" text-anchor="${tp.anchor}" dominant-baseline="central" font-size="${round(fs)}" font-weight="${weight}" fill="${fill}">${labelLines(c.labelText, fs).map((line) => `<tspan x="${round(tp.x)}" y="${round(tp.y + line.dy)}">${esc(line.text)}</tspan>`).join('')}</text>`,
    )
  }

  let attrs = state && site ? `class="callout site-marker" data-callout-id="${esc(c.id)}"` : `class="callout" data-callout-id="${esc(c.id)}"`
  if (opts.includeMetadata !== false) {
    attrs += ` data-name="${esc(baseName)}" data-anchor-x="${round(c.anchorPoint.x)}" data-anchor-y="${round(c.anchorPoint.y)}"`
    if (c.imageId) attrs += ` data-image-id="${esc(c.imageId)}"`
    if (site) attrs += ` data-site-id="${esc(site.id)}" data-site-number="${site.number}" data-field-key="${esc(site.fieldKey)}"`
    if (anchor) {
      attrs += ` data-anchor-mode="${anchor.mode}" data-anchor-id="${esc(anchor.id)}"`
      if (anchor.mapping && !site) {
        attrs += ` data-field-key="${esc(anchor.mapping.fieldKey)}"`
        if (anchor.mapping.system) attrs += ` data-code-system="${esc(anchor.mapping.system)}"`
        if (anchor.mapping.code) attrs += ` data-code="${esc(anchor.mapping.code)}"`
      }
      // Attached reference images remain in project JSON, not in published SVGs.
      if (anchor.mode === 'relative-bbox' && anchor.relative) {
        attrs += ` data-target="${esc(anchor.relative.targetId ?? '')}" data-nx="${round(anchor.relative.nx)}" data-ny="${round(anchor.relative.ny)}"`
      }
    }
  } else if (site && state) {
    attrs += ` data-site-id="${esc(site.id)}"`
  }
  let title = ''
  if (site && state) {
    if (state.selected) attrs += ` data-selected="true"`
    if (state.interactive) {
      attrs += ` role="button" tabindex="0" aria-pressed="${state.selected}" aria-label="${esc(state.ariaLabel ?? site.label)}"`
      title = `<title>${esc(state.ariaLabel ?? site.label)}</title>`
    }
  }
  return `  <g ${attrs}>${title ? `\n    ${title}` : ''}\n    ${parts.join('\n    ')}\n  </g>`
}

function renderLegend(
  doc: DrawerDoc,
  bounds: Box,
  fontSize: number,
  viewId?: string,
  legendWidth = fontSize * 12,
  legend = buildLegend(doc, viewId),
): string {
  if (!legend.length) return ''
  const x = bounds.x + bounds.w - legendWidth + fontSize
  let y = bounds.y + fontSize * 1.5
  const lines = legend
    .map((l) => {
      const lines = l.name.replace(/\r\n?/g, '\n').split('\n').map((text, i) => {
        const line = `<text x="${round(x)}" y="${round(y)}" font-size="${round(fontSize * 0.85)}" fill="#111">${i === 0 ? `${l.index}. ` : ''}${esc(text)}</text>`
        y += fontSize * 1.1
        return line
      })
      y += fontSize * 0.35
      return lines.join('\n    ')
    })
    .join('\n    ')
  return `  <g class="legend">\n    ${lines}\n  </g>`
}

function valueText(value: MappingValue | undefined): string {
  if (value === undefined || value === null || value === '' || value === false || value === true) return ''
  return String(value)
}

interface LegendRow {
  siteId: string
  x: number
  y: number
  top: number
  height: number
  text: string
  fontSize: number
  value: string
  width: number
}

/** Legend rows with their (estimated) text widths, including appended values. */
function legendRows(doc: DrawerDoc, state: SurfaceState | undefined): LegendRow[] {
  const layout = siteLegendLayout(doc)
  if (!layout) return []
  const selected = new Set(state?.selectedSiteIds ?? [])
  return layout.rows.map((r) => {
    const value = state?.legendValues ? valueText(state.siteValues?.[r.siteId]) : ''
    const width = r.text.length * r.fontSize * (selected.has(r.siteId) ? 0.6 : 0.56) + (value ? (value.length + 3) * r.fontSize * LEGEND_VALUE_SCALE * 0.6 : 0)
    return { ...r, value, width }
  })
}

/** The numbered site list, positioned where the editor shows it. */
function renderSiteLegend(doc: DrawerDoc, state?: SurfaceState, ariaFor?: (site: Site) => string): string {
  const layout = siteLegendLayout(doc)
  if (!layout) return ''
  const h = layout.heading
  if (!state) {
    const lines = [
      `<text x="${round(h.x)}" y="${round(h.y)}" font-size="${round(h.fontSize)}" font-weight="700" fill="#181818">${esc(h.text)}</text>`,
      ...layout.rows.map((r) => `<text x="${round(r.x)}" y="${round(r.y)}" font-size="${round(r.fontSize)}" fill="#181818" data-site-id="${esc(r.siteId)}">${esc(r.text)}</text>`),
    ]
    return `  <g class="site-legend">\n    ${lines.join('\n    ')}\n  </g>`
  }
  const box = siteLegendBox(doc)!
  const selected = new Set(state.selectedSiteIds ?? [])
  const interactive = !!state.interactive?.sites
  const rows = legendRows(doc, state).map((r) => {
    const isSelected = selected.has(r.siteId)
    const colour = esc(state.colors?.[r.siteId] || state.selectedColor || DEFAULT_SELECTED_COLOR)
    const pad = r.fontSize * 0.25
    const label = r.value
      ? `${esc(r.text)}<tspan font-size="${round(r.fontSize * LEGEND_VALUE_SCALE)}" font-weight="600"> — ${esc(r.value)}</tspan>`
      : esc(r.text)
    const rect = isSelected
      ? `<rect class="drawer-legend-highlight" x="${round(r.x - pad)}" y="${round(r.top - pad * 0.6)}" width="${round(Math.max(box.w, r.width) + pad * 2)}" height="${round(r.height * 0.92)}" rx="${round(pad)}" fill="${colour}" fill-opacity="0.12"/>`
      : interactive
        ? `<rect class="drawer-hit" x="${round(r.x - pad)}" y="${round(r.top - pad * 0.6)}" width="${round(box.w + pad * 2)}" height="${round(r.height * 0.92)}" fill="transparent" pointer-events="all"/>`
        : ''
    const site = siteById(doc, r.siteId)
    const attrs = ` class="site-legend-row" data-site-id="${esc(r.siteId)}"${isSelected ? ' data-selected="true"' : ''}${interactive && site ? ` role="button" tabindex="0" aria-pressed="${isSelected}" aria-label="${esc(ariaFor ? ariaFor(site) : site.label)}"` : ''}`
    return `<g${attrs}>${rect}<text x="${round(r.x)}" y="${round(r.y)}" font-size="${round(r.fontSize)}" font-weight="${isSelected ? 700 : 400}" fill="${isSelected ? colour : '#181818'}">${label}</text></g>`
  })
  return `  <g class="site-legend">\n    <text x="${round(h.x)}" y="${round(h.y)}" font-size="${round(h.fontSize)}" font-weight="700" fill="#181818">${esc(h.text)}</text>\n    ${rows.join('\n    ')}\n  </g>`
}

/** Placed images, bottom to top, each in its own transformed group. */
function renderImages(doc: DrawerDoc, partTags?: Map<string, Record<string, string>>): string {
  return doc.images
    .filter((i) => i.visible !== false)
    .map((i) => `<g class="image" data-image-id="${esc(i.id)}" data-image-name="${esc(i.name)}" transform="${imageTransform(i)}">${partTags?.has(i.id) ? tagPartElements(i.drawing.inner, partTags.get(i.id)!) : i.drawing.inner}</g>`)
    .join('')
}

/** Drawn areas (parts are tagged in the artwork instead), selection-aware. */
function renderAreas(doc: DrawerDoc, state: SurfaceState | undefined, areas: Area[]): string {
  const selected = new Set(state?.selectedAreaIds ?? [])
  const outlines = state?.areaOutlines ?? 'always'
  const interactive = !!state?.interactive?.areas
  const fs = fontSizeFor(doc.base.viewBox)
  const out: string[] = []
  for (const area of areas) {
    const isSelected = selected.has(area.id)
    const colour = esc(state?.colors?.[area.id] || state?.selectedColor || DEFAULT_SELECTED_COLOR)
    if (area.shape.kind !== 'part') {
      const show = outlines === 'always' || (outlines === 'selected' && isSelected)
      const paint = isSelected
        ? `fill="${colour}" fill-opacity="0.32" stroke="${colour}" stroke-width="1.5" vector-effect="non-scaling-stroke"`
        : show
          ? 'fill="#ffffff" fill-opacity="0.18" stroke="#374151" stroke-width="1" vector-effect="non-scaling-stroke"'
          : 'fill="transparent" stroke="none"'
      const aria = interactive ? ` role="button" tabindex="0" aria-pressed="${isSelected}" aria-label="${esc(area.label)}"` : ''
      const attrs = `class="drawer-area" data-area-id="${esc(area.id)}"${area.fieldKey ? ` data-field-key="${esc(area.fieldKey)}"` : ''}${isSelected ? ' data-selected="true"' : ''}${aria} ${paint}${interactive ? ' pointer-events="all"' : ''}`
      const shape = areaOutlineMarkup(doc, area, attrs)
      out.push(interactive ? shape.replace(/<(rect|ellipse|polygon)( [^>]*?)\/>/, (_m, tag: string, rest: string) => `<${tag}${rest}><title>${esc(area.label)}</title></${tag}>`) : shape)
    }
    if (state?.areaLabels) {
      const c = areaCenter(doc, area)
      out.push(`<text class="drawer-area-label" x="${round(c.x)}" y="${round(c.y)}" text-anchor="middle" dominant-baseline="central" font-size="${round(fs * 0.7)}" font-weight="700" fill="${isSelected ? colour : '#1f2937'}" pointer-events="none">${esc(area.label)}</text>`)
    }
  }
  return out.length ? `  <g class="drawer-areas">${out.join('')}</g>` : ''
}

/** Serialize the document (for a given view) into a standalone static SVG. */
export function exportSvg(doc: DrawerDoc, opts: ExportOptions = {}): string {
  return renderSvg(doc, opts).svg
}

/** exportSvg plus the viewBox and pixel size it chose. */
export function renderSvg(doc: DrawerDoc, opts: ExportOptions = {}): { svg: string; viewBox: Box; width: number; height: number; css: string } {
  const state = opts.state
  const surface = !!state || opts.showSiteMarkers === false || opts.showCallouts === false || opts.showTexts === false ||
    opts.showGuides === false || opts.showSiteLegend === false || opts.mono !== undefined || !!opts.frame
  const view = doc.views.find((v) => v.id === (opts.viewId ?? doc.activeViewId)) ?? doc.views[0]

  // Values by site id become Drawer's mappingValues (keyed by field key), and
  // a black-lines override applies to the chosen view only.
  let renderDoc = doc
  if (state?.siteValues || opts.mono !== undefined) {
    const mappingValues: Record<string, MappingValue> = { ...(doc.mappingValues ?? {}) }
    if (state?.siteValues) {
      for (const site of doc.sites ?? []) {
        const v = state.siteValues[site.id]
        if (v === true) mappingValues[site.fieldKey] = '✓'
        else if (valueText(v)) mappingValues[site.fieldKey] = valueText(v)
        else delete mappingValues[site.fieldKey]
      }
    }
    renderDoc = {
      ...doc,
      mappingValues,
      views: doc.views.map((v) => (v.id === view?.id && opts.mono !== undefined ? { ...v, mono: opts.mono } : v)),
    }
  }

  const all = resolveCallouts(renderDoc, opts.viewId)
  const resolved = surface ? all.filter((c) => (c.siteId ? opts.showSiteMarkers !== false : opts.showCallouts !== false)) : all
  if (state?.emptyValueText !== undefined && (view?.siteDisplay ?? 'numbers') === 'values') {
    for (const c of resolved) if (c.siteId && c.labelText === '—') c.labelText = state.emptyValueText
  }
  const selectedSites = new Set(state?.selectedSiteIds ?? [])
  if (state) {
    for (const c of resolved) {
      if (!c.siteId) continue
      if (selectedSites.has(c.siteId)) c.color = state.colors?.[c.siteId] || state.selectedColor || DEFAULT_SELECTED_COLOR
      else if (state.markerColor) c.color = state.markerColor
    }
  }

  const fontSize = fontSizeFor(doc.base.viewBox)
  const texts = opts.showTexts === false ? [] : doc.textAnnotations.filter((t) => isImageVisible(doc, t.imageId))
  const guides = opts.showGuides === false ? [] : doc.drawingElements.filter((d) => isImageVisible(doc, d.imageId))
  const showSiteLegend = opts.showSiteLegend !== false
  const wantLegend =
    (opts.includeLegend ?? doc.views.find((v) => v.id === (opts.viewId ?? doc.activeViewId))?.labelMode !== 'names') && opts.showCallouts !== false
  const legendItems = wantLegend ? buildLegend(renderDoc, opts.viewId).filter((l) => resolved.some((r) => r.index === l.index && !r.siteId)) : []
  const legendLines = legendItems.flatMap((item) => item.name.replace(/\r\n?/g, '\n').split('\n'))
  const legendCount = legendLines.length + legendItems.length * 0.35
  const longestLegendLine = Math.max(0, ...legendLines.map((line) => line.length + 3))
  const legendWidth = legendCount ? Math.max(fontSize * 12, longestLegendLine * fontSize * 0.85 * 0.66 + fontSize * 2) : 0
  const frame = opts.frame ?? doc.exportFrame
  let bounds = opts.viewBox ?? (frame === 'page' && !legendCount ? { ...doc.base.viewBox } : computeBounds(doc, resolved, fontSize, legendWidth, legendCount, texts, guides, showSiteLegend))
  if (state?.legendValues && showSiteLegend && !opts.viewBox) {
    // widen rather than clip a long value appended to a legend row
    const right = Math.max(-Infinity, ...legendRows(doc, state).map((r) => r.x + r.width + r.fontSize * 0.5))
    if (right > bounds.x + bounds.w) bounds = { ...bounds, w: round(right - bounds.x) }
  }
  if (![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) || bounds.w <= 0 || bounds.h <= 0) {
    throw new Error('Invalid export viewBox.')
  }

  const bg =
    opts.background === null
      ? ''
      : `  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="${esc(opts.background ?? '#ffffff')}"/>\n`

  const ariaFor = (site: Site) => {
    const v = valueText(state?.siteValues?.[site.id])
    const sel = selectedSites.has(site.id)
    return `${site.number}. ${site.label}${sel ? (v ? `, ${v}` : ', selected') : ''}`
  }

  const callouts = resolved
    .filter((c) => c.visible)
    .map((c) => {
      const site = siteById(doc, c.siteId)
      return renderCallout(
        c,
        doc.anchors.find((a) => a.id === c.anchorId),
        doc.callouts.find((b) => b.id === c.id)?.labelText ?? c.labelText,
        fontSize,
        opts,
        site,
        state ? { selected: !!site && selectedSites.has(site.id), interactive: !!state.interactive?.sites, ariaLabel: site ? ariaFor(site) : undefined } : undefined,
      )
    })
    .join('\n')

  const legend = wantLegend ? renderLegend(renderDoc, bounds, fontSize, opts.viewId, legendWidth, legendItems) : ''
  const textAnnotations = texts.map(renderTextAnnotation).join('\n')
  const drawingElements = guides.map(renderDrawingElement).join('\n')
  const siteLegend = showSiteLegend ? renderSiteLegend(doc, state, ariaFor) : ''

  // --- surface: areas, marks, connection lines (only with state / areas) ---
  const areas = opts.showAreas === false ? [] : (doc.areas ?? []).filter((a) => isImageVisible(doc, a.imageId))
  let partTags: Map<string, Record<string, string>> | undefined
  let stateStyle = ''
  let stateCss = ''
  if (state && areas.some((a) => a.shape.kind === 'part')) {
    partTags = new Map()
    const selectedAreas = new Set(state.selectedAreaIds ?? [])
    const rules: string[] = []
    const scope = opts.rootId ? `#${opts.rootId} ` : ''
    for (const a of areas) {
      if (a.shape.kind !== 'part' || !a.imageId) continue
      const sel = selectedAreas.has(a.id)
      const aria = state.interactive?.areas ? ` role="button" tabindex="0" aria-pressed="${sel}" aria-label="${esc(a.label)}"` : ''
      const tags = partTags.get(a.imageId) ?? {}
      tags[a.shape.targetId] = `data-area-id="${esc(a.id)}"${sel ? ' data-selected="true"' : ''}${aria}`
      partTags.set(a.imageId, tags)
      if (sel) {
        const colour = (state.colors?.[a.id] || state.selectedColor || DEFAULT_SELECTED_COLOR).replace(/[^#\w(),.%\s-]/g, '')
        rules.push(`${scope}[data-area-id="${a.id.replace(/["\\]/g, '')}"],${scope}[data-area-id="${a.id.replace(/["\\]/g, '')}"] *{fill:${colour}!important;fill-opacity:.45!important;stroke:${colour}!important}`)
      }
    }
    // CDATA keeps every parser (HTML innerHTML, XML, test DOMs) treating the
    // rules as text
    if (rules.length) {
      stateCss = rules.join('')
      if (!opts.externalStyle) stateStyle = `  <style><![CDATA[${stateCss}]]></style>\n`
    }
  }
  const areaMarkup = surface || areas.length ? renderAreas(doc, state, areas) : ''
  const marks = (state?.marks ?? []).filter((m) => isImageVisible(doc, m.imageId)).map((m) => markMarkup(doc, m)).join('')
  let connectionLines = ''
  const mode = state?.connections ?? 'none'
  const layout = showSiteLegend ? siteLegendLayout(doc) : null
  if (state && mode !== 'none' && layout) {
    const rowBySite = new Map(layout.rows.map((r) => [r.siteId, r]))
    const wanted = (siteId: string) => mode === 'all' || (mode === 'selected' && selectedSites.has(siteId)) || (mode === 'active' && state.activeSiteId === siteId)
    const lines: string[] = []
    for (const c of resolved) {
      if (!c.visible || !c.siteId || !wanted(c.siteId)) continue
      const row = rowBySite.get(c.siteId)
      if (!row) continue
      const end = { x: row.x - row.fontSize * 0.35, y: row.y - row.fontSize * 0.35 }
      lines.push(`<line class="drawer-connection" data-site-id="${esc(c.siteId)}" x1="${round(c.labelPos.x)}" y1="${round(c.labelPos.y)}" x2="${round(end.x)}" y2="${round(end.y)}" stroke="${esc(c.color)}" stroke-width="${round(Math.max(1.2, fontSize * 0.07))}" stroke-dasharray="${round(fontSize * 0.4)} ${round(fontSize * 0.3)}" stroke-opacity="0.75" pointer-events="none"/>`)
    }
    if (lines.length) connectionLines = `  <g class="drawer-connections">${lines.join('')}</g>`
  }

  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1
  const width = Math.round(bounds.w * scale)
  const height = Math.round(bounds.h * scale)
  const size = opts.responsive ? ` width="100%" style="display:block;height:auto;max-width:100%"` : opts.scale ? ` width="${width}" height="${height}"` : ''
  const rootId = opts.rootId ? ` id="${esc(opts.rootId)}"` : ''
  const interactiveRoot = state?.interactive?.sites || state?.interactive?.areas
  const role = state ? (interactiveRoot ? ` role="group" aria-label="${esc(doc.name)}"` : ` role="img" aria-label="${esc(doc.name)}"`) : ''
  const title = interactiveRoot ? '' : `  <title>${esc(doc.name)}</title>\n`
  const prolog = opts.omitProlog ? '' : '<?xml version="1.0" encoding="UTF-8"?>\n'

  const svg = `${prolog}<svg xmlns="http://www.w3.org/2000/svg"${rootId} viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}"${size} font-family="${FONT_FAMILY}" data-generator="drawer" data-doc-name="${esc(doc.name)}"${state ? ` data-view-id="${esc(view?.id ?? '')}"` : ''}${role}>
${title}${stateStyle}${bg}  <g class="body-layer">${doc.base.inner}${renderImages(doc, partTags)}</g>
${areaMarkup ? `${areaMarkup}\n` : ''}${drawingElements}
${textAnnotations}
${connectionLines ? `${connectionLines}\n` : ''}${siteLegend}
${callouts}
${legend}
${marks ? `  <g class="drawer-marks">${marks}</g>\n` : ''}</svg>
`
  return { svg, viewBox: bounds, width, height, css: stateCss }
}
