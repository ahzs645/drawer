import {
  anchorPagePoint,
  boundsOfPoints,
  docContentBox,
  findImage,
  imageBoxCorners,
  imagePageBounds,
  imageToPage,
  isImageVisible,
  pageToImage,
  pointToNormalized,
  boxForTarget,
} from './geometry'
import { copyAreasToImage, dropFromGroups, removeAreasOnImage } from './areaModel'
import { uid } from './id'
import type {
  Anchor,
  BaseDrawing,
  Box,
  Callout,
  CalloutOverride,
  CalloutStyle,
  DrawerDoc,
  ImageInstance,
  Site,
  SiteLegend,
  Vec2,
  View,
} from './types'

// ---------------------------------------------------------------------------
// Pure document operations for multi-image pages and the shared site table.
// The store wraps these with history/selection; tests call them directly.
// ---------------------------------------------------------------------------

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype']

/** Place a drawing on the page at its own coordinates (identity transform). */
export function identityImage(drawing: BaseDrawing, name: string, id = uid('image')): ImageInstance {
  const vb = drawing.viewBox
  return { id, name, drawing, x: vb.x, y: vb.y, width: vb.w, height: vb.h, rotation: 0 }
}

/** An empty page frame. */
export function pageDrawing(viewBox: Box): BaseDrawing {
  return { inner: '', viewBox: { ...viewBox }, contentBox: { ...viewBox }, targetBoxes: {} }
}

/**
 * Bring any document (including older single-drawing files) into the
 * multi-image shape: the legacy base drawing becomes images[0], placed with an
 * identity transform so every anchor, landmark and label keeps its position.
 */
export function normalizeDoc(input: DrawerDoc): DrawerDoc {
  const doc = { ...input } as DrawerDoc
  if (!Array.isArray(doc.images)) doc.images = []
  if (doc.base.inner.trim() && doc.images.length === 0) {
    const image = identityImage(doc.base, doc.name || 'Drawing', 'image-base')
    doc.images = [image]
    doc.anchors = doc.anchors.map((a) => (a.imageId ? a : { ...a, imageId: image.id }))
    doc.landmarks = doc.landmarks.map((l) => (l.imageId ? l : { ...l, imageId: image.id }))
    doc.base = pageDrawing(doc.base.viewBox)
  }
  return doc
}

// --- images ----------------------------------------------------------------

/** Pick a page placement for a newly added drawing: to the right of the content, at a matching height. */
export function placementForNewImage(doc: DrawerDoc, drawing: BaseDrawing): Pick<ImageInstance, 'x' | 'y' | 'width' | 'height'> {
  const vb = drawing.viewBox
  const visible = doc.images.filter((i) => i.visible !== false)
  if (!visible.length && !doc.base.inner.trim()) {
    const page = doc.base.viewBox
    const scale = Math.min(1, page.w / vb.w, page.h / vb.h)
    return { x: page.x, y: page.y, width: vb.w * scale, height: vb.h * scale }
  }
  // clear of the other images' frames (they are hit areas) and of the site legend
  const boxes = [docContentBox(doc), ...visible.map((i) => imagePageBounds(i))]
  const legend = siteLegendBox(doc)
  if (legend) boxes.push(legend)
  const content = boundsOfPoints(boxes.flatMap((b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]))
  const tallest = Math.max(...visible.map((i) => imagePageBounds(i).h), content.h * 0.5)
  const scale = Math.min(tallest / vb.h, (content.w || tallest) / vb.w)
  const gap = Math.max(24, content.w * 0.05)
  return { x: content.x + content.w + gap, y: content.y, width: vb.w * scale, height: vb.h * scale }
}

function validatePlacement(image: ImageInstance) {
  for (const key of ['x', 'y', 'rotation'] as const) {
    if (!finite(image[key]) || Math.abs(image[key]) > 1e6) throw new Error(`Image ${key} must be a finite number.`)
  }
  for (const key of ['width', 'height'] as const) {
    if (!finite(image[key]) || image[key] <= 0 || image[key] > 1e6) throw new Error(`Image ${key} must be positive.`)
  }
}

/** Callout ids whose anchor lives on the image. */
export function calloutsOnImage(doc: DrawerDoc, imageId: string): Set<string> {
  const anchors = new Set(doc.anchors.filter((a) => a.imageId === imageId).map((a) => a.id))
  return new Set(doc.callouts.filter((c) => anchors.has(c.anchorId)).map((c) => c.id))
}

