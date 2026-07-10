import { round } from '../geometry'
import { buildLegend, getView, resolveCallouts } from '../resolve'
import { styleFromCallout } from '../presets'
import type { DrawerDoc } from '../types'

// ---------------------------------------------------------------------------
// Companion JSON that DEFINES the callouts for an exported SVG.
//
// The SVG is the picture; this sidecar is the data — each callout's anchor
// (normalized to the body so it survives scaling), resolved point, label,
// style, and label position. Downstream tooling can re-draw or re-skin the
// annotations against the same SVG without reverse-engineering the graphics.
// ---------------------------------------------------------------------------

export interface CalloutsExportOptions {
  viewId?: string
  /** filename of the companion SVG, recorded so the two can be paired */
  svgFilename?: string
}

const FORMAT = 'drawer-callouts'
const VERSION = 1

export function exportCalloutsJson(doc: DrawerDoc, opts: CalloutsExportOptions = {}): string {
  const view = getView(doc, opts.viewId)
  const resolved = resolveCallouts(doc, opts.viewId)
  const anchorById = new Map(doc.anchors.map((a) => [a.id, a]))
  const baseById = new Map(doc.callouts.map((c) => [c.id, c]))

  const callouts = resolved.map((r) => {
    const anchor = anchorById.get(r.anchorId)
    const base = baseById.get(r.id)
    return {
      id: r.id,
      label: r.labelText,
      // the underlying (view-independent) name, handy for legends/quizzes
      name: base?.labelText ?? r.labelText,
      balloonText: r.balloonText,
      color: r.color,
      visible: r.visible,
      index: r.index,
      style: styleFromCallout(r),
      anchor: {
        mode: anchor?.mode ?? 'relative-bbox',
        targetId: anchor?.relative?.targetId ?? null,
        nx: anchor?.relative ? round(anchor.relative.nx) : null,
        ny: anchor?.relative ? round(anchor.relative.ny) : null,
        point: { x: round(r.anchorPoint.x), y: round(r.anchorPoint.y) },
      },
      labelPos: { x: round(r.labelPos.x), y: round(r.labelPos.y) },
      elbow: r.elbow ? { x: round(r.elbow.x), y: round(r.elbow.y) } : null,
    }
  })

  const file = {
    format: FORMAT,
    version: VERSION,
    name: doc.name,
    svg: opts.svgFilename ?? null,
    viewBox: doc.base.viewBox,
    view: { id: view.id, name: view.name, labelMode: view.labelMode },
    callouts,
    textAnnotations: doc.textAnnotations.map((t) => ({
      ...t,
      pos: { x: round(t.pos.x), y: round(t.pos.y) },
      fontSize: round(t.fontSize),
      ruleWidth: round(t.ruleWidth),
    })),
    legend: buildLegend(doc, opts.viewId),
  }
  return JSON.stringify(file, null, 2)
}
