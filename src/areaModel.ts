import { uid } from './id'
import { prettyName } from './text'
import type { Area, AreaShape, DrawerDoc, ImageInstance, SurfaceGroup, Vec2 } from './types'

// ---------------------------------------------------------------------------
// Pure document operations for the selection surface's areas and groups.
// The store wraps these with history/selection; tests call them directly.
// Geometry (hit-testing, outlines, centres) lives in surface.ts.
// ---------------------------------------------------------------------------

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)
const record = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o)
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const validString = (value: unknown, max = 512): value is string => typeof value === 'string' && value.length <= max
const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype']

const MAX_AREAS = 2000
const MAX_GROUPS = 500
const MAX_POLYGON_POINTS = 1000

/** Auto-assigned element handles ("el12") are not names a person gave a part. */
const AUTO_HANDLE = /^el\d+$/

export const AREA_KIND_LABELS: Record<AreaShape['kind'], string> = {
  part: 'Named part',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
}

/** Named parts of an image's artwork (ids from the original SVG), in drawing order. */
export function namedParts(image: ImageInstance): string[] {
  return Object.keys(image.drawing.targetBoxes ?? {}).filter((k) => !AUTO_HANDLE.test(k))
}

export function areaById(doc: DrawerDoc, id: string | null | undefined): Area | undefined {
  return id ? doc.areas?.find((a) => a.id === id) : undefined
}

export function groupById(doc: DrawerDoc, id: string | null | undefined): SurfaceGroup | undefined {
  return id ? doc.groups?.find((g) => g.id === id) : undefined
}

/** Groups an area or site belongs to. */
export function groupsContaining(doc: DrawerDoc, kind: 'area' | 'site', id: string): SurfaceGroup[] {
  return (doc.groups ?? []).filter((g) => (kind === 'area' ? g.areaIds : g.siteIds).includes(id))
}

/** Is a shape usable: finite numbers, a positive size, at least three polygon points? */
export function validShape(shape: unknown): shape is AreaShape {
  if (!record(shape)) return false
  switch (shape.kind) {
    case 'part':
      return validString(shape.targetId) && shape.targetId.trim() !== '' && !RESERVED_KEYS.includes(shape.targetId)
    case 'rect':
      return [shape.x, shape.y, shape.w, shape.h].every(finite) && (shape.w as number) > 0 && (shape.h as number) > 0
    case 'ellipse':
      return [shape.cx, shape.cy, shape.rx, shape.ry].every(finite) && (shape.rx as number) > 0 && (shape.ry as number) > 0
    case 'polygon':
      return (
        Array.isArray(shape.points) &&
        shape.points.length >= 3 &&
        shape.points.length <= MAX_POLYGON_POINTS &&
        shape.points.every((p) => record(p) && finite(p.x) && finite(p.y))
      )
    default:
      return false
  }
}

