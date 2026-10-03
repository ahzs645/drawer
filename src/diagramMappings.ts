import { boxForTarget, drawingFor, findImage, pointToNormalized, resolveAnchor } from './geometry'
import type { Anchor, AnchorAttachment, AnchorMapping, BaseDrawing, DrawerDoc, MappingMode, MappingValue } from './types'

export function diagramUid(prefix: string): string {
  return `${prefix}-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('')}`
}

export const MAX_REFERENCE_BYTES = 1024 * 1024
export const MAX_TOTAL_REFERENCE_BYTES = 2 * 1024 * 1024
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)
const record = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o)
const safeKey = (key: string) => !['__proto__', 'constructor', 'prototype'].includes(key)
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const validString = (value: unknown, max = 512) => typeof value === 'string' && value.length <= max
export const MAPPING_MODES: readonly MappingMode[] = ['label', 'mapped-label', 'value', 'label-value']

/** Values use exact flat keys (no eval, JSONPath, templates, or dotted traversal). */
export function mappedLabel(anchor: Anchor | undefined, fallback: string, mode: MappingMode = 'label', values: Record<string, MappingValue> = {}): string {
  const mapping = anchor?.mapping
  if (mode === 'label') return fallback
  const name = mapping?.display?.trim() || fallback
  if (mode === 'mapped-label') return name
  const key = mapping?.fieldKey
  const value = key && own(values, key) ? values[key] : undefined
  const text = value === undefined || value === null ? '—' : String(value)
  return mode === 'label-value' ? `${name}\n${text}` : text
}

export function setAnchorMapping(doc: DrawerDoc, id: string, mapping: AnchorMapping | undefined): DrawerDoc {
  if (!doc.anchors.some((a) => a.id === id)) throw new Error('The selected point no longer exists.')
  const next = { ...doc, anchors: doc.anchors.map((a) => a.id === id ? { ...a, mapping } : a) }
  validateDiagramExtensions(next)
  return next
}

/** Change a target without moving the point. Centering is an explicit separate action. */
export function attachAnchorToTarget(doc: DrawerDoc, id: string, targetId: string | null, center = false): DrawerDoc {
  const anchor = doc.anchors.find((a) => a.id === id)
  if (!anchor) throw new Error('The selected point no longer exists.')
  if (anchor.mode === 'path-offset') throw new Error('Path-offset attachment is not implemented; convert this anchor first.')
  // targets are elements of the drawing the point lives on
  const drawing = drawingFor(doc, anchor.imageId)
  if (targetId && !own(drawing.targetBoxes, targetId)) throw new Error(`Unknown SVG target: ${targetId}`)
  const oldTarget = anchor.relative?.targetId
  if (oldTarget && !own(drawing.targetBoxes, oldTarget) && !center) throw new Error(`Current target is missing: ${oldTarget}. Choose a new target and center explicitly.`)
  const box = boxForTarget(drawing, targetId)
  if (!(box.w > 0 && box.h > 0)) throw new Error('A target must have nonzero width and height.')
  const point = resolveAnchor(anchor, boxForTarget(drawing, oldTarget))
  const relative = { targetId, ...(center ? { nx: 0.5, ny: 0.5 } : pointToNormalized(point, box)) }
  return { ...doc, anchors: doc.anchors.map((a) => a.id === id ? { ...a, mode: 'relative-bbox', relative, absolute: undefined, pathOffset: undefined } : a) }
}

/**
 * Targets referenced by points/landmarks/part areas on one image (or, with imageId
 * undefined, on any image) that its drawing does not contain. `drawing`
 * substitutes a candidate replacement artwork for that image.
 */
export function missingTargets(doc: DrawerDoc, imageId?: string | null, drawing?: BaseDrawing): string[] {
  const missing = new Set<string>()
  const check = (owner: string | undefined, id: string | null | undefined) => {
    if (!id) return
    if (imageId !== undefined && (owner ?? null) !== imageId) return
    const boxes = (imageId !== undefined && drawing ? drawing : drawingFor(doc, owner)).targetBoxes
    if (!own(boxes, id)) missing.add(id)
  }
  for (const a of doc.anchors) check(a.imageId, a.mode === 'path-offset' ? a.pathOffset?.targetId : a.relative?.targetId)
  for (const l of doc.landmarks) check(l.imageId, l.targetId)
  for (const a of doc.areas ?? []) if (a.shape.kind === 'part') check(a.imageId, a.shape.targetId)
  return [...missing]
}

