import { diagramUid } from '../diagramMappings'
import { normalizeDoc } from '../docModel'
import { parseSvg } from '../svgParse'
import type { DrawerDoc } from '../types'
import { FOOT_ARTERIES_SVG } from './footArteriesArtwork'

/** User-supplied schematic, not an independently validated anatomical reference. */
export function createFootArteriesDoc(): DrawerDoc {
  const sites = [
    { id: 'posterior-tibial', name: 'Posterior tibial artery', label: 'Posterior tibial\nartery\n(behind malleolus)', labelPos: { x: 500.6, y: 146 }, elbow: { x: 491, y: 273 }, labelOffset: { x: -100.6, y: -50 }, labelAlign: 'start' as const },
    { id: 'peroneal', name: 'Peroneal artery', label: 'Peroneal\nartery', labelPos: { x: 175.4, y: 380 }, elbow: null, labelOffset: { x: 3.6, y: 2 }, labelAlign: 'end' as const },
    { id: 'anterior-tibial', name: 'Anterior tibial artery', label: 'Anterior\ntibial artery', labelPos: { x: 467.6, y: 387 }, elbow: null, labelOffset: { x: -3.6, y: 0 }, labelAlign: 'start' as const },
    { id: 'dorsalis-pedis', name: 'Dorsalis pedis artery', label: 'Dorsalis pedis\nartery', labelPos: { x: 466.335, y: 489.237 }, elbow: null, labelOffset: { x: -2.335, y: 5.763 }, labelAlign: 'start' as const },
  ]
  // built as a single-drawing document; normalizeDoc places the artwork as image 1
  return normalizeDoc({
    id: diagramUid('foot-arteries'),
    name: 'Foot arteries — source reconstruction (not clinically validated)',
    base: parseSvg(FOOT_ARTERIES_SVG),
    images: [],
    anchors: sites.map((s) => ({ id: `anchor-${s.id}`, mode: 'relative-bbox', relative: { targetId: `site-${s.id}`, nx: 0.5, ny: 0.5 } })),
    callouts: sites.map((s, i) => ({
      id: `callout-${s.id}`, anchorId: `anchor-${s.id}`, labelText: s.label,
      labelPos: s.labelPos, elbow: s.elbow, labelOffset: s.labelOffset,
      labelAlign: s.labelAlign,
      balloonShape: 'none', balloonText: String(i + 1),
      leaderStyle: s.elbow ? 'elbow' : 'straight', anchorMarker: 'dot', leaderEnd: 'none',
      color: '#111111', leaderWidth: 2.5, fontSize: 32, fontWeight: 400,
    })),
    landmarks: sites.map((s) => ({ id: `landmark-${s.id}`, name: s.name, targetId: `site-${s.id}`, nx: 0.5, ny: 0.5, group: 'Arteries — source schematic' })),
    views: [
      { id: 'source-names', name: 'Source labels', labelMode: 'names', overrides: {}, mono: true },
      { id: 'mapped-values', name: 'Mapped labels + values', labelMode: 'names', mappingMode: 'label-value', overrides: {}, mono: true },
      { id: 'numbered', name: 'Numbered', labelMode: 'numbers', overrides: {}, mono: true },
      { id: 'blank', name: 'Blank', labelMode: 'blank', overrides: {}, mono: true },
    ],
    activeViewId: 'source-names', textAnnotations: [], drawingElements: [],
    landmarkGroupOrder: ['Arteries — source schematic'], hiddenLandmarkGroups: [], mappingValues: {},
  })
}