function remapOverrides(views: View[], ids: Set<string>, map: (p: Vec2) => Vec2): View[] {
  return views.map((v) => {
    let changed = false
    const overrides: Record<string, CalloutOverride> = { ...v.overrides }
    for (const id of ids) {
      const ov = overrides[id]
      if (!ov || (!ov.labelPos && !ov.elbow)) continue
      changed = true
      overrides[id] = {
        ...ov,
        ...(ov.labelPos ? { labelPos: map(ov.labelPos) } : {}),
        ...(ov.elbow ? { elbow: map(ov.elbow) } : {}),
      }
    }
    return changed ? { ...v, overrides } : v
  })
}

/**
 * Move / resize / rotate / flip an image. Anchors follow automatically (they
 * are stored in drawing space); labels, elbows, attached text and shapes are
 * carried along through the same transform so the layout stays intact.
 */
export function setImagePlacement(
  doc: DrawerDoc,
  imageId: string,
  patch: Partial<Pick<ImageInstance, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX'>>,
): DrawerDoc {
  const old = findImage(doc, imageId)
  if (!old) throw new Error('Image not found.')
  const next: ImageInstance = { ...old, ...patch }
  validatePlacement(next)
  const map = (p: Vec2) => imageToPage(next, pageToImage(old, p))
  const ids = calloutsOnImage(doc, imageId)
  return {
    ...doc,
    images: doc.images.map((i) => (i.id === imageId ? next : i)),
    callouts: doc.callouts.map((c) =>
      ids.has(c.id) ? { ...c, labelPos: map(c.labelPos), elbow: c.elbow ? map(c.elbow) : c.elbow } : c,
    ),
    views: remapOverrides(doc.views, ids, map),
    textAnnotations: doc.textAnnotations.map((t) => (t.imageId === imageId ? { ...t, pos: map(t.pos) } : t)),
    drawingElements: doc.drawingElements.map((d) =>
      d.imageId === imageId ? { ...d, start: map(d.start), end: map(d.end) } : d,
    ),
  }
}

/** Rename, hide, lock or relabel provenance — no geometry change. */
export function updateImageMeta(
  doc: DrawerDoc,
  imageId: string,
  patch: Partial<Pick<ImageInstance, 'name' | 'visible' | 'locked' | 'source'>>,
): DrawerDoc {
  if (!findImage(doc, imageId)) throw new Error('Image not found.')
  return { ...doc, images: doc.images.map((i) => (i.id === imageId ? { ...i, ...patch } : i)) }
}

/** Add a drawing as a new image (plus its landmark catalog) on top of the page. */
export function addImage(
  doc: DrawerDoc,
  drawing: BaseDrawing,
  name: string,
  landmarks: DrawerDoc['landmarks'] = [],
  placement = placementForNewImage(doc, drawing),
): { doc: DrawerDoc; imageId: string } {
  const image: ImageInstance = { id: uid('image'), name, drawing, rotation: 0, ...placement }
  validatePlacement(image)
  // keep catalog groups distinct per image once the page holds several drawings
  const prefix = doc.images.length ? `${name} · ` : ''
  const placed = landmarks.map((l) => ({ ...l, imageId: image.id, group: prefix + (l.group || 'Other') }))
  const order = [...doc.landmarkGroupOrder]
  for (const l of placed) if (!order.includes(l.group!)) order.push(l.group!)
  return {
    doc: { ...doc, images: [...doc.images, image], landmarks: [...doc.landmarks, ...placed], landmarkGroupOrder: order },
    imageId: image.id,
  }
}

/**
 * Copy an image with everything attached to it — points, callouts (including
 * site placements, which become extra placements of the same sites), per-view
 * overrides, landmarks, text and shapes. The copy goes to the right of the
 * original, optionally mirrored.
 */