/** Swap an image's artwork; no silent fallback to the whole figure when a named target is lost. */
export function replaceImageArtwork(doc: DrawerDoc, imageId: string, drawing: BaseDrawing): DrawerDoc {
  const image = findImage(doc, imageId)
  if (!image) throw new Error('Choose an image to replace.')
  const missing = missingTargets(doc, imageId, drawing)
  if (missing.length) throw new Error(`Replacement cancelled. Missing referenced SVG targets: ${missing.join(', ')}`)
  const anchors = doc.anchors.filter((a) => a.imageId === imageId)
  if (anchors.some((a) => a.mode === 'path-offset')) throw new Error('Replacement cancelled: path-offset anchors are not supported.')
  if (anchors.some((a) => a.mode === 'absolute') && JSON.stringify(image.drawing.viewBox) !== JSON.stringify(drawing.viewBox)) {
    throw new Error('Replacement changes the coordinate system of absolute anchors. Attach them to named targets first.')
  }
  // keep the image's on-page scale: the new artwork occupies the same scale per unit
  const sx = image.width / image.drawing.viewBox.w
  const sy = image.height / image.drawing.viewBox.h
  const next = { ...image, drawing, width: drawing.viewBox.w * sx, height: drawing.viewBox.h * sy }
  return { ...doc, images: doc.images.map((i) => (i.id === imageId ? next : i)) }
}

export function rasterMime(bytes: Uint8Array): AnchorAttachment['mimeType'] | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

