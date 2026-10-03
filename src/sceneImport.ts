import { pageDrawing, SITE_MARKER_STYLE } from './docModel'
import { boxForTarget, imageToPage, pointToNormalized } from './geometry'
import { parseSvg } from './svgParse'
import type {
  Anchor,
  BaseDrawing,
  Callout,
  CalloutOverride,
  DrawerDoc,
  DrawingElement,
  ImageInstance,
  MappingValue,
  Site,
  TextAnnotation,
  View,
} from './types'

// ---------------------------------------------------------------------------
// Import a `drawer-scene` file (the multi-image format the standalone diorama
// composer used) as a regular Drawer document. Images, the shared site table,
// marker placements, anatomy labels, text and the legend all become native,
// editable objects; nothing is kept in a side format.
// ---------------------------------------------------------------------------

export const SCENE_FORMAT = 'drawer-scene'

export function isSceneFile(value: unknown): boolean {
  return !!value && typeof value === 'object' && (value as { format?: unknown }).format === SCENE_FORMAT
}

type Obj = Record<string, unknown>
const obj = (v: unknown, what: string): Obj => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`Invalid ${what}.`)
  return v as Obj
}
const list = (v: unknown, what: string, max: number): unknown[] => {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > max) throw new Error(`Invalid ${what}; at most ${max} allowed.`)
  return v
}
const num = (v: unknown, what: string, min = -1e5, max = 1e5): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${what} must be a number from ${min} to ${max}.`)
  return v
}
const text = (v: unknown, what: string, max = 2000): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error(`Invalid ${what}.`)
  return v
}
const ident = (v: unknown): string => {
  const s = text(v, 'ID', 80)
  if (!/^[A-Za-z][\w-]*$/.test(s)) throw new Error('Scene IDs must begin with a letter and contain only letters, numbers, underscores or hyphens.')
  return s
}
const unique = (ids: string[], what: string) => {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${what} IDs.`)
}