export function duplicateImage(doc: DrawerDoc, imageId: string, mirror = false): { doc: DrawerDoc; imageId: string } {
  const source = findImage(doc, imageId)
  if (!source) throw new Error('Image not found.')
  const bounds = imagePageBounds(source)
  const gap = Math.max(24, bounds.w * 0.08)
  const copy: ImageInstance = {
    ...source,
    id: uid('image'),
    name: `${source.name} ${mirror ? 'mirror' : 'copy'}`,
    x: source.x + bounds.w + gap,
    flipX: mirror ? !source.flipX : source.flipX,
    locked: false,
  }
  const map = (p: Vec2) => imageToPage(copy, pageToImage(source, p))
  const anchorIds = new Map<string, string>()
  const anchors: Anchor[] = []
  for (const a of doc.anchors.filter((x) => x.imageId === imageId)) {
    const id = uid('anchor')
    anchorIds.set(a.id, id)
    anchors.push({ ...structuredClone(a), id, imageId: copy.id })
  }
  const calloutIds = new Map<string, string>()
  const callouts: Callout[] = []
  for (const c of doc.callouts.filter((x) => anchorIds.has(x.anchorId))) {
    const id = uid('callout')
    calloutIds.set(c.id, id)
    callouts.push({ ...c, id, anchorId: anchorIds.get(c.anchorId)!, labelPos: map(c.labelPos), elbow: c.elbow ? map(c.elbow) : null })
  }
  const views = doc.views.map((v) => {
    const overrides = { ...v.overrides }
    for (const [from, to] of calloutIds) {
      const ov = v.overrides[from]
      if (!ov) continue
      overrides[to] = {
        ...ov,
        ...(ov.labelPos ? { labelPos: map(ov.labelPos) } : {}),
        ...(ov.elbow ? { elbow: map(ov.elbow) } : {}),
      }
    }
    return { ...v, overrides }
  })
  const landmarks = doc.landmarks
    .filter((l) => l.imageId === imageId)
    .map((l) => ({ ...l, id: uid('lm'), imageId: copy.id, group: `${l.group || 'Other'} · ${copy.name}` }))
  const order = [...doc.landmarkGroupOrder]
  for (const l of landmarks) if (!order.includes(l.group)) order.push(l.group)
  const at = doc.images.findIndex((i) => i.id === imageId)
  const images = [...doc.images]
  images.splice(at + 1, 0, copy)
  const next: DrawerDoc = {
    ...doc,
    images,
    anchors: [...doc.anchors, ...anchors],
    callouts: [...doc.callouts, ...callouts],
    views,
    landmarks: [...doc.landmarks, ...landmarks],
    landmarkGroupOrder: order,
    textAnnotations: [
      ...doc.textAnnotations,
      ...doc.textAnnotations.filter((t) => t.imageId === imageId).map((t) => ({ ...t, id: uid('text'), imageId: copy.id, pos: map(t.pos) })),
    ],
    drawingElements: [
      ...doc.drawingElements,
      ...doc.drawingElements.filter((d) => d.imageId === imageId).map((d) => ({ ...d, id: uid('drawing'), imageId: copy.id, start: map(d.start), end: map(d.end) })),
    ],
  }
  // areas are in drawing space, so they copy without remapping (not into groups)
  return { doc: copyAreasToImage(next, imageId, copy.id), imageId: copy.id }
}

/**
 * Remove an image and everything attached to it, including its areas (and
 * their group entries). Site rows stay, so lost coverage is reported.
 */
export function deleteImage(doc: DrawerDoc, imageId: string): DrawerDoc {
  if (!findImage(doc, imageId)) throw new Error('Image not found.')
  const callouts = calloutsOnImage(doc, imageId)
  return removeAreasOnImage({
    ...doc,
    images: doc.images.filter((i) => i.id !== imageId),
    anchors: doc.anchors.filter((a) => a.imageId !== imageId),
    callouts: doc.callouts.filter((c) => !callouts.has(c.id)),
    views: doc.views.map((v) => {
      const overrides = { ...v.overrides }
      for (const id of callouts) delete overrides[id]
      return { ...v, overrides }
    }),
    landmarks: doc.landmarks.filter((l) => l.imageId !== imageId),
    textAnnotations: doc.textAnnotations.filter((t) => t.imageId !== imageId),
    drawingElements: doc.drawingElements.filter((d) => d.imageId !== imageId),
  }, imageId)
}

/** Move an image one layer up (+1) or down (-1). */
export function reorderImage(doc: DrawerDoc, imageId: string, delta: -1 | 1): DrawerDoc {
  const index = doc.images.findIndex((i) => i.id === imageId)
  const dest = index + delta
  if (index < 0 || dest < 0 || dest >= doc.images.length) return doc
  const images = [...doc.images]
  ;[images[index], images[dest]] = [images[dest], images[index]]
  return { ...doc, images }
}

/**
 * Re-home an anchor onto an image (or the page) without moving it on screen.
 * Used when a marker is dragged from one image onto another.
 */
