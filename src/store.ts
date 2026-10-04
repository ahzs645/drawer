import { create } from 'zustand'
import {
  addArea as addAreaToDoc,
  addGroup as addGroupToDoc,
  addPartAreas as addPartAreasToDoc,
  deleteArea as deleteAreaFromDoc,
  deleteGroup as deleteGroupFromDoc,
  setGroupMember as setGroupMemberInDoc,
  updateArea as updateAreaInDoc,
  updateGroup as updateGroupInDoc,
} from './areaModel'
import { applyArrangement } from './autoLayout'
import { clinicalAsset, clinicalLandmarks, containAddedImage } from './clinical'
import {
  anchorPagePoint,
  docContentBox,
  findImage,
  fontSizeFor,
  imageAtPoint,
  imageContainsPoint,
  imagePageBounds,
  landmarkPoint,
  pageToRelative,
} from './geometry'
import {
  addImage as addImageToDoc,
  addSite as addSiteToDoc,
  addSitePlacement,
  deleteImage as deleteImageFromDoc,
  deleteSite as deleteSiteFromDoc,
  duplicateImage as duplicateImageInDoc,
  identityImage,
  linkCalloutToSite as linkCalloutToSiteInDoc,
  normalizeDoc,
  pageDrawing,
  reattachAnchor,
  reorderImage as reorderImageInDoc,
  setImagePlacement as setImagePlacementInDoc,
  updateImageMeta as updateImageMetaInDoc,
  updateSite as updateSiteInDoc,
} from './docModel'
import { parseProject } from './export/projectIo'
import { uid } from './id'
import { buildLandmarksFor } from './landmarks'
import {
  DEFAULT_PRESET_ID,
  loadDefaultPresetId,
  loadPresets,
  saveDefaultPresetId,
  savePresets,
} from './presets'
import {
  DEFAULT_SAMPLE_KEY,
  DIVIDER_SEEDS,
  DIVIDER_TEXT_SEEDS,
  SAMPLES,
  TEMPLATES,
  sampleUrl,
} from './samples'
import { parseSvg } from './svgParse'
import { DEFAULT_STYLE } from './types'
import type {
  Anchor,
  Area,
  AreaShape,
  BalloonShape,
  BaseDrawing,
  Callout,
  CalloutOverride,
  CalloutStyle,
  DrawerDoc,
  DrawingElement,
  DrawingElementKind,
  ImageInstance,
  LabelMode,
  Landmark,
  LeaderStyle,
  Site,
  SiteLegend,
  StylePreset,
  SurfaceGroup,
  TextAnnotation,
  Vec2,
  View,
} from './types'

export type Tool = 'select' | 'anchor' | 'landmark' | 'text' | 'line' | 'rect' | 'area'
/** What the Area tool draws. */
export type AreaMode = 'rect' | 'ellipse' | 'polygon'

const PALETTE = ['#1f6feb', '#d1242f', '#1a7f37', '#9a6700', '#8250df', '#bf3989']

const AUTO_ARRANGE_KEY = 'drawer.autoArrange.v1'
function loadAutoArrange(): boolean {
  try {
    return localStorage.getItem(AUTO_ARRANGE_KEY) === '1'
  } catch {
    return false
  }
}
function saveAutoArrange(v: boolean) {
  try {
    localStorage.setItem(AUTO_ARRANGE_KEY, v ? '1' : '0')
  } catch {
    /* storage unavailable — keep session-only */
  }
}

function newView(name: string, labelMode: LabelMode): View {
  return { id: uid('view'), name, labelMode, overrides: {} }
}

/** A one-image document: the page frame is the drawing's own viewBox. */
function makeDoc(name: string, drawing: BaseDrawing, landmarks: Landmark[] = []): DrawerDoc {
  const view = newView('Names', 'names')
  const image = identityImage(drawing, name)
  const landmarkGroupOrder = Array.from(new Set(landmarks.map((l) => l.group || 'Other')))
  return {
    id: uid('doc'),
    name,
    base: pageDrawing(drawing.viewBox),
    images: [image],
    anchors: [],
    callouts: [],
    views: [view],
    activeViewId: view.id,
    landmarks: landmarks.map((l) => ({ ...l, imageId: image.id })),
    textAnnotations: [],
    drawingElements: [],
    landmarkGroupOrder,
    hiddenLandmarkGroups: [],
  }
}

/**
 * Place a label/balloon outward from the body center on the nearer side, clearing
 * the body's silhouette by a gutter so the label doesn't sit on top of the drawing.
 * On a page with several images, "the body" is the image the point is on.
 */
function outwardLabelPos(doc: DrawerDoc, point: Vec2, imageId?: string | null): Vec2 {
  const image = findImage(doc, imageId)
  const cb = image ? imagePageBounds(image, image.drawing.contentBox) : docContentBox(doc)
  const gutter = Math.max(40, cb.w * 0.09)
  const center = cb.x + cb.w / 2
  const outX = point.x < center ? cb.x - gutter : cb.x + cb.w + gutter
  return { x: outX, y: point.y }
}

