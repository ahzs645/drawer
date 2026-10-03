import { anchorPagePoint, fontSizeFor, isImageVisible } from './geometry'
import { DEFAULT_STYLE } from './types'
import { mappedLabel } from './diagramMappings'
import type { DrawerDoc, ResolvedCallout, Site, SiteDisplay, View } from './types'

// ---------------------------------------------------------------------------
// Merge each callout's base appearance with the active view's overrides and
// the view's label mode, producing render-ready ResolvedCallouts. Pure so the
// exporters can reuse it.
// ---------------------------------------------------------------------------

export function getView(doc: DrawerDoc, viewId?: string): View {
  const id = viewId ?? doc.activeViewId
  return doc.views.find((v) => v.id === id) ?? doc.views[0]
}

/** How site placements render in a view (see View.siteDisplay). */
export function siteDisplayFor(view: View): SiteDisplay {
  return view.siteDisplay ?? (view.labelMode === 'blank' ? 'blank' : 'numbers')
}

export function resolveCallouts(doc: DrawerDoc, viewId?: string): ResolvedCallout[] {
  const view = getView(doc, viewId)
  const anchorById = new Map(doc.anchors.map((a) => [a.id, a]))
  const siteById = new Map((doc.sites ?? []).map((s) => [s.id, s]))
  const siteDisplay = siteDisplayFor(view)
  // site placements keep their site's number; other callouts continue after them
  let visibleCount = doc.callouts.some((c) => c.siteId && siteById.has(c.siteId))
    ? Math.max(0, ...(doc.sites ?? []).map((s) => s.number))
    : 0

  return doc.callouts.map((c) => {
    const ov = view.overrides[c.id] ?? {}
    const anchor = anchorById.get(c.anchorId)
    const site = c.siteId ? siteById.get(c.siteId) : undefined
    const visible = (ov.visible ?? true) && isImageVisible(doc, anchor?.imageId)
    let index = site?.number ?? 0
    if (!site && visible) index = ++visibleCount // 1-based among visible callouts

    const anchorPoint = anchor ? anchorPagePoint(doc, anchor) : c.labelPos

    // a view can impose a style FORMAT on every callout; otherwise use the
    // callout's own base style. Per-callout overrides still win for balloonShape.
    const vs = view.style
    const leaderStyle = vs?.leaderStyle ?? c.leaderStyle
    // a balloon without a leader sits on the point it marks
    const labelPos = leaderStyle === 'none' ? anchorPoint : ov.labelPos ?? c.labelPos
    const elbow = leaderStyle === 'none' ? null : ov.elbow !== undefined ? ov.elbow : c.elbow
    let labelText = ov.labelText ?? mappedLabel(anchor, c.labelText, view.mappingMode, doc.mappingValues)
    let balloonShape = ov.balloonShape ?? vs?.balloonShape ?? c.balloonShape
    let balloonText = ov.balloonText ?? c.balloonText
    const anchorMarker = vs?.anchorMarker ?? c.anchorMarker ?? DEFAULT_STYLE.anchorMarker
    const leaderEnd = vs?.leaderEnd ?? c.leaderEnd ?? DEFAULT_STYLE.leaderEnd
    const dashed = vs?.dashed ?? c.dashed ?? DEFAULT_STYLE.dashed
    const leaderWidth = vs?.leaderWidth ?? c.leaderWidth ?? DEFAULT_STYLE.leaderWidth ?? 1.6
    const fontSize = vs?.fontSize ?? c.fontSize ?? fontSizeFor(doc.base.viewBox)
    const fontWeight = vs?.fontWeight ?? c.fontWeight ?? DEFAULT_STYLE.fontWeight ?? 500

    if (site) {
      ;({ labelText, balloonShape, balloonText } = siteContent(site, siteDisplay, balloonShape, doc))
    } else {
      switch (view.labelMode) {
        case 'names':
          // show the name; balloon is whatever the callout/override specifies
          break
        case 'numbers':
          labelText = ''
          balloonShape = balloonShape === 'none' ? 'circle' : balloonShape
          balloonText = String(index)
          break
        case 'blank':
          labelText = ''
          balloonShape = balloonShape === 'none' ? 'circle' : balloonShape
          balloonText = ''
          break
      }
    }

    return {
      id: c.id,
      anchorId: c.anchorId,
      anchorPoint,
      labelOffset: ov.labelOffset ?? c.labelOffset,
      labelAlign: ov.labelAlign ?? c.labelAlign,
      labelText,
      balloonShape,
      balloonText,
      leaderStyle,
      anchorMarker,
      leaderEnd,
      dashed,
      leaderWidth,
      fontSize,
      fontWeight,
      labelPos,
      elbow,
      // a mono view renders every callout in ink black (per-callout colors kept in the model)
      color: view.mono ? '#111111' : c.color,
      visible,
      index,
      imageId: anchor?.imageId,
      siteId: site?.id,
    }
  })
}

/** What a site placement shows: its number in the marker, plus name/value text by display mode. */
function siteContent(site: Site, display: SiteDisplay, shape: ResolvedCallout['balloonShape'], doc: DrawerDoc) {
  const balloonShape = shape === 'none' ? 'circle' : shape
  const number = String(site.number)
  switch (display) {
    case 'numbers':
      return { labelText: '', balloonShape, balloonText: number }
    case 'names':
      return { labelText: site.label, balloonShape, balloonText: number }
    case 'values': {
      const values = doc.mappingValues ?? {}
      const value = Object.prototype.hasOwnProperty.call(values, site.fieldKey) ? values[site.fieldKey] : null
      return { labelText: value === null || value === undefined ? '—' : String(value), balloonShape, balloonText: number }
    }
    case 'blank':
      return { labelText: '', balloonShape, balloonText: '' }
  }
}

/**
 * name <-> number legend for the active view (numbers / blank quiz modes).
 * Site placements are listed by the separate site legend, so they are left out.
 */
export function buildLegend(doc: DrawerDoc, viewId?: string): { index: number; name: string }[] {
  const resolved = resolveCallouts(doc, viewId)
  return resolved
    .filter((r) => r.visible && !r.siteId)
    .map((r) => {
      const base = doc.callouts.find((c) => c.id === r.id)
      return { index: r.index, name: base?.labelText ?? '' }
    })
}