/** A rectangle from two opposite corners (any drag direction). */
export function rectFromCorners(a: Vec2, b: Vec2): AreaShape {
  return { kind: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

/** An ellipse inscribed in the box spanned by two opposite corners. */
export function ellipseFromCorners(a: Vec2, b: Vec2): AreaShape {
  return { kind: 'ellipse', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 }
}

/**
 * Close a polygon draft: drop consecutive points closer than minGap (a
 * double-click lands twice on the same spot) and the closing point when it
 * repeats the first. Null when fewer than three points remain.
 */
export function closePolygon(points: Vec2[], minGap = 0): AreaShape | null {
  const out: Vec2[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > minGap) out.push({ x: p.x, y: p.y })
  }
  if (out.length > 3 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= minGap) out.pop()
  return out.length >= 3 ? { kind: 'polygon', points: out } : null
}

function nextAreaLabel(doc: DrawerDoc): string {
  const used = new Set((doc.areas ?? []).map((a) => a.label))
  let n = (doc.areas ?? []).length + 1
  while (used.has(`Area ${n}`)) n++
  return `Area ${n}`
}

// --- areas -----------------------------------------------------------------

/** Add an area. Its shape is in the image's drawing space (page space without an image). */
export function addArea(
  doc: DrawerDoc,
  input: { shape: AreaShape; imageId?: string | null; label?: string; fieldKey?: string },
): { doc: DrawerDoc; areaId: string } {
  if (!validShape(input.shape)) throw new Error('The area needs a positive size (or at least three points).')
  if (input.imageId && !doc.images.some((i) => i.id === input.imageId)) throw new Error('Image not found.')
  const area: Area = {
    id: uid('area'),
    label: input.label?.trim() || nextAreaLabel(doc),
    ...(input.imageId ? { imageId: input.imageId } : {}),
    shape: structuredClone(input.shape),
    ...(input.fieldKey?.trim() ? { fieldKey: input.fieldKey.trim() } : {}),
  }
  return { doc: { ...doc, areas: [...(doc.areas ?? []), area] }, areaId: area.id }
}

/**
 * One 'part' area per named element of an image (label = the id, prettified).
 * Parts that already have an area on that image are skipped.
 */
export function addPartAreas(doc: DrawerDoc, imageId: string, targetIds: string[]): { doc: DrawerDoc; areaIds: string[] } {
  const image = doc.images.find((i) => i.id === imageId)
  if (!image) throw new Error('Image not found.')
  const taken = new Set(
    (doc.areas ?? []).filter((a) => a.imageId === imageId && a.shape.kind === 'part').map((a) => (a.shape as { targetId: string }).targetId),
  )
  const areas: Area[] = []
  for (const targetId of targetIds) {
    if (taken.has(targetId) || !own(image.drawing.targetBoxes ?? {}, targetId)) continue
    taken.add(targetId)
    areas.push({ id: uid('area'), label: prettyName(targetId), imageId, shape: { kind: 'part', targetId } })
  }
  return { doc: { ...doc, areas: [...(doc.areas ?? []), ...areas] }, areaIds: areas.map((a) => a.id) }
}

/** Rename, re-key or reshape an area. An empty field key removes it. */
export function updateArea(doc: DrawerDoc, areaId: string, patch: Partial<Pick<Area, 'label' | 'fieldKey' | 'shape'>>): DrawerDoc {
  const area = areaById(doc, areaId)
  if (!area) throw new Error('Area not found.')
  const next: Area = { ...area, ...patch }
  if (patch.shape !== undefined && !validShape(patch.shape)) throw new Error('Invalid area shape.')
  if (next.label.length > 512) throw new Error('Area label is too long.')
  if (patch.fieldKey !== undefined) {
    const key = patch.fieldKey.trim()
    if (!key) delete next.fieldKey
    else if (key.length > 512 || RESERVED_KEYS.includes(key)) throw new Error('Enter a valid field key.')
    else next.fieldKey = key
  }
  return { ...doc, areas: (doc.areas ?? []).map((a) => (a.id === areaId ? next : a)) }
}

/** Remove areas and/or sites from every group that lists them. */
export function dropFromGroups(doc: DrawerDoc, ids: { areaIds?: Iterable<string>; siteIds?: Iterable<string> }): DrawerDoc {
  if (!doc.groups?.length) return doc
  const areas = new Set(ids.areaIds ?? [])
  const sites = new Set(ids.siteIds ?? [])
  if (!areas.size && !sites.size) return doc
  return {
    ...doc,
    groups: doc.groups.map((g) =>
      g.areaIds.some((id) => areas.has(id)) || g.siteIds.some((id) => sites.has(id))
        ? { ...g, areaIds: g.areaIds.filter((id) => !areas.has(id)), siteIds: g.siteIds.filter((id) => !sites.has(id)) }
        : g,
    ),
  }
}

export function deleteArea(doc: DrawerDoc, areaId: string): DrawerDoc {
  if (!areaById(doc, areaId)) throw new Error('Area not found.')
  return dropFromGroups({ ...doc, areas: (doc.areas ?? []).filter((a) => a.id !== areaId) }, { areaIds: [areaId] })
}

/** Cascade for deleting an image: its areas go, and so do their group entries. */
export function removeAreasOnImage(doc: DrawerDoc, imageId: string): DrawerDoc {
  const gone = (doc.areas ?? []).filter((a) => a.imageId === imageId).map((a) => a.id)
  if (!gone.length) return doc
  const ids = new Set(gone)
  return dropFromGroups({ ...doc, areas: (doc.areas ?? []).filter((a) => !ids.has(a.id)) }, { areaIds: gone })
}

/**
 * Cascade for duplicating an image: copy its areas onto the copy with new ids.
 * Shapes are in drawing space, so they need no remapping (a mirror copy's
 * flip carries them along). Copies are not added to groups and drop their
 * field key, so two areas never silently answer the same application field.
 */
export function copyAreasToImage(doc: DrawerDoc, fromImageId: string, toImageId: string): DrawerDoc {
  const copies: Area[] = (doc.areas ?? [])
    .filter((a) => a.imageId === fromImageId)
    .map(({ fieldKey: _key, ...a }) => ({ ...structuredClone(a), id: uid('area'), imageId: toImageId }))
  return copies.length ? { ...doc, areas: [...(doc.areas ?? []), ...copies] } : doc
}

// --- groups ----------------------------------------------------------------

export function addGroup(doc: DrawerDoc, label: string): { doc: DrawerDoc; groupId: string } {
  const clean = label.trim()
  if (!clean) throw new Error('Give the group a label.')
  if (clean.length > 512) throw new Error('Group label is too long.')
  const group: SurfaceGroup = { id: uid('group'), label: clean, areaIds: [], siteIds: [], showCount: true }
  return { doc: { ...doc, groups: [...(doc.groups ?? []), group] }, groupId: group.id }
}

export function updateGroup(doc: DrawerDoc, groupId: string, patch: Partial<Pick<SurfaceGroup, 'label' | 'showCount'>>): DrawerDoc {
  if (!groupById(doc, groupId)) throw new Error('Group not found.')
  if (patch.label !== undefined && patch.label.length > 512) throw new Error('Group label is too long.')
  return { ...doc, groups: (doc.groups ?? []).map((g) => (g.id === groupId ? { ...g, ...patch } : g)) }
}

export function deleteGroup(doc: DrawerDoc, groupId: string): DrawerDoc {
  if (!groupById(doc, groupId)) throw new Error('Group not found.')
  return { ...doc, groups: (doc.groups ?? []).filter((g) => g.id !== groupId) }
}

/** Add an area or site to a group, or take it out. Members keep document order. */
export function setGroupMember(doc: DrawerDoc, groupId: string, kind: 'area' | 'site', id: string, member: boolean): DrawerDoc {
  const group = groupById(doc, groupId)
  if (!group) throw new Error('Group not found.')
  const exists = kind === 'area' ? !!areaById(doc, id) : !!doc.sites?.some((s) => s.id === id)
  if (member && !exists) throw new Error(`${kind === 'area' ? 'Area' : 'Site'} not found.`)
  const key = kind === 'area' ? 'areaIds' : 'siteIds'
  const order = kind === 'area' ? (doc.areas ?? []).map((a) => a.id) : (doc.sites ?? []).map((s) => s.id)
  const set = new Set(group[key])
  if (member) set.add(id)
  else set.delete(id)
  const ids = order.filter((x) => set.has(x))
  return { ...doc, groups: (doc.groups ?? []).map((g) => (g.id === groupId ? { ...g, [key]: ids } : g)) }
}

// --- load-time validation --------------------------------------------------

/**
 * Clean the areas and groups of a loaded document: drop malformed or
 * duplicate entries, areas on images that do not exist, and group references
 * to missing areas or sites. Never throws, so an otherwise good project
 * still opens; it only loses what could not be used.
 */
export function sanitizeSurface(doc: DrawerDoc): DrawerDoc {
  const images = new Set((doc.images ?? []).map((i) => i.id))
  const raw = doc as unknown as Record<string, unknown>
  let areas: Area[] | undefined
  if (Array.isArray(raw.areas)) {
    const seen = new Set<string>()
    areas = []
    for (const a of (raw.areas as unknown[]).slice(0, MAX_AREAS)) {
      if (!record(a) || !validString(a.id) || !a.id || seen.has(a.id) || !validShape(a.shape)) continue
      if (a.imageId !== undefined && (typeof a.imageId !== 'string' || !images.has(a.imageId))) continue
      seen.add(a.id)
      const area: Area = {
        id: a.id,
        label: validString(a.label) ? a.label : a.id,
        ...(a.imageId !== undefined ? { imageId: a.imageId as string } : {}),
        shape: a.shape.kind === 'polygon' ? { kind: 'polygon', points: a.shape.points.map((p) => ({ x: p.x, y: p.y })) } : { ...a.shape },
      }
      if (validString(a.fieldKey) && a.fieldKey.trim() && !RESERVED_KEYS.includes(a.fieldKey)) area.fieldKey = a.fieldKey
      areas.push(area)
    }
  }
  const areaIds = new Set((areas ?? []).map((a) => a.id))
  const siteIds = new Set((doc.sites ?? []).map((s) => s.id))
  let groups: SurfaceGroup[] | undefined
  if (Array.isArray(raw.groups)) {
    const seen = new Set<string>()
    groups = []
    for (const g of (raw.groups as unknown[]).slice(0, MAX_GROUPS)) {
      if (!record(g) || !validString(g.id) || !g.id || seen.has(g.id)) continue
      seen.add(g.id)
      const ids = (list: unknown, known: Set<string>) =>
        Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === 'string' && known.has(x)))] : []
      groups.push({
        id: g.id,
        label: validString(g.label) ? g.label : g.id,
        areaIds: ids(g.areaIds, areaIds),
        siteIds: ids(g.siteIds, siteIds),
        ...(typeof g.showCount === 'boolean' ? { showCount: g.showCount } : {}),
      })
    }
  }
  const next = { ...doc }
  if (areas) next.areas = areas
  else delete next.areas
  if (groups) next.groups = groups
  else delete next.groups
  return next
}