/** Parse an asset's inner markup as a sanitized drawing in its own 0..w × 0..h space. */
export function parseSceneAsset(inner: string, width: number, height: number): BaseDrawing {
  return parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${inner}</svg>`)
}

/**
 * Convert a parsed scene file into a DrawerDoc. `parseDrawing` turns asset
 * markup into a sanitized, measured drawing (injected so the conversion can be
 * tested without a DOM).
 */
export function sceneToDoc(
  input: unknown,
  parseDrawing: (inner: string, width: number, height: number) => BaseDrawing = parseSceneAsset,
): DrawerDoc {
  const scene = obj(input, 'scene')
  if (scene.format !== SCENE_FORMAT || scene.version !== 1) throw new Error('Expected a drawer-scene version 1 file.')
  const sceneId = ident(scene.id)
  const name = text(scene.name, 'scene name', 240)
  const width = num(scene.width, 'Page width', 100, 12000)
  const height = num(scene.height, 'Page height', 100, 12000)

  // assets: one sanitized drawing each (copied into every image that uses it)
  const assets = new Map<string, { name: string; width: number; height: number; drawing: BaseDrawing; source: string }>()
  for (const raw of list(scene.assets, 'assets', 100)) {
    const a = obj(raw, 'asset')
    const id = ident(a.id)
    if (assets.has(id)) throw new Error('Duplicate asset IDs.')
    const w = num(a.width, 'Asset width', 1, 12000)
    const h = num(a.height, 'Asset height', 1, 12000)
    assets.set(id, {
      name: text(a.name, 'asset name', 240),
      width: w,
      height: h,
      drawing: parseDrawing(text(a.inner, 'asset markup', 3_000_000), w, h),
      source: a.source === undefined ? '' : text(a.source, 'asset source', 1000),
    })
  }

  const images: ImageInstance[] = []
  for (const raw of list(scene.images, 'images', 100)) {
    const i = obj(raw, 'image')
    const asset = assets.get(String(i.assetId))
    if (!asset) throw new Error(`Image ${String(i.id)} refers to a missing asset.`)
    images.push({
      id: ident(i.id),
      name: text(i.name, 'image name', 240),
      drawing: structuredClone(asset.drawing),
      x: num(i.x, 'Image x'),
      y: num(i.y, 'Image y'),
      width: num(i.width, 'Image width', 1, 12000),
      height: num(i.height, 'Image height', 1, 12000),
      rotation: num(i.rotation ?? 0, 'Rotation', -3600, 3600),
      visible: i.visible === undefined ? true : Boolean(i.visible),
      locked: Boolean(i.locked),
      ...(asset.source ? { source: asset.source } : {}),
    })
  }
  unique(images.map((i) => i.id), 'image')
  const imageById = new Map(images.map((i) => [i.id, i]))
  const assetSize = (image: ImageInstance) => image.drawing.viewBox

  const sites: Site[] = []
  const mappingValues: Record<string, MappingValue> = {}
  for (const raw of list(scene.sites, 'sites', 500)) {
    const r = obj(raw, 'site')
    const number = num(r.number, 'Site number', 1, 9999)
    if (!Number.isInteger(number)) throw new Error('Site numbers must be whole numbers.')
    const fieldKey = text(r.fieldKey, 'field key', 200)
    if (!fieldKey.trim() || ['__proto__', 'prototype', 'constructor'].includes(fieldKey)) throw new Error('Invalid field key.')
    const value = r.value ?? null
    if (!(value === null || typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))) {
      throw new Error('Site values must be text, finite numbers, true/false or empty.')
    }
    if (value !== null) mappingValues[fieldKey] = value as MappingValue
    sites.push({ id: ident(r.id), number, label: text(r.label, 'site label', 240), fieldKey })
  }
  unique(sites.map((s) => s.id), 'site')
  if (new Set(sites.map((s) => s.number)).size !== sites.length) throw new Error('Site numbers must be unique.')
  if (new Set(sites.map((s) => s.fieldKey)).size !== sites.length) throw new Error('Each site needs a unique field key.')
  const siteById = new Map(sites.map((s) => [s.id, s]))

  const anchors: Anchor[] = []
  const callouts: Callout[] = []
  const hidden: string[] = []

  // relative anchor on the whole drawing from scene u/v (fractions of the asset frame)
  const anchorAt = (id: string, image: ImageInstance, u: number, v: number): Anchor => {
    const vb = assetSize(image)
    const local = { x: vb.x + u * vb.w, y: vb.y + v * vb.h }
    return { id, mode: 'relative-bbox', imageId: image.id, relative: { targetId: null, ...pointToNormalized(local, boxForTarget(image.drawing, null)) } }
  }
  const pagePoint = (image: ImageInstance, u: number, v: number) => {
    const vb = assetSize(image)
    return imageToPage(image, { x: vb.x + u * vb.w, y: vb.y + v * vb.h })
  }

  for (const raw of list(scene.links, 'connections', 2000)) {
    const l = obj(raw, 'connection')
    const id = ident(l.id)
    const image = imageById.get(String(l.imageId))
    const site = siteById.get(String(l.siteId))
    if (!image || !site) throw new Error(`Connection ${id} has a missing image or site.`)
    const u = num(l.u, 'Connection u', 0, 1)
    const v = num(l.v, 'Connection v', 0, 1)
    const radius = num(l.radius ?? 13, 'Marker radius', 2, 80)
    const anchor = anchorAt(`anchor-${id}`, image, u, v)
    anchors.push(anchor)
    callouts.push({
      id: `callout-${id}`,
      anchorId: anchor.id,
      siteId: site.id,
      labelText: site.label,
      balloonText: String(site.number),
      ...SITE_MARKER_STYLE,
      // a badge's radius is 0.95 × its font size (see balloonRadius)
      fontSize: Math.round((radius / 0.95) * 100) / 100,
      labelPos: pagePoint(image, u, v),
      elbow: null,
      color: '#111111',
    })
    if (l.visible === false) hidden.push(`callout-${id}`)
  }

  for (const raw of list(scene.annotations, 'anatomy labels', 1000)) {
    const a = obj(raw, 'anatomy label')
    const id = ident(a.id)
    const image = imageById.get(String(a.imageId))
    if (!image) throw new Error('An anatomy label refers to a missing image.')
    const fontSize = num(a.fontSize ?? 25, 'Label font size', 6, 120)
    const align = a.align === 'end' ? 'end' : 'start'
    const anchor = anchorAt(`anchor-${id}`, image, num(a.u, 'Label u', -4, 5), num(a.v, 'Label v', -4, 5))
    const q = pagePoint(image, num(a.labelU, 'Label u', -4, 5), num(a.labelV, 'Label v', -4, 5))
    // the leader stops just short of the text, as in the source layout
    const end = { x: q.x + (align === 'end' ? 7 : -7), y: q.y - 5 }
    anchors.push(anchor)
    callouts.push({
      id: `callout-${id}`,
      anchorId: anchor.id,
      labelText: text(a.label, 'anatomy label', 240),
      balloonShape: 'none',
      balloonText: '',
      leaderStyle: 'straight',
      anchorMarker: 'none',
      leaderEnd: 'none',
      dashed: false,
      leaderWidth: 1.8,
      fontSize,
      fontWeight: 400,
      labelPos: end,
      // scene text sits on a baseline; Drawer centers text vertically
      labelOffset: { x: q.x - end.x, y: q.y - fontSize * 0.35 - end.y },
      labelAlign: align,
      elbow: null,
      color: '#333333',
    })
  }

  const textAnnotations: TextAnnotation[] = []
  const drawingElements: DrawingElement[] = [
    // the source sheet's top rule
    { id: 'page-rule', kind: 'line', start: { x: 30, y: 6 }, end: { x: 1507, y: 6 }, stroke: '#222222', strokeWidth: 2, dashed: false, fill: null },
  ]
  for (const raw of list(scene.texts, 'texts', 500)) {
    const t = obj(raw, 'text')
    const id = ident(t.id)
    const image = t.imageId === undefined ? undefined : imageById.get(String(t.imageId))
    if (t.imageId !== undefined && !image) throw new Error('A text item refers to a missing image.')
    const fontSize = num(t.fontSize ?? 24, 'Font size', 6, 150)
    const x = num(t.x, 'Text x')
    const y = num(t.y, 'Text y')
    const p = image ? imageToPage(image, { x: image.drawing.viewBox.x + x, y: image.drawing.viewBox.y + y }) : { x, y }
    textAnnotations.push({
      id,
      text: text(t.text, 'text'),
      pos: { x: p.x, y: p.y - fontSize * 0.35 },
      style: 'plain',
      fontSize,
      fontWeight: t.bold ? 700 : 400,
      align: 'start',
      color: '#111111',
      ruleWidth: 0,
      ...(image ? { imageId: image.id } : {}),
    })
    const ruleWidth = num(t.ruleWidth ?? 0, 'Rule width', 0, 3000)
    if (ruleWidth) {
      const offset = num(t.ruleOffsetX ?? 0, 'Rule offset', -3000, 3000)
      drawingElements.push({
        id: `rule-${id}`,
        kind: 'line',
        start: { x: p.x + offset, y: p.y + 8 },
        end: { x: p.x + offset + ruleWidth, y: p.y + 8 },
        stroke: '#555555',
        strokeWidth: 2,
        dashed: false,
        fill: null,
        ...(image ? { imageId: image.id } : {}),
      })
    }
  }

  const g = obj(scene.legend, 'legend')
  const hide: Record<string, CalloutOverride> = Object.fromEntries(hidden.map((id) => [id, { visible: false }]))
  const view = (id: string, viewName: string, siteDisplay: View['siteDisplay']): View => ({
    id, name: viewName, labelMode: 'names', siteDisplay, overrides: structuredClone(hide),
  })

  return {
    id: sceneId,
    name,
    base: pageDrawing({ x: 0, y: 0, w: width, h: height }),
    images,
    sites,
    siteLegend: {
      pos: { x: num(g.x, 'Legend x'), y: num(g.y, 'Legend y') },
      heading: text(g.heading, 'legend heading', 240),
      fontSize: num(g.fontSize, 'Legend font size', 6, 120),
      rowHeight: num(g.rowHeight, 'Legend row height', 10, 300),
      visible: g.visible === undefined ? true : Boolean(g.visible),
    },
    exportFrame: 'page',
    anchors,
    callouts,
    views: [
      view('site-numbers', 'Site numbers', 'numbers'),
      view('site-names', 'Site names', 'names'),
      view('field-values', 'Field values', 'values'),
      view('blank-markers', 'Blank markers', 'blank'),
    ],
    activeViewId: 'site-numbers',
    landmarks: [],
    textAnnotations,
    drawingElements,
    landmarkGroupOrder: [],
    hiddenLandmarkGroups: [],
    mappingValues,
  }
}
