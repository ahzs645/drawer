import { boxForTarget, resolveAnchor } from './geometry'
import { DEFAULT_STYLE } from './types'
import type { DrawerDoc, ResolvedCallout, View } from './types'

// ---------------------------------------------------------------------------
// Merge each callout's base appearance with the active view's overrides and
// the view's label mode, producing render-ready ResolvedCallouts. Pure so the
// exporters can reuse it.
// ---------------------------------------------------------------------------

export function getView(doc: DrawerDoc, viewId?: string): View {
  const id = viewId ?? doc.activeViewId
  return doc.views.find((v) => v.id === id) ?? doc.views[0]
}

export function resolveCallouts(doc: DrawerDoc, viewId?: string): ResolvedCallout[] {
  const view = getView(doc, viewId)
  const anchorById = new Map(doc.anchors.map((a) => [a.id, a]))
  let visibleCount = 0

  return doc.callouts.map((c) => {
    const ov = view.overrides[c.id] ?? {}
    const visible = ov.visible ?? true
    if (visible) visibleCount += 1
    const index = visibleCount // 1-based among visible callouts

    const anchor = anchorById.get(c.anchorId)
    const box = boxForTarget(doc.base, anchor?.relative?.targetId ?? null)
    const anchorPoint = anchor ? resolveAnchor(anchor, box) : c.labelPos

    const labelPos = ov.labelPos ?? c.labelPos
    const elbow = ov.elbow !== undefined ? ov.elbow : c.elbow

    // a view can impose a style FORMAT on every callout; otherwise use the
    // callout's own base style. Per-callout overrides still win for balloonShape.
    const vs = view.style
    let labelText = ov.labelText ?? c.labelText
    let balloonShape = ov.balloonShape ?? vs?.balloonShape ?? c.balloonShape
    let balloonText = ov.balloonText ?? c.balloonText
    const leaderStyle = vs?.leaderStyle ?? c.leaderStyle
    const anchorMarker = vs?.anchorMarker ?? c.anchorMarker ?? DEFAULT_STYLE.anchorMarker
    const leaderEnd = vs?.leaderEnd ?? c.leaderEnd ?? DEFAULT_STYLE.leaderEnd
    const dashed = vs?.dashed ?? c.dashed ?? DEFAULT_STYLE.dashed

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

    return {
      id: c.id,
      anchorId: c.anchorId,
      anchorPoint,
      labelText,
      balloonShape,
      balloonText,
      leaderStyle,
      anchorMarker,
      leaderEnd,
      dashed,
      labelPos,
      elbow,
      // a mono view renders every callout in ink black (per-callout colors kept in the model)
      color: view.mono ? '#111111' : c.color,
      visible,
      index,
    }
  })
}

/** name <-> number legend for the active view (numbers / blank quiz modes). */
export function buildLegend(doc: DrawerDoc, viewId?: string): { index: number; name: string }[] {
  const resolved = resolveCallouts(doc, viewId)
  return resolved
    .filter((r) => r.visible)
    .map((r) => {
      const base = doc.callouts.find((c) => c.id === r.id)
      return { index: r.index, name: base?.labelText ?? '' }
    })
}
