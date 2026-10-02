import { boxForTarget, pointToNormalized, resolveAnchor } from './geometry'
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
  if (targetId && !own(doc.base.targetBoxes, targetId)) throw new Error(`Unknown SVG target: ${targetId}`)
  const oldTarget = anchor.relative?.targetId
  if (oldTarget && !own(doc.base.targetBoxes, oldTarget) && !center) throw new Error(`Current target is missing: ${oldTarget}. Choose a new target and center explicitly.`)
  const box = boxForTarget(doc.base, targetId)
  if (!(box.w > 0 && box.h > 0)) throw new Error('A target must have nonzero width and height.')
  const point = resolveAnchor(anchor, boxForTarget(doc.base, oldTarget))
  const relative = { targetId, ...(center ? { nx: 0.5, ny: 0.5 } : pointToNormalized(point, box)) }
  return { ...doc, anchors: doc.anchors.map((a) => a.id === id ? { ...a, mode: 'relative-bbox', relative, absolute: undefined, pathOffset: undefined } : a) }
}

export function missingTargets(doc: DrawerDoc, base: BaseDrawing = doc.base): string[] {
  const ids = [
    ...doc.anchors.map((a) => a.mode === 'path-offset' ? a.pathOffset?.targetId : a.relative?.targetId),
    ...doc.landmarks.map((l) => l.targetId),
  ]
  return [...new Set(ids.filter((id): id is string => !!id && !own(base.targetBoxes, id)))]
}

/** No silent fallback to the whole figure when the replacement loses a named target. */
export function replaceBaseKeepingMappings(doc: DrawerDoc, base: BaseDrawing): DrawerDoc {
  const missing = missingTargets(doc, base)
  if (missing.length) throw new Error(`Replacement cancelled. Missing referenced SVG targets: ${missing.join(', ')}`)
  if (doc.anchors.some((a) => a.mode === 'path-offset')) throw new Error('Replacement cancelled: path-offset anchors are not supported.')
  if (doc.anchors.some((a) => a.mode === 'absolute') && JSON.stringify(doc.base.viewBox) !== JSON.stringify(base.viewBox)) {
    throw new Error('Replacement changes the coordinate system of absolute anchors. Attach them to named targets first.')
  }
  return { ...doc, base }
}

function rasterMime(bytes: Uint8Array): AnchorAttachment['mimeType'] | null {
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
  const anchorIds = new Set<string>()
  const attachmentIds = new Set<string>()
  let total = 0
  for (const a of doc.anchors) {
    if (!a || !validString(a.id) || anchorIds.has(a.id)) throw new Error('Invalid or duplicate anchor ID.')
    anchorIds.add(a.id)
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