export function reattachAnchor(doc: DrawerDoc, anchorId: string, imageId: string | null, point: Vec2): DrawerDoc {
  const image = findImage(doc, imageId)
  return {
    ...doc,
    anchors: doc.anchors.map((a) => {
      if (a.id !== anchorId) return a
      if (!image) return { id: a.id, mode: 'absolute', absolute: point, mapping: a.mapping, attachments: a.attachments }
      const n = pointToNormalized(pageToImage(image, point), boxForTarget(image.drawing, null))
      return { id: a.id, mode: 'relative-bbox', imageId: image.id, relative: { targetId: null, ...n }, mapping: a.mapping, attachments: a.attachments }
    }),
  }
}

// --- sites -----------------------------------------------------------------

/** How a site placement looks by default: a filled numbered badge on the point. */
export const SITE_MARKER_STYLE: CalloutStyle = {
  balloonShape: 'badge',
  leaderStyle: 'none',
  anchorMarker: 'none',
  leaderEnd: 'none',
  dashed: false,
  leaderWidth: 1.4,
  fontWeight: 500,
}

export function siteById(doc: DrawerDoc, id: string | null | undefined): Site | undefined {
  return id ? doc.sites?.find((s) => s.id === id) : undefined
}

/** Sites in legend/table order. */
export function sortedSites(doc: DrawerDoc): Site[] {
  return [...(doc.sites ?? [])].sort((a, b) => a.number - b.number)
}

/** Field key of a callout: its site's key, else its point's own mapping. */
export function calloutFieldKey(doc: DrawerDoc, c: Callout): string | undefined {
  return siteById(doc, c.siteId)?.fieldKey ?? doc.anchors.find((a) => a.id === c.anchorId)?.mapping?.fieldKey
}

/** The callout's canonical name: its site's label when it is a site placement. */
export function calloutName(doc: DrawerDoc, c: Callout): string {
  return siteById(doc, c.siteId)?.label ?? c.labelText
}

export function sitePlacements(doc: DrawerDoc, siteId: string): Callout[] {
  return doc.callouts.filter((c) => c.siteId === siteId)
}

function slug(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'site'
}