/** Read local raster evidence only; SVG/HTML/PDF attachments are deliberately not accepted. */
export async function readReferenceImage(file: File): Promise<AnchorAttachment> {
  if (file.size === 0 || file.size > MAX_REFERENCE_BYTES) throw new Error('Use a PNG, JPEG or WebP image up to 1 MiB.')
  const mimeType = rasterMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
  if (!mimeType) throw new Error('The file signature is not PNG, JPEG or WebP.')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mimeType};`))
    reader.readAsDataURL(file)
  })
  // Reject damaged images before storing them; no external URL is ever fetched.
  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve() : reject(new Error('Empty image.'))
    image.onerror = () => reject(new Error('This image is damaged or cannot be decoded.'))
    image.src = dataUrl
  })
  return { id: diagramUid('ref'), name: file.name.slice(0, 180), mimeType, size: file.size, dataUrl }
}

export function addReferenceImage(doc: DrawerDoc, anchorId: string, attachment: AnchorAttachment): DrawerDoc {
  if (!doc.anchors.some((a) => a.id === anchorId)) throw new Error('The selected point no longer exists.')
  const next = { ...doc, anchors: doc.anchors.map((a) => a.id === anchorId ? { ...a, attachments: [...(a.attachments ?? []), attachment] } : a) }
  validateDiagramExtensions(next)
  return next
}

/** Validate additive fields on project import and before saving edits. No code inference. */
export function validateDiagramExtensions(doc: DrawerDoc): void {
  const box = (b: unknown) => record(b) && ['x', 'y', 'w', 'h'].every((k) => finite(b[k])) && (b.w as number) > 0 && (b.h as number) > 0
  if (!box(doc.base.viewBox) || !box(doc.base.contentBox)) throw new Error('Invalid drawing coordinate box.')
  if (!Array.isArray(doc.images) || doc.images.length > 200) throw new Error('Invalid image list.')
  const imageIds = new Set<string>()
  for (const image of doc.images) {
    if (!record(image) || !validString(image.id) || imageIds.has(image.id) || !validString(image.name, 512)) throw new Error('Invalid or duplicate image ID.')
    imageIds.add(image.id)
    if (!record(image.drawing) || typeof image.drawing.inner !== 'string' || !box(image.drawing.viewBox) || !box(image.drawing.contentBox)) throw new Error(`Invalid drawing for image ${image.id}.`)
    if (![image.x, image.y, image.rotation].every((n) => finite(n) && Math.abs(n) <= 1e6) || !finite(image.width) || !finite(image.height) || image.width <= 0 || image.height <= 0) throw new Error(`Invalid placement for image ${image.id}.`)
  }
  const ownedBy = (id: unknown, what: string) => {
    if (id !== undefined && (typeof id !== 'string' || !imageIds.has(id))) throw new Error(`${what} refers to a missing image.`)
  }
  for (const l of doc.landmarks) ownedBy(l.imageId, 'A landmark')
  for (const t of doc.textAnnotations) ownedBy(t.imageId, 'A text item')
  for (const d of doc.drawingElements) ownedBy(d.imageId, 'A shape')
  const siteIds = new Set<string>()
  if (doc.sites !== undefined) {
    if (!Array.isArray(doc.sites) || doc.sites.length > 2000) throw new Error('Invalid site table.')
    const numbers = new Set<number>()
    const keys = new Set<string>()
    for (const site of doc.sites) {
      if (!record(site) || !validString(site.id) || siteIds.has(site.id) || !validString(site.label) || !validString(site.fieldKey) || !site.fieldKey || !safeKey(site.fieldKey)) throw new Error('Invalid or duplicate site.')
      if (!Number.isInteger(site.number) || site.number < 1 || site.number > 9999 || numbers.has(site.number)) throw new Error('Site numbers must be unique whole numbers from 1 to 9999.')
      if (keys.has(site.fieldKey)) throw new Error('Each site needs its own field key.')
      siteIds.add(site.id)
      numbers.add(site.number)
      keys.add(site.fieldKey)
    }
  }
  for (const c of doc.callouts) {
    if (c.siteId !== undefined && !siteIds.has(c.siteId)) throw new Error('A callout refers to a missing site.')
  }
  if (doc.siteLegend !== undefined) {
    const g = doc.siteLegend
    if (!record(g) || !record(g.pos) || !finite(g.pos.x) || !finite(g.pos.y) || !finite(g.fontSize) || g.fontSize <= 0 || !finite(g.rowHeight) || g.rowHeight <= 0 || !validString(g.heading)) throw new Error('Invalid site legend.')
  }
  if (doc.exportFrame !== undefined && !['content', 'page'].includes(doc.exportFrame)) throw new Error('Unknown export frame.')
  const anchorIds = new Set<string>()
  const attachmentIds = new Set<string>()
  let total = 0
  for (const a of doc.anchors) {
    if (!a || !validString(a.id) || anchorIds.has(a.id)) throw new Error('Invalid or duplicate anchor ID.')
    anchorIds.add(a.id)
    ownedBy(a.imageId, 'A point')
    if (a.mapping !== undefined) {
      const m = a.mapping
      if (!record(m) || !validString(m.fieldKey) || !safeKey(m.fieldKey)) throw new Error('Invalid field mapping.')
      for (const key of ['display', 'system', 'code'] as const) {
        if (m[key] !== undefined && !validString(m[key])) throw new Error(`Invalid mapping ${key}.`)
      }
    }
    if (a.attachments !== undefined && (!Array.isArray(a.attachments) || a.attachments.length > 16)) throw new Error('Invalid reference attachments.')
    for (const att of a.attachments ?? []) {
      if (!record(att) || !validString(att.id) || attachmentIds.has(att.id) || !validString(att.name, 180) || !finite(att.size) || !Number.isInteger(att.size) || att.size < 1 || att.size > MAX_REFERENCE_BYTES) throw new Error('Invalid or oversized reference attachment.')
      attachmentIds.add(att.id)
      if (typeof att.dataUrl !== 'string' || att.dataUrl.length > MAX_REFERENCE_BYTES * 1.4 + 100) throw new Error('Invalid reference data.')
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(att.dataUrl)
      if (!match || match[1] !== att.mimeType || match[2].length % 4) throw new Error('Unsafe reference MIME type or encoding.')
      const bytes = atob(match[2])
      if (bytes.length !== att.size || rasterMime(Uint8Array.from(bytes.slice(0, 12), (c) => c.charCodeAt(0))) !== att.mimeType) throw new Error('Reference size or file signature does not match.')
      total += att.size
    }
  }
  if (total > MAX_TOTAL_REFERENCE_BYTES) throw new Error('Reference images exceed the 2 MiB project limit.')
  if (doc.mappingValues !== undefined) {
    if (!record(doc.mappingValues)) throw new Error('Mapping values must be a flat JSON object.')
    for (const [key, value] of Object.entries(doc.mappingValues)) {
      if (!safeKey(key) || key.length > 512 || !(value === null || typeof value === 'boolean' || finite(value) || validString(value, 4000))) throw new Error(`Invalid mapping value: ${key}`)
    }
  }
  for (const v of doc.views) {
    if (v.mappingMode !== undefined && !MAPPING_MODES.includes(v.mappingMode)) throw new Error('Unknown mapping rendering mode.')
    if (v.siteDisplay !== undefined && !['numbers', 'names', 'values', 'blank'].includes(v.siteDisplay)) throw new Error('Unknown site display mode.')
  }
  const positions = [
    ...doc.callouts,
    ...doc.views.flatMap((v) => Object.values(v.overrides ?? {})),
  ]
  for (const item of positions) {
    if (item.labelOffset !== undefined && (!record(item.labelOffset) || !finite(item.labelOffset.x) || !finite(item.labelOffset.y))) throw new Error('Invalid label offset.')
    if (item.labelAlign !== undefined && !['start', 'middle', 'end'].includes(item.labelAlign)) throw new Error('Invalid label alignment.')
  }
}