/** Next free balloon number, robust to deletions of middle callouts. */
function nextBalloonNumber(doc: DrawerDoc): number {
  const maxNum = doc.callouts.reduce((m, c) => {
    const n = parseInt(c.balloonText, 10)
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return maxNum + 1
}

/** Session-only tracing aid drawn over the page; never saved or exported. */
export interface ReferenceOverlay {
  dataUrl: string
  name: string
  opacity: number
  visible: boolean
}

interface StoreState {
  doc: DrawerDoc | null
  tool: Tool
  selectedCalloutId: string | null
  selectedTextId: string | null
  selectedLandmarkId: string | null
  selectedDrawingId: string | null
  selectedImageId: string | null
  /** highlighted site row (also set when one of its placements is selected) */
  selectedSiteId: string | null
  /** when set, the next click on the drawing places a marker for this site */
  pendingSiteId: string | null
  /** Optional view chosen from the connections matrix. */
  pendingSiteImageId: string | null
  /** draw dashed lines from the selected site's markers to its legend row */
  showSiteConnections: boolean
  selectedAreaId: string | null
  /** selected counter group (its member areas are highlighted) */
  selectedGroupId: string | null
  areaMode: AreaMode
  /** outline and label areas on the canvas (they stay selectable from the panel) */
  showAreas: boolean
  /** named part to highlight while hovering it in the Areas panel */
  hoverPart: { imageId: string; targetId: string } | null
  reference: ReferenceOverlay | null
  status: string
  past: DrawerDoc[]
  future: DrawerDoc[]
  // callout style presets (app-level, persisted; not bound to the image)
  presets: StylePreset[]
  defaultPresetId: string
  // landmark catalog UI
  showLandmarks: boolean
  hoverLandmarkId: string | null
  // auto-arrange labels (boundary layout) when placing new callouts
  autoArrange: boolean
  // bumped to ask the canvas to re-fit the view (e.g. after an explicit arrange)
  fitRequest: number
  // bumped after placing a callout so the inspector focuses its label field for naming
  labelFocusRequest: number
  textFocusRequest: number
  landmarkFocusRequest: number
  // lifecycle
  loadSampleKey: (key: string, withSeeds?: boolean) => Promise<void>
  loadTemplate: (key: string) => Promise<boolean>
  importSvgText: (name: string, raw: string) => void
  loadDoc: (doc: DrawerDoc) => void
  // images on the page
  addImageFromSvg: (name: string, raw: string, sampleKey?: string | null) => boolean
  addSampleImage: (key: string) => Promise<boolean>
  selectImage: (id: string | null) => void
  setImagePlacement: (id: string, patch: Partial<Pick<ImageInstance, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX'>>) => void
  updateImageMeta: (id: string, patch: Partial<Pick<ImageInstance, 'name' | 'visible' | 'locked' | 'source'>>) => void
  duplicateImage: (id: string, mirror?: boolean) => void
  deleteImage: (id: string) => void
  reorderImage: (id: string, delta: -1 | 1) => void
  setPageSize: (w: number, h: number) => void
  setExportFrame: (frame: 'content' | 'page') => void
  setReference: (reference: ReferenceOverlay | null) => void
  // shared site table
  selectSite: (id: string | null) => void
  addSite: (label: string) => void
  updateSite: (id: string, patch: Partial<Omit<Site, 'id'>>) => void
  deleteSite: (id: string) => void
  linkCalloutToSite: (calloutId: string, siteId: string | null) => void
  startSitePlacement: (siteId: string | null, imageId?: string) => void
  updateSiteLegend: (patch: Partial<SiteLegend>) => void
  setMappingValue: (fieldKey: string, value: string) => void
  setShowSiteConnections: (v: boolean) => void
  // areas and counter groups (the selection surface)
  setAreaMode: (mode: AreaMode) => void
  setShowAreas: (v: boolean) => void
  setHoverPart: (part: { imageId: string; targetId: string } | null) => void
  selectArea: (id: string | null) => void
  addArea: (shape: AreaShape, imageId: string | null) => void
  addPartAreas: (imageId: string, targetIds: string[]) => void
  updateArea: (id: string, patch: Partial<Pick<Area, 'label' | 'fieldKey'>>) => void
  deleteArea: (id: string) => void
  selectGroup: (id: string | null) => void
  addGroup: (label: string) => void
  updateGroup: (id: string, patch: Partial<Pick<SurfaceGroup, 'label' | 'showCount'>>) => void
  deleteGroup: (id: string) => void
  setGroupMember: (groupId: string, kind: 'area' | 'site', id: string, member: boolean) => void
  // history
  record: () => void
  undo: () => void
  redo: () => void
  // tools / selection
  setTool: (t: Tool) => void
  select: (id: string | null) => void
  selectText: (id: string | null) => void
  selectLandmark: (id: string | null) => void
  selectDrawing: (id: string | null) => void
  // landmark catalog
  setShowLandmarks: (v: boolean) => void
  setHoverLandmark: (id: string | null) => void
  addLandmark: (name: string, point: Vec2, targetId?: string | null, group?: string, imageId?: string | null) => void
  addLandmarkAt: (point: Vec2, targetId?: string | null, imageId?: string | null) => void
  updateLandmark: (id: string, patch: Partial<Landmark>) => void
  moveLandmark: (id: string, point: Vec2) => void
  setLandmarkTarget: (id: string, targetId: string | null) => void
  removeLandmark: (id: string) => void
  addCalloutAtLandmark: (landmarkId: string) => void
  addLandmarkGroup: (name: string) => void
  renameLandmarkGroup: (from: string, to: string) => void
  deleteLandmarkGroup: (name: string) => void
  moveLandmarkGroup: (name: string, delta: -1 | 1) => void
  setLandmarkGroupVisible: (name: string, visible: boolean) => void
  importLandmarkCatalog: (landmarks: Omit<Landmark, 'id'>[], groupOrder: string[]) => void
  // style presets
  setDefaultPreset: (id: string) => void
  applyPreset: (calloutId: string, presetId: string) => void
  applyPresetToAll: (presetId: string) => void
  saveStyleAsPreset: (name: string, style: CalloutStyle) => string
  deletePreset: (id: string) => void
  // callouts
  addCalloutAt: (point: Vec2, targetId?: string | null, imageId?: string | null) => void
  updateCalloutBase: (id: string, patch: Partial<Callout>) => void
  updateOverride: (id: string, patch: CalloutOverride) => void
  moveLabel: (id: string, pos: Vec2) => void
  moveAnchorForCallout: (id: string, point: Vec2) => void
  // label layout
  setAutoArrange: (v: boolean) => void
  arrangeLabels: (viewId?: string) => void
  setAnchorTarget: (id: string, targetId: string | null) => void
  setElbow: (id: string, point: Vec2 | null) => void
  deleteCallout: (id: string) => void
  // standalone text
  addTextAt: (point: Vec2) => void
  updateText: (id: string, patch: Partial<TextAnnotation>) => void
  moveText: (id: string, pos: Vec2) => void
  deleteText: (id: string) => void
  // simple drawing layer
  addDrawingElement: (kind: DrawingElementKind, start: Vec2, end: Vec2) => void
  updateDrawingElement: (id: string, patch: Partial<DrawingElement>) => void
  moveDrawingElement: (id: string, delta: Vec2) => void
  deleteDrawingElement: (id: string) => void
  // views
  addView: (name: string, labelMode: LabelMode, copyFromActive?: boolean) => void
  setActiveView: (id: string) => void
  updateViewMeta: (id: string, patch: Partial<Pick<View, 'name' | 'labelMode' | 'siteDisplay'>>) => void
  setViewStyle: (id: string, style: CalloutStyle | null) => void
  setViewMono: (id: string, mono: boolean) => void
  deleteView: (id: string) => void
  setDocName: (name: string) => void
}

function activeView(doc: DrawerDoc): View {
  return doc.views.find((v) => v.id === doc.activeViewId) ?? doc.views[0]
}

const HISTORY_LIMIT = 60

/** The style new callouts should adopt, from the active default preset. */
function defaultStyle(presets: StylePreset[], defaultPresetId: string): CalloutStyle {
  return presets.find((p) => p.id === defaultPresetId)?.style ?? DEFAULT_STYLE
}

/** Clear every selection kind except the one being set. */
const NO_SELECTION = {
  selectedCalloutId: null,
  selectedTextId: null,
  selectedLandmarkId: null,
  selectedDrawingId: null,
  selectedImageId: null,
  selectedSiteId: null,
  selectedAreaId: null,
  selectedGroupId: null,
}

/** Fresh-document state: no selection, no history, nothing pending. */
const FRESH = {
  ...NO_SELECTION,
  pendingSiteId: null,
  pendingSiteImageId: null,
  past: [] as DrawerDoc[],
  future: [] as DrawerDoc[],
  hoverLandmarkId: null,
  hoverPart: null,
}

// Async artwork reads must not overwrite a later project-opening action.
let documentLoadRequest = 0

export const useStore = create<StoreState>((set, get) => ({
  doc: null,
  tool: 'anchor',
  selectedCalloutId: null,
  selectedTextId: null,
  selectedLandmarkId: null,
  selectedDrawingId: null,
  selectedImageId: null,
  selectedSiteId: null,
  pendingSiteId: null,
  pendingSiteImageId: null,
  showSiteConnections: false,
  selectedAreaId: null,
  selectedGroupId: null,
  areaMode: 'rect',
  showAreas: true,
  hoverPart: null,
  reference: null,
  status: 'Loading…',
  past: [],
  future: [],
  presets: loadPresets(),
  defaultPresetId: loadDefaultPresetId(),
  showLandmarks: true,
  hoverLandmarkId: null,
  autoArrange: loadAutoArrange(),
  fitRequest: 0,
  labelFocusRequest: 0,
  textFocusRequest: 0,
  landmarkFocusRequest: 0,

  loadSampleKey: async (key, withSeeds = false) => {
    const request = ++documentLoadRequest
    const sample = SAMPLES.find((s) => s.key === key) ?? SAMPLES[0]
    set({ status: `Loading ${sample.label}…` })
    try {
      const raw = await fetch(sampleUrl(sample.file)).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      const base = parseSvg(raw)
      if (request !== documentLoadRequest) return
      const asset = clinicalAsset(sample.key)
      const landmarks = asset ? clinicalLandmarks(asset, base) : buildLandmarksFor(sample.key, base.targetBoxes)
      const doc = makeDoc(sample.label, base, landmarks)
      if (asset) doc.images[0].source = asset.source
      if (withSeeds && key === 'divider') seedDivider(doc)
      set({ ...FRESH, doc, status: '', tool: 'anchor' })
    } catch (e) {
      if (request === documentLoadRequest) set({ status: `Failed to load sample: ${(e as Error).message}` })
    }
  },

  loadTemplate: async (key) => {
    const template = TEMPLATES.find((t) => t.key === key)
    if (!template) return false
    const request = ++documentLoadRequest
    set({ status: `Loading ${template.label}…` })
    try {
      const text = await fetch(sampleUrl(template.file)).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      if (request !== documentLoadRequest) return false
      const current = get().doc
      const next = parseProject(text)
      const isClinical = key.startsWith('clinical')
      set({
        ...FRESH, doc: next, status: template.note, tool: 'select', showLandmarks: !isClinical,
        // Opening a chart is reversible, including from the library panel.
        past: current ? [...get().past, structuredClone(current)].slice(-HISTORY_LIMIT) : [],
      })
      return true
    } catch (e) {
      if (request === documentLoadRequest) set({ status: `Failed to load template: ${(e as Error).message}` })
      return false
    }
  },

  importSvgText: (name, raw) => {
    documentLoadRequest += 1
    try {
      const base = parseSvg(raw)
      // imported SVGs get a catalog auto-derived from their named elements
      const landmarks = buildLandmarksFor(null, base.targetBoxes)
      const doc = makeDoc(name.replace(/\.svg$/i, ''), base, landmarks)
      set({ ...FRESH, doc, status: '', tool: 'anchor' })
    } catch (e) {
      set({ status: `Import failed: ${(e as Error).message}` })
    }
  },

  loadDoc: (doc) => {
    documentLoadRequest += 1
    set({ ...FRESH, doc: normalizeDoc(doc), status: '', tool: 'select' })
  },

  // --- images on the page ---------------------------------------------------

  addImageFromSvg: (name, raw, sampleKey = null) => {
    const doc = get().doc
    if (!doc) return false
    try {
      const drawing = parseSvg(raw)
      const asset = clinicalAsset(sampleKey)
      const landmarks = asset ? clinicalLandmarks(asset, drawing) : buildLandmarksFor(sampleKey, drawing.targetBoxes)
      get().record()
      const result = addImageToDoc(doc, drawing, name.replace(/\.svg$/i, '') || 'Image', landmarks)
      if (asset) result.doc.images = result.doc.images.map((image) => image.id === result.imageId ? { ...image, source: asset.source } : image)
      set({ doc: containAddedImage(result.doc, result.imageId), ...NO_SELECTION, selectedImageId: result.imageId, tool: 'select', fitRequest: get().fitRequest + 1, status: '' })
      return true
    } catch (e) {
      set({ status: `Could not add the image: ${(e as Error).message}` })
      return false
    }
  },

  addSampleImage: async (key) => {
    const sample = SAMPLES.find((s) => s.key === key)
    const documentId = get().doc?.id
    const request = documentLoadRequest
    if (!sample || !documentId) return false
    try {
      const raw = await fetch(sampleUrl(sample.file)).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      if (request !== documentLoadRequest || get().doc?.id !== documentId) return false
      return get().addImageFromSvg(sample.label, raw, sample.key)
    } catch (e) {
      if (request === documentLoadRequest && get().doc?.id === documentId) set({ status: `Failed to load sample: ${(e as Error).message}` })
      return false
    }
  },

  selectImage: (id) => set({ ...NO_SELECTION, selectedImageId: id }),

  setImagePlacement: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    const image = findImage(doc, id)
    if (!image || image.locked) return
    try {
      set({ doc: setImagePlacementInDoc(doc, id, patch) })
    } catch (e) {
      set({ status: (e as Error).message })
    }
  },

  updateImageMeta: (id, patch) => {
    const doc = get().doc
    if (!doc || !findImage(doc, id)) return
    set({ doc: updateImageMetaInDoc(doc, id, patch) })
  },

  duplicateImage: (id, mirror = false) => {
    const doc = get().doc
    if (!doc || !findImage(doc, id)) return
    get().record()
    const result = duplicateImageInDoc(doc, id, mirror)
    set({ doc: result.doc, ...NO_SELECTION, selectedImageId: result.imageId, fitRequest: get().fitRequest + 1 })
  },

  deleteImage: (id) => {
    const doc = get().doc
    const image = doc && findImage(doc, id)
    if (!doc || !image || image.locked) return
    get().record()
    set({ doc: deleteImageFromDoc(doc, id), ...NO_SELECTION })
  },

  reorderImage: (id, delta) => {
    const doc = get().doc
    if (!doc) return
    const next = reorderImageInDoc(doc, id, delta)
    if (next === doc) return
    get().record()
    set({ doc: next })
  },

  setPageSize: (w, h) => {
    const doc = get().doc
    if (!doc || !(w > 0 && h > 0 && w <= 1e5 && h <= 1e5)) return
    const viewBox = { ...doc.base.viewBox, w, h }
    set({ doc: { ...doc, base: { ...doc.base, viewBox, contentBox: doc.base.inner.trim() ? doc.base.contentBox : viewBox } } })
  },

  setExportFrame: (frame) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({ doc: { ...doc, exportFrame: frame } })
  },

  setReference: (reference) => set({ reference }),

  // --- shared site table ------------------------------------------------------

  selectSite: (id) => set({ ...NO_SELECTION, selectedSiteId: id }),

  addSite: (label) => {
    const doc = get().doc
    if (!doc) return
    try {
      const result = addSiteToDoc(doc, label)
      get().record()
      set({ doc: result.doc, ...NO_SELECTION, selectedSiteId: result.siteId, status: '' })
    } catch (e) {
      set({ status: (e as Error).message })
    }
  },

  updateSite: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    // throws on duplicate numbers/keys so the caller can show the reason
    set({ doc: updateSiteInDoc(doc, id, patch) })
  },

  deleteSite: (id) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({ doc: deleteSiteFromDoc(doc, id), ...NO_SELECTION, pendingSiteId: null, pendingSiteImageId: null })
  },

  linkCalloutToSite: (calloutId, siteId) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({ doc: linkCalloutToSiteInDoc(doc, calloutId, siteId), selectedSiteId: siteId })
  },

  startSitePlacement: (siteId, imageId) => {
    const image = imageId ? get().doc?.images.find((item) => item.id === imageId) : undefined
    if (imageId && (!image || image.visible === false)) {
      set({ status: 'Show the selected view before placing a marker on it.' })
      return
    }
    set(siteId ? {
      ...NO_SELECTION, pendingSiteId: siteId, pendingSiteImageId: imageId ?? null,
      tool: 'anchor', selectedSiteId: siteId, selectedImageId: imageId ?? null,
      status: image ? `Click ${image.name} to place the selected site.` : '',
    } : { pendingSiteId: null, pendingSiteImageId: null })
  },

  updateSiteLegend: (patch) => {
    const doc = get().doc
    if (!doc?.siteLegend) return
    set({ doc: { ...doc, siteLegend: { ...doc.siteLegend, ...patch } } })
  },

  setShowSiteConnections: (v) => set({ showSiteConnections: v }),

  // an empty entry removes the value (renders as an em dash)
  setMappingValue: (fieldKey, value) => {
    const doc = get().doc
    if (!doc || ['__proto__', 'constructor', 'prototype'].includes(fieldKey)) return
    const mappingValues = { ...(doc.mappingValues ?? {}) }
    if (value === '') delete mappingValues[fieldKey]
    else mappingValues[fieldKey] = value.slice(0, 4000)
    set({ doc: { ...doc, mappingValues } })
  },

  // --- areas and counter groups -----------------------------------------------

  setAreaMode: (mode) => set({ areaMode: mode, tool: 'area', pendingSiteId: null, pendingSiteImageId: null }),
  setShowAreas: (v) => set({ showAreas: v }),
  setHoverPart: (part) => set({ hoverPart: part }),
  selectArea: (id) => set({ ...NO_SELECTION, selectedAreaId: id }),

  addArea: (shape, imageId) => {
    const doc = get().doc
    if (!doc) return
    try {
      const result = addAreaToDoc(doc, { shape, imageId })
      get().record()
      // stay in the Area tool so several areas can be drawn in a row
      set({ doc: result.doc, ...NO_SELECTION, selectedAreaId: result.areaId, status: '' })
    } catch (e) {
      set({ status: (e as Error).message })
    }
  },

  addPartAreas: (imageId, targetIds) => {
    const doc = get().doc
    if (!doc) return
    try {
      const result = addPartAreasToDoc(doc, imageId, targetIds)
      if (!result.areaIds.length) return
      get().record()
      set({
        doc: result.doc,
        ...NO_SELECTION,
        selectedAreaId: result.areaIds.length === 1 ? result.areaIds[0] : null,
        status: `Added ${result.areaIds.length} part area${result.areaIds.length === 1 ? '' : 's'}.`,
      })
    } catch (e) {
      set({ status: (e as Error).message })
    }
  },

  // no history step here: inspector fields record on focus, like other text edits
  updateArea: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    try {
      set({ doc: updateAreaInDoc(doc, id, patch) })
    } catch (e) {
      set({ status: (e as Error).message })
    }
  },

  deleteArea: (id) => {
    const doc = get().doc
    if (!doc || !doc.areas?.some((a) => a.id === id)) return
    get().record()
    set({ doc: deleteAreaFromDoc(doc, id), selectedAreaId: get().selectedAreaId === id ? null : get().selectedAreaId })
  },

  selectGroup: (id) => set({ ...NO_SELECTION, selectedGroupId: id }),

  addGroup: (label) => {
    const doc = get().doc
    if (!doc) return
    try {
      const result = addGroupToDoc(doc, label)
      get().record()
      set({ doc: result.doc, ...NO_SELECTION, selectedGroupId: result.groupId, status: '' })
    } catch (e) {
      set({ status: (e as Error).message })
    }
  },

  updateGroup: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    try {
      set({ doc: updateGroupInDoc(doc, id, patch) })
    } catch (e) {
      set({ status: (e as Error).message })
    }
  },

  deleteGroup: (id) => {
    const doc = get().doc
    if (!doc || !doc.groups?.some((g) => g.id === id)) return
    get().record()
    set({ doc: deleteGroupFromDoc(doc, id), selectedGroupId: get().selectedGroupId === id ? null : get().selectedGroupId })
  },

  setGroupMember: (groupId, kind, id, member) => {
    const doc = get().doc
    if (!doc) return
    try {
      const next = setGroupMemberInDoc(doc, groupId, kind, id, member)
      get().record()
      set({ doc: next })
    } catch (e) {
      set({ status: (e as Error).message })
    }
  },

  // snapshot the current doc onto the undo stack (call before a discrete edit,
  // or once at the start of a drag)
  record: () => {
    const { doc, past } = get()
    if (!doc) return
    set({ past: [...past, structuredClone(doc)].slice(-HISTORY_LIMIT), future: [] })
  },

  undo: () => {
    const { doc, past, future } = get()
    if (!past.length || !doc) return
    documentLoadRequest += 1
    const prev = past[past.length - 1]
    set({
      ...NO_SELECTION, pendingSiteId: null, pendingSiteImageId: null, status: '',
      doc: prev,
      past: past.slice(0, -1),
      future: [structuredClone(doc), ...future].slice(0, HISTORY_LIMIT),
    })
  },

  redo: () => {
    const { doc, past, future } = get()
    if (!future.length || !doc) return
    documentLoadRequest += 1
    const next = future[0]
    set({
      ...NO_SELECTION, pendingSiteId: null, pendingSiteImageId: null, status: '',
      doc: next,
      past: [...past, structuredClone(doc)].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    })
  },

  setTool: (t) => set(t === 'anchor' ? { tool: t } : { tool: t, pendingSiteId: null, pendingSiteImageId: null }),
  select: (id) => set({
    ...NO_SELECTION,
    selectedCalloutId: id,
    // selecting a site placement also highlights its row
    selectedSiteId: (id && get().doc?.callouts.find((c) => c.id === id)?.siteId) || null,
  }),
  selectText: (id) => set({ ...NO_SELECTION, selectedTextId: id }),
  selectLandmark: (id) => set({ ...NO_SELECTION, selectedLandmarkId: id }),
  selectDrawing: (id) => set({ ...NO_SELECTION, selectedDrawingId: id }),

  setShowLandmarks: (v) => set({ showLandmarks: v }),
  setHoverLandmark: (id) => set({ hoverLandmarkId: id }),

  // add a new named location to the catalog (e.g. "save as landmark" on an
  // imported body so the point can be reused later)
  addLandmark: (name, point, targetId = null, group = 'Custom', imageId = null) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const n = pageToRelative(doc, imageId, targetId, point)
    const cleanGroup = group.trim() || 'Custom'
    const landmark: Landmark = {
      id: uid('lm'),
      name: name || 'Landmark',
      nx: n.nx,
      ny: n.ny,
      targetId,
      group: cleanGroup,
      ...(imageId ? { imageId } : {}),
    }
    set({
      doc: {
        ...doc,
        landmarks: [...doc.landmarks, landmark],
        landmarkGroupOrder: doc.landmarkGroupOrder.includes(cleanGroup)
          ? doc.landmarkGroupOrder
          : [...doc.landmarkGroupOrder, cleanGroup],
      },
    })
  },

  addLandmarkAt: (point, targetId = null, imageId = null) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const n = pageToRelative(doc, imageId, targetId, point)
    // default to a group already used on this image
    const group = doc.landmarks.find((l) => (l.imageId ?? null) === imageId)?.group || doc.landmarkGroupOrder[0] || 'Custom'
    const landmark: Landmark = {
      id: uid('lm'),
      name: 'Landmark',
      nx: n.nx,
      ny: n.ny,
      targetId,
      group,
      ...(imageId ? { imageId } : {}),
    }
    set({
      doc: {
        ...doc,
        landmarks: [...doc.landmarks, landmark],
        landmarkGroupOrder: doc.landmarkGroupOrder.includes(group)
          ? doc.landmarkGroupOrder
          : [...doc.landmarkGroupOrder, group],
      },
      ...NO_SELECTION,
      selectedLandmarkId: landmark.id,
      landmarkFocusRequest: get().landmarkFocusRequest + 1,
      tool: 'select',
    })
  },

  updateLandmark: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    const group = patch.group?.trim()
    const nextPatch = group ? { ...patch, group } : patch
    const order = group && !doc.landmarkGroupOrder.includes(group)
      ? [...doc.landmarkGroupOrder, group]
      : doc.landmarkGroupOrder
    set({
      doc: {
        ...doc,
        landmarks: doc.landmarks.map((l) => (l.id === id ? { ...l, ...nextPatch } : l)),
        landmarkGroupOrder: order,
      },
    })
  },

  moveLandmark: (id, point) => {
    const doc = get().doc
    if (!doc) return
    const lm = doc.landmarks.find((l) => l.id === id)
    if (!lm) return
    const n = pageToRelative(doc, lm.imageId, lm.targetId, point)
    get().updateLandmark(id, { nx: n.nx, ny: n.ny })
  },

  setLandmarkTarget: (id, targetId) => {
    const doc = get().doc
    if (!doc) return
    const lm = doc.landmarks.find((l) => l.id === id)
    if (!lm) return
    get().record()
    const n = pageToRelative(doc, lm.imageId, targetId, landmarkPoint(doc, lm))
    get().updateLandmark(id, { targetId, nx: n.nx, ny: n.ny })
  },

  removeLandmark: (id) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({
      doc: { ...doc, landmarks: doc.landmarks.filter((l) => l.id !== id) },
      selectedLandmarkId: get().selectedLandmarkId === id ? null : get().selectedLandmarkId,
    })
  },

  addLandmarkGroup: (name) => {
    const doc = get().doc
    const clean = name.trim()
    if (!doc || !clean || doc.landmarkGroupOrder.includes(clean)) return
    get().record()
    set({ doc: { ...doc, landmarkGroupOrder: [...doc.landmarkGroupOrder, clean] } })
  },

  renameLandmarkGroup: (from, to) => {
    const doc = get().doc
    const clean = to.trim()
    if (!doc || !clean || from === clean) return
    get().record()
    const merged = doc.landmarkGroupOrder.filter((g) => g !== from && g !== clean)
    const at = Math.max(0, doc.landmarkGroupOrder.indexOf(from))
    merged.splice(Math.min(at, merged.length), 0, clean)
    set({
      doc: {
        ...doc,
        landmarks: doc.landmarks.map((l) =>
          (l.group || 'Other') === from ? { ...l, group: clean } : l,
        ),
        landmarkGroupOrder: merged,
        hiddenLandmarkGroups: doc.hiddenLandmarkGroups
          .filter((g) => g !== from && g !== clean)
          .concat(doc.hiddenLandmarkGroups.includes(from) ? [clean] : []),
      },
    })
  },

  deleteLandmarkGroup: (name) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const fallback = name === 'Custom' ? 'Other' : 'Custom'
    const hasMembers = doc.landmarks.some((l) => (l.group || 'Other') === name)
    const order = doc.landmarkGroupOrder.filter((g) => g !== name)
    if (hasMembers && !order.includes(fallback)) order.push(fallback)
    set({
      doc: {
        ...doc,
        landmarks: doc.landmarks.map((l) =>
          (l.group || 'Other') === name ? { ...l, group: fallback } : l,
        ),
        landmarkGroupOrder: order,
        hiddenLandmarkGroups: doc.hiddenLandmarkGroups.filter((g) => g !== name),
      },
    })
  },

  moveLandmarkGroup: (name, delta) => {
    const doc = get().doc
    if (!doc) return
    const index = doc.landmarkGroupOrder.indexOf(name)
    const next = index + delta
    if (index < 0 || next < 0 || next >= doc.landmarkGroupOrder.length) return
    get().record()
    const order = [...doc.landmarkGroupOrder]
    ;[order[index], order[next]] = [order[next], order[index]]
    set({ doc: { ...doc, landmarkGroupOrder: order } })
  },

  setLandmarkGroupVisible: (name, visible) => {
    const doc = get().doc
    if (!doc) return
    const hidden = new Set(doc.hiddenLandmarkGroups)
    if (visible) hidden.delete(name)
    else hidden.add(name)
    set({ doc: { ...doc, hiddenLandmarkGroups: [...hidden] } })
  },

  importLandmarkCatalog: (incoming, groupOrder) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const seen = new Set(doc.landmarks.map((l) => `${l.group || 'Other'}::${l.name}`))
    const added: Landmark[] = []
    for (const raw of incoming) {
      const group = raw.group || 'Other'
      const key = `${group}::${raw.name}`
      if (seen.has(key)) continue
      seen.add(key)
      added.push({ ...raw, id: uid('lm'), group })
    }
    const order = [...doc.landmarkGroupOrder]
    for (const group of [...groupOrder, ...added.map((l) => l.group || 'Other')]) {
      if (group && !order.includes(group)) order.push(group)
    }
    set({ doc: { ...doc, landmarks: [...doc.landmarks, ...added], landmarkGroupOrder: order } })
  },

  // place a callout on a catalog landmark: anchor locks to the landmark's
  // normalized position (tracking its element when it has one) and the label
  // inherits the landmark name.
  addCalloutAtLandmark: (landmarkId) => {
    const doc = get().doc
    if (!doc) return
    const lm = doc.landmarks.find((l) => l.id === landmarkId)
    if (!lm) return
    const targetId = lm.targetId ?? null
    if (get().pendingSiteId) {
      get().addCalloutAt(landmarkPoint(doc, lm), targetId, lm.imageId ?? null)
      return
    }
    get().record()
    const anchor: Anchor = {
      id: uid('anchor'),
      mode: 'relative-bbox',
      relative: { targetId, nx: lm.nx, ny: lm.ny },
      ...(lm.imageId ? { imageId: lm.imageId } : {}),
    }
    const point = anchorPagePoint(doc, anchor)
    const next = nextBalloonNumber(doc)
    const style = defaultStyle(get().presets, get().defaultPresetId)
    const callout: Callout = {
      id: uid('callout'),
      anchorId: anchor.id,
      labelText: lm.name,
      balloonText: String(next),
      ...style,
      labelPos: outwardLabelPos(doc, point, lm.imageId),
      elbow: null,
      color: PALETTE[(next - 1) % PALETTE.length],
    }
    const doc2: DrawerDoc = {
      ...doc,
      anchors: [...doc.anchors, anchor],
      callouts: [...doc.callouts, callout],
    }
    set({
      doc: get().autoArrange ? applyArrangement(doc2) : doc2,
      ...NO_SELECTION,
      selectedCalloutId: callout.id,
    })
  },

  setDefaultPreset: (id) => {
    if (!get().presets.some((p) => p.id === id)) return
    saveDefaultPresetId(id)
    set({ defaultPresetId: id })
  },

  applyPreset: (calloutId, presetId) => {
    const doc = get().doc
    const preset = get().presets.find((p) => p.id === presetId)
    if (!doc || !preset) return
    get().record()
    set({
      doc: {
        ...doc,
        callouts: doc.callouts.map((c) =>
          c.id === calloutId ? { ...c, ...preset.style } : c,
        ),
      },
    })
  },

  applyPresetToAll: (presetId) => {
    const doc = get().doc
    const preset = get().presets.find((p) => p.id === presetId)
    if (!doc || !preset) return
    get().record()
    set({
      doc: {
        ...doc,
        callouts: doc.callouts.map((c) => ({ ...c, ...preset.style })),
      },
    })
  },

  saveStyleAsPreset: (name, style) => {
    const preset: StylePreset = {
      id: uid('preset'),
      name: name || 'My style',
      builtin: false,
      style,
    }
    const presets = [...get().presets, preset]
    savePresets(presets)
    set({ presets })
    return preset.id
  },

  deletePreset: (id) => {
    const target = get().presets.find((p) => p.id === id)
    if (!target || target.builtin) return
    const presets = get().presets.filter((p) => p.id !== id)
    savePresets(presets)
    const defaultPresetId =
      get().defaultPresetId === id ? DEFAULT_PRESET_ID : get().defaultPresetId
    if (defaultPresetId !== get().defaultPresetId) saveDefaultPresetId(defaultPresetId)
    set({ presets, defaultPresetId })
  },

  addCalloutAt: (point, targetId = null, imageId = null) => {
    const doc = get().doc
    if (!doc) return
    const pendingSiteId = get().pendingSiteId
    const requiredImage = get().pendingSiteImageId
    if (pendingSiteId && requiredImage && imageId !== requiredImage) {
      const name = findImage(doc, requiredImage)?.name ?? 'the chosen view'
      set({ status: `Place this marker on ${name}. Esc cancels.` })
      return
    }
    get().record()
    if (pendingSiteId) {
      // placing a marker for a site row
      try {
        const result = addSitePlacement(doc, pendingSiteId, imageId, point, imageId ? targetId : null)
        set({ doc: result.doc, ...NO_SELECTION, selectedCalloutId: result.calloutId, selectedSiteId: pendingSiteId, pendingSiteId: null, pendingSiteImageId: null, tool: 'select', status: '' })
      } catch (e) {
        set({ status: (e as Error).message, pendingSiteId: null, pendingSiteImageId: null })
      }
      return
    }
    // a point on an image lives in that image's drawing space; elsewhere it is a page point
    const anchor: Anchor = imageId
      ? { id: uid('anchor'), mode: 'relative-bbox', imageId, relative: { targetId, ...pageToRelative(doc, imageId, targetId, point) } }
      : { id: uid('anchor'), mode: 'absolute', absolute: point }
    const next = nextBalloonNumber(doc)
    const style = defaultStyle(get().presets, get().defaultPresetId)
    const callout: Callout = {
      id: uid('callout'),
      anchorId: anchor.id,
      // start unnamed: a free-clicked point is a dot you name afterwards
      labelText: '',
      balloonText: String(next),
      ...style,
      labelPos: outwardLabelPos(doc, point, imageId),
      elbow: null,
      color: PALETTE[(next - 1) % PALETTE.length],
    }
    const doc2: DrawerDoc = {
      ...doc,
      anchors: [...doc.anchors, anchor],
      callouts: [...doc.callouts, callout],
    }
    set({
      doc: get().autoArrange ? applyArrangement(doc2) : doc2,
      ...NO_SELECTION,
      selectedCalloutId: callout.id,
      // ask the inspector to focus the name field so you can type it immediately
      labelFocusRequest: get().labelFocusRequest + 1,
    })
  },

  updateCalloutBase: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    set({
      doc: {
        ...doc,
        callouts: doc.callouts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    })
  },

  updateOverride: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    const v = activeView(doc)
    const overrides = { ...v.overrides, [id]: { ...v.overrides[id], ...patch } }
    set({
      doc: {
        ...doc,
        views: doc.views.map((view) => (view.id === v.id ? { ...view, overrides } : view)),
      },
    })
  },

  moveLabel: (id, pos) => get().updateOverride(id, { labelPos: pos }),
  setElbow: (id, point) => get().updateOverride(id, { elbow: point }),

  setAutoArrange: (v) => {
    saveAutoArrange(v)
    set({ autoArrange: v })
  },

  // spread the current view's visible labels into non-overlapping side columns,
  // then ask the canvas to re-fit so the arranged columns are fully visible
  arrangeLabels: (viewId) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({
      doc: applyArrangement(doc, viewId ?? doc.activeViewId),
      fitRequest: get().fitRequest + 1,
    })
  },

  moveAnchorForCallout: (id, point) => {
    const doc = get().doc
    if (!doc) return
    const callout = doc.callouts.find((c) => c.id === id)
    if (!callout) return
    const anchor = doc.anchors.find((a) => a.id === callout.anchorId)
    if (!anchor) return
    const own = findImage(doc, anchor.imageId)
    if (own?.locked) return
    // dragged off its image onto another one (or off a page point onto an image): re-home it
    if (!own || !imageContainsPoint(own, point)) {
      const other = imageAtPoint(doc, point)
      if (other && other.id !== own?.id && !other.locked) {
        set({ doc: reattachAnchor(doc, anchor.id, other.id, point) })
        return
      }
      if (!own) {
        set({ doc: reattachAnchor(doc, anchor.id, null, point) })
        return
      }
    }
    const targetId = anchor.relative?.targetId ?? null
    const n = pageToRelative(doc, anchor.imageId, targetId, point)
    set({
      doc: {
        ...doc,
        anchors: doc.anchors.map((a) =>
          a.id === callout.anchorId
            ? { ...a, mode: 'relative-bbox', relative: { targetId, nx: n.nx, ny: n.ny } }
            : a,
        ),
      },
    })
  },

  // re-target a callout's anchor to a body element (or detach to the body box),
  // keeping its current on-screen point fixed
  setAnchorTarget: (id, targetId) => {
    const doc = get().doc
    if (!doc) return
    const callout = doc.callouts.find((c) => c.id === id)
    if (!callout) return
    const anchor = doc.anchors.find((a) => a.id === callout.anchorId)
    if (!anchor) return
    get().record()
    const n = pageToRelative(doc, anchor.imageId, targetId, anchorPagePoint(doc, anchor))
    set({
      doc: {
        ...doc,
        anchors: doc.anchors.map((a) =>
          a.id === anchor.id
            ? { ...a, mode: 'relative-bbox', relative: { targetId, nx: n.nx, ny: n.ny } }
            : a,
        ),
      },
    })
  },

  deleteCallout: (id) => {
    const doc = get().doc
    if (!doc) return
    const callout = doc.callouts.find((c) => c.id === id)
    if (!callout) return
    get().record()
    set({
      doc: {
        ...doc,
        callouts: doc.callouts.filter((c) => c.id !== id),
        anchors: doc.anchors.filter((a) => a.id !== callout.anchorId),
        views: doc.views.map((v) => {
          const overrides = { ...v.overrides }
          delete overrides[id]
          return { ...v, overrides }
        }),
      },
      selectedCalloutId: get().selectedCalloutId === id ? null : get().selectedCalloutId,
    })
  },

  addTextAt: (point) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const item: TextAnnotation = {
      id: uid('text'),
      text: 'Text',
      pos: point,
      style: 'plain',
      fontSize: fontSizeFor(doc.base.viewBox),
      fontWeight: 600,
      align: 'middle',
      color: '#111111',
      ruleWidth: Math.max(120, docContentBox(doc).w * 0.28),
    }
    // text placed on an image moves with it
    const image = imageAtPoint(doc, point)
    if (image) item.imageId = image.id
    set({
      doc: { ...doc, textAnnotations: [...doc.textAnnotations, item] },
      ...NO_SELECTION,
      selectedTextId: item.id,
      textFocusRequest: get().textFocusRequest + 1,
      tool: 'select',
    })
  },

  updateText: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    set({
      doc: {
        ...doc,
        textAnnotations: doc.textAnnotations.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      },
    })
  },

  moveText: (id, pos) => get().updateText(id, { pos }),

  deleteText: (id) => {
    const doc = get().doc
    if (!doc || !doc.textAnnotations.some((t) => t.id === id)) return
    get().record()
    set({
      doc: { ...doc, textAnnotations: doc.textAnnotations.filter((t) => t.id !== id) },
      selectedTextId: get().selectedTextId === id ? null : get().selectedTextId,
    })
  },

  addDrawingElement: (kind, start, end) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const item: DrawingElement = {
      id: uid('drawing'),
      kind,
      start,
      end,
      stroke: '#111111',
      strokeWidth: 2,
      dashed: false,
      fill: null,
    }
    // a shape drawn on an image moves with it
    const image = imageAtPoint(doc, start)
    if (image && imageAtPoint(doc, end)?.id === image.id) item.imageId = image.id
    set({
      doc: { ...doc, drawingElements: [...doc.drawingElements, item] },
      ...NO_SELECTION,
      selectedDrawingId: item.id,
      tool: 'select',
    })
  },

  updateDrawingElement: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    set({
      doc: {
        ...doc,
        drawingElements: doc.drawingElements.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      },
    })
  },

  moveDrawingElement: (id, delta) => {
    const doc = get().doc
    if (!doc) return
    const item = doc.drawingElements.find((d) => d.id === id)
    if (!item) return
    get().updateDrawingElement(id, {
      start: { x: item.start.x + delta.x, y: item.start.y + delta.y },
      end: { x: item.end.x + delta.x, y: item.end.y + delta.y },
    })
  },

  deleteDrawingElement: (id) => {
    const doc = get().doc
    if (!doc || !doc.drawingElements.some((d) => d.id === id)) return
    get().record()
    set({
      doc: { ...doc, drawingElements: doc.drawingElements.filter((d) => d.id !== id) },
      selectedDrawingId: get().selectedDrawingId === id ? null : get().selectedDrawingId,
    })
  },

  addView: (name, labelMode, copyFromActive = false) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const v = newView(name, labelMode)
    if (copyFromActive) {
      const src = activeView(doc)
      v.overrides = JSON.parse(JSON.stringify(src.overrides))
    }
    set({ doc: { ...doc, views: [...doc.views, v], activeViewId: v.id } })
  },

  setActiveView: (id) => {
    const doc = get().doc
    if (!doc) return
    set({ doc: { ...doc, activeViewId: id } })
  },

  updateViewMeta: (id, patch) => {
    const doc = get().doc
    if (!doc) return
    set({ doc: { ...doc, views: doc.views.map((v) => (v.id === id ? { ...v, ...patch } : v)) } })
  },

  setViewStyle: (id, style) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({
      doc: {
        ...doc,
        views: doc.views.map((v) =>
          v.id === id ? { ...v, style: style ?? undefined } : v,
        ),
      },
    })
  },

  setViewMono: (id, mono) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({
      doc: {
        ...doc,
        views: doc.views.map((v) => (v.id === id ? { ...v, mono: mono || undefined } : v)),
      },
    })
  },

  deleteView: (id) => {
    const doc = get().doc
    if (!doc || doc.views.length <= 1) return
    get().record()
    const views = doc.views.filter((v) => v.id !== id)
    const activeViewId = doc.activeViewId === id ? views[0].id : doc.activeViewId
    set({ doc: { ...doc, views, activeViewId } })
  },

  setDocName: (name) => {
    const doc = get().doc
    if (!doc) return
    set({ doc: { ...doc, name } })
  },
}))

function seedDivider(doc: DrawerDoc) {
  const imageId = doc.images[0]?.id
  DIVIDER_SEEDS.forEach((s, i) => {
    const anchor: Anchor = {
      id: uid('anchor'),
      mode: 'relative-bbox',
      imageId,
      relative: { targetId: null, nx: s.nx, ny: s.ny },
    }
    const callout: Callout = {
      id: uid('callout'),
      anchorId: anchor.id,
      labelText: s.label,
      balloonShape: 'none',
      balloonText: String(i + 1),
      leaderStyle: 'elbow',
      labelPos: { x: s.lx, y: s.ly },
      elbow: null,
      color: PALETTE[i % PALETTE.length],
    }
    doc.anchors.push(anchor)
    doc.callouts.push(callout)
  })
  DIVIDER_TEXT_SEEDS.forEach((seed) => {
    doc.textAnnotations.push({ id: uid('text'), ...seed, imageId })
  })
}

export { DEFAULT_SAMPLE_KEY, SAMPLES }
export type { BalloonShape, LabelMode, LeaderStyle }