function uniqueFieldKey(doc: DrawerDoc, label: string): string {
  const used = new Set((doc.sites ?? []).map((s) => s.fieldKey))
  const base = `site.${slug(label)}`
  let key = base
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`
  return key
}

export function defaultSiteLegend(doc: DrawerDoc): SiteLegend {
  const content = docContentBox(doc)
  const fontSize = Math.max(12, Math.round(Math.max(doc.base.viewBox.w, doc.base.viewBox.h) * 0.016))
  return {
    pos: { x: content.x + content.w + fontSize * 2, y: content.y },
    heading: 'Sites',
    fontSize,
    rowHeight: fontSize * 1.4,
    visible: true,
  }
}

export function addSite(doc: DrawerDoc, label: string): { doc: DrawerDoc; siteId: string } {
  const clean = label.trim()
  if (!clean) throw new Error('Give the site a label.')
  const sites = doc.sites ?? []
  const site: Site = {
    id: uid('site'),
    number: Math.max(0, ...sites.map((s) => s.number)) + 1,
    label: clean,
    fieldKey: uniqueFieldKey(doc, clean),
  }
  return {
    doc: { ...doc, sites: [...sites, site], siteLegend: doc.siteLegend ?? defaultSiteLegend(doc) },
    siteId: site.id,
  }
}

/** Edit a site row. Numbers and field keys stay unique; a renamed key carries its value. */
export function updateSite(doc: DrawerDoc, siteId: string, patch: Partial<Omit<Site, 'id'>>): DrawerDoc {
  const sites = doc.sites ?? []
  const site = sites.find((s) => s.id === siteId)
  if (!site) throw new Error('Site not found.')
  const next = { ...site, ...patch }
  if (!Number.isInteger(next.number) || next.number < 1 || next.number > 9999) throw new Error('Site numbers must be whole numbers from 1 to 9999.')
  if (sites.some((s) => s.id !== siteId && s.number === next.number)) throw new Error(`Site number ${next.number} is already used.`)
  next.fieldKey = next.fieldKey.trim()
  if (!next.fieldKey || next.fieldKey.length > 512 || RESERVED_KEYS.includes(next.fieldKey)) throw new Error('Enter a valid field key.')
  if (sites.some((s) => s.id !== siteId && s.fieldKey === next.fieldKey)) throw new Error(`Field key ${next.fieldKey} is already used by another site.`)
  if (next.label.length > 512) throw new Error('Site label is too long.')
  let mappingValues = doc.mappingValues
  if (next.fieldKey !== site.fieldKey && mappingValues && Object.prototype.hasOwnProperty.call(mappingValues, site.fieldKey)) {
    mappingValues = { ...mappingValues }
    if (!Object.prototype.hasOwnProperty.call(mappingValues, next.fieldKey)) mappingValues[next.fieldKey] = mappingValues[site.fieldKey]
    delete mappingValues[site.fieldKey]
  }
  return {
    ...doc,
    mappingValues,
    sites: sites.map((s) => (s.id === siteId ? next : s)),
    // keep the stored label/number in step so plain readers of a callout agree
    callouts: doc.callouts.map((c) => (c.siteId === siteId ? { ...c, labelText: next.label, balloonText: String(next.number) } : c)),
  }
}

/** Delete callouts (and their anchors and overrides). */
export function removeCallouts(doc: DrawerDoc, ids: Set<string>): DrawerDoc {
  const anchors = new Set(doc.callouts.filter((c) => ids.has(c.id)).map((c) => c.anchorId))
  return {
    ...doc,
    callouts: doc.callouts.filter((c) => !ids.has(c.id)),
    anchors: doc.anchors.filter((a) => !anchors.has(a.id)),
    views: doc.views.map((v) => {
      const overrides = { ...v.overrides }
      for (const id of ids) delete overrides[id]
      return { ...v, overrides }
    }),
  }
}

/** Delete a site row, all of its placements, and its group entries. */
export function deleteSite(doc: DrawerDoc, siteId: string): DrawerDoc {
  const placements = new Set(sitePlacements(doc, siteId).map((c) => c.id))
  const next = removeCallouts(doc, placements)
  return dropFromGroups({ ...next, sites: (doc.sites ?? []).filter((s) => s.id !== siteId) }, { siteIds: [siteId] })
}

/** Link a callout to a site (or unlink with null); its label and number follow the site. */
export function linkCalloutToSite(doc: DrawerDoc, calloutId: string, siteId: string | null): DrawerDoc {
  const site = siteById(doc, siteId)
  if (siteId && !site) throw new Error('Site not found.')
  return {
    ...doc,
    callouts: doc.callouts.map((c) => {
      if (c.id !== calloutId) return c
      if (!site) {
        const { siteId: _drop, ...rest } = c
        return rest
      }
      return { ...c, siteId: site.id, labelText: site.label, balloonText: String(site.number) }
    }),
  }
}

/**
 * Mark a site on an image (or the page): a new anchor in the image's drawing
 * space plus a site-linked callout. New placements copy the look of the
 * site's existing markers so a set stays consistent.
 */
export function addSitePlacement(
  doc: DrawerDoc,
  siteId: string,
  imageId: string | null,
  point: Vec2,
  targetId: string | null = null,
  style: CalloutStyle = SITE_MARKER_STYLE,
): { doc: DrawerDoc; calloutId: string } {
  const site = siteById(doc, siteId)
  if (!site) throw new Error('Site not found.')
  const image = findImage(doc, imageId)
  const anchor: Anchor = image
    ? {
        id: uid('anchor'),
        mode: 'relative-bbox',
        imageId: image.id,
        relative: { targetId, ...pointToNormalized(pageToImage(image, point), boxForTarget(image.drawing, targetId)) },
      }
    : { id: uid('anchor'), mode: 'absolute', absolute: point }
  const sample = doc.callouts.find((c) => c.siteId) // any site marker: share its look
  const callout: Callout = {
    id: uid('callout'),
    anchorId: anchor.id,
    labelText: site.label,
    balloonText: String(site.number),
    ...(sample
      ? {
          balloonShape: sample.balloonShape,
          leaderStyle: sample.leaderStyle,
          anchorMarker: sample.anchorMarker,
          leaderEnd: sample.leaderEnd,
          dashed: sample.dashed,
          leaderWidth: sample.leaderWidth,
          fontSize: sample.fontSize,
          fontWeight: sample.fontWeight,
        }
      : style),
    labelPos: point,
    elbow: null,
    color: sample?.color ?? '#111111',
    siteId: site.id,
  }
  return {
    doc: {
      ...doc,
      siteLegend: doc.siteLegend ?? defaultSiteLegend(doc),
      anchors: [...doc.anchors, anchor],
      callouts: [...doc.callouts, callout],
    },
    calloutId: callout.id,
  }
}

// --- checks & exports ------------------------------------------------------

/** Is the callout drawn in this view (its override and its image)? */
export function calloutShown(doc: DrawerDoc, c: Callout, view: View): boolean {
  if (view.overrides[c.id]?.visible === false) return false
  const anchor = doc.anchors.find((a) => a.id === c.anchorId)
  return isImageVisible(doc, anchor?.imageId)
}

/** The page box the site legend occupies. */
export function siteLegendBox(doc: DrawerDoc): Box | null {
  const g = doc.siteLegend
  const sites = doc.sites ?? []
  if (!g || !g.visible || !sites.length) return null
  const longest = Math.max(g.heading.length, ...sites.map((s) => `${s.number}. ${s.label}`.length))
  return { x: g.pos.x, y: g.pos.y, w: longest * g.fontSize * 0.56, h: g.rowHeight * sites.length + g.fontSize * 1.1 }
}

/**
 * Plain-language problems with the page: unmarked sites, and (when exporting
 * the page frame) images or the legend that fall outside it.
 */
export function coverageWarnings(doc: DrawerDoc, view: View): string[] {
  const out: string[] = []
  for (const site of sortedSites(doc)) {
    const shown = sitePlacements(doc, site.id).some((c) => calloutShown(doc, c, view))
    if (!shown) out.push(`Site ${site.number} (${site.label}) has no visible marker in this view.`)
  }
  if (doc.exportFrame === 'page') {
    const page = doc.base.viewBox
    const outside = (b: Box) => b.x < page.x - 0.5 || b.y < page.y - 0.5 || b.x + b.w > page.x + page.w + 0.5 || b.y + b.h > page.y + page.h + 0.5
    for (const image of doc.images) {
      if (image.visible !== false && outside(boundsOfPoints(imageBoxCorners(image, image.drawing.contentBox)))) out.push(`${image.name} extends beyond the page.`)
    }
    const legend = siteLegendBox(doc)
    if (legend && outside(legend)) out.push('The site legend extends beyond the page.')
  }
  return out
}

/** Spreadsheet text that starts like a formula is prefixed so it stays text. */
function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  if (/^\s*[=+@-]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

/** One row per site placement (plus unmarked sites). Values only when asked for. */
export function sitesCsv(doc: DrawerDoc, { includeValues = false } = {}): string {
  const header = ['site_id', 'number', 'label', 'field_key', 'image_id', 'image_name', 'callout_id', 'page_x', 'page_y', 'visible_in_active_view']
  if (includeValues) header.push('value')
  const view = doc.views.find((v) => v.id === doc.activeViewId) ?? doc.views[0]
  const rows: unknown[][] = [header]
  for (const site of sortedSites(doc)) {
    const placements = sitePlacements(doc, site.id)
    const value = doc.mappingValues?.[site.fieldKey] ?? null
    for (const c of placements.length ? placements : [null]) {
      const anchor = c ? doc.anchors.find((a) => a.id === c.anchorId) : undefined
      const image = findImage(doc, anchor?.imageId)
      const p = anchor ? anchorPagePoint(doc, anchor) : null
      rows.push([
        site.id, site.number, site.label, site.fieldKey,
        image?.id ?? '', image?.name ?? '', c?.id ?? '',
        p ? Math.round(p.x * 100) / 100 : '', p ? Math.round(p.y * 100) / 100 : '',
        c ? calloutShown(doc, c, view) : false,
        ...(includeValues ? [value] : []),
      ])
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Legend geometry shared by the canvas and the exporters (text y values are baselines). */
export function siteLegendLayout(doc: DrawerDoc): {
  heading: { x: number; y: number; text: string; fontSize: number }
  rows: { siteId: string; x: number; y: number; top: number; height: number; text: string; fontSize: number }[]
} | null {
  const g = doc.siteLegend
  if (!g || !g.visible || !(doc.sites ?? []).length) return null
  return {
    heading: { x: g.pos.x, y: g.pos.y + g.fontSize * 0.72, text: g.heading, fontSize: g.fontSize },
    rows: sortedSites(doc).map((site, k) => {
      const y = g.pos.y + g.rowHeight * (k + 1) + g.fontSize * 0.72
      return { siteId: site.id, x: g.pos.x, y, top: y - g.fontSize, height: g.rowHeight, text: `${site.number}. ${site.label}`, fontSize: g.fontSize }
    }),
  }
}
