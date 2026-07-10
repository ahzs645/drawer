import { create } from 'zustand'
import { applyArrangement } from './autoLayout'
import { boxForTarget, fontSizeFor, pointToNormalized, resolveAnchor } from './geometry'
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
  sampleUrl,
} from './samples'
import { measureGeometry, parseSvg } from './svgParse'
import { DEFAULT_STYLE } from './types'
import type {
  Anchor,
  BalloonShape,
  BaseDrawing,
  Box,
  Callout,
  CalloutOverride,
  CalloutStyle,
  DrawerDoc,
  DrawingElement,
  DrawingElementKind,
  LabelMode,
  Landmark,
  LeaderStyle,
  StylePreset,
  TextAnnotation,
  Vec2,
  View,
} from './types'

export type Tool = 'select' | 'anchor' | 'landmark' | 'text' | 'line' | 'rect'

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

function makeDoc(name: string, base: BaseDrawing, landmarks: Landmark[] = []): DrawerDoc {
  const view = newView('Names', 'names')
  const landmarkGroupOrder = Array.from(new Set(landmarks.map((l) => l.group || 'Other')))
  return {
    id: uid('doc'),
    name,
    base,
    anchors: [],
    callouts: [],
    views: [view],
    activeViewId: view.id,
    landmarks,
    textAnnotations: [],
    drawingElements: [],
    landmarkGroupOrder,
    hiddenLandmarkGroups: [],
  }
}

/**
 * Place a label/balloon outward from the body center on the nearer side, clearing
 * the body's silhouette by a gutter so the label doesn't sit on top of the drawing.
 */
function outwardLabelPos(base: BaseDrawing, point: Vec2): Vec2 {
  const cb = base.contentBox
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

interface StoreState {
  doc: DrawerDoc | null
  tool: Tool
  selectedCalloutId: string | null
  selectedTextId: string | null
  selectedLandmarkId: string | null
  selectedDrawingId: string | null
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
  importSvgText: (name: string, raw: string) => void
  loadDoc: (doc: DrawerDoc) => void
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
  addLandmark: (name: string, point: Vec2, targetId?: string | null, group?: string) => void
  addLandmarkAt: (point: Vec2, targetId?: string | null) => void
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
  addCalloutAt: (point: Vec2, targetId?: string | null) => void
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
  // imported base manipulation
  duplicateBaseRight: (mirrored?: boolean) => void
  // views
  addView: (name: string, labelMode: LabelMode, copyFromActive?: boolean) => void
  setActiveView: (id: string) => void
  updateViewMeta: (id: string, patch: Partial<Pick<View, 'name' | 'labelMode'>>) => void
  setViewStyle: (id: string, style: CalloutStyle | null) => void
  setViewMono: (id: string, mono: boolean) => void
  deleteView: (id: string) => void
  setDocName: (name: string) => void
}

function activeView(doc: DrawerDoc): View {
  return doc.views.find((v) => v.id === doc.activeViewId) ?? doc.views[0]
}

/** The bounding box an anchor is relative to: a targeted element, else content. */
function targetBoxFor(doc: DrawerDoc, targetId: string | null): Box {
  return boxForTarget(doc.base, targetId)
}

const HISTORY_LIMIT = 60

/** The style new callouts should adopt, from the active default preset. */
function defaultStyle(presets: StylePreset[], defaultPresetId: string): CalloutStyle {
  return presets.find((p) => p.id === defaultPresetId)?.style ?? DEFAULT_STYLE
}

function prefixedBaseMarkup(inner: string, prefix: string): string {
  if (typeof document === 'undefined') return inner
  const ns = 'http://www.w3.org/2000/svg'
  const root = document.createElementNS(ns, 'g')
  root.innerHTML = inner
  const replacements = new Map<string, string>()
  root.querySelectorAll<Element>('[id],[data-drawer-el]').forEach((el) => {
    const oldId = el.id
    if (oldId) {
      const next = `${prefix}${oldId}`
      replacements.set(oldId, next)
      el.id = next
    }
    const oldHandle = el.getAttribute('data-drawer-el')
    if (oldHandle) {
      const next = `${prefix}${oldHandle}`
      replacements.set(oldHandle, next)
      el.setAttribute('data-drawer-el', next)
    }
  })
  root.querySelectorAll<Element>('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      let value = attr.value
      for (const [from, to] of replacements) {
        value = value.replaceAll(`url(#${from})`, `url(#${to})`).replaceAll(`#${from}`, `#${to}`)
      }
      if (value !== attr.value) el.setAttribute(attr.name, value)
    }
  })
  return root.innerHTML
}

function duplicateBaseDocument(doc: DrawerDoc, mirrored: boolean): DrawerDoc {
  const base = doc.base
  const box = base.contentBox
  const gap = Math.max(24, box.w * 0.08)
  const prefix = `${mirrored ? 'mirror' : 'copy'}_${Date.now()}_`
  const copy = prefixedBaseMarkup(base.inner, prefix)
  const transform = mirrored
    ? `translate(${2 * box.x + 2 * box.w + gap} 0) scale(-1 1)`
    : `translate(${box.w + gap} 0)`
  const inner = `<g data-drawer-base-instance="original">${base.inner}</g><g data-drawer-base-instance="${prefix}" transform="${transform}">${copy}</g>`
  const viewBox: Box = {
    x: base.viewBox.x,
    y: base.viewBox.y,
    w: base.viewBox.w * 2 + gap,
    h: base.viewBox.h,
  }
  const measured = measureGeometry(inner, viewBox)
  const nextBase: BaseDrawing = { inner, viewBox, ...measured }

  // Whole-body-normalized anchors/landmarks must retain their current absolute
  // positions when the content box grows to include the new instance.
  const remap = (nx: number, ny: number) => {
    const p = { x: box.x + nx * box.w, y: box.y + ny * box.h }
    return pointToNormalized(p, measured.contentBox)
  }
  return {
    ...doc,
    base: nextBase,
    anchors: doc.anchors.map((a) => {
      if (a.mode !== 'relative-bbox' || !a.relative || a.relative.targetId) return a
      return { ...a, relative: { ...a.relative, ...remap(a.relative.nx, a.relative.ny) } }
    }),
    landmarks: doc.landmarks.map((l) => {
      if (l.targetId) return l
      return { ...l, ...remap(l.nx, l.ny) }
    }),
  }
}

export const useStore = create<StoreState>((set, get) => ({
  doc: null,
  tool: 'anchor',
  selectedCalloutId: null,
  selectedTextId: null,
  selectedLandmarkId: null,
  selectedDrawingId: null,
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
    const sample = SAMPLES.find((s) => s.key === key) ?? SAMPLES[0]
    set({ status: `Loading ${sample.label}…` })
    try {
      const raw = await fetch(sampleUrl(sample.file)).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      const base = parseSvg(raw)
      const landmarks = buildLandmarksFor(sample.key, base.targetBoxes)
      const doc = makeDoc(sample.label, base, landmarks)
      if (withSeeds && key === 'divider') seedDivider(doc)
      set({
        doc,
        selectedCalloutId: null,
        selectedTextId: null,
        selectedLandmarkId: null,
        selectedDrawingId: null,
        status: '',
        tool: 'anchor',
        past: [],
        future: [],
        hoverLandmarkId: null,
      })
    } catch (e) {
      set({ status: `Failed to load sample: ${(e as Error).message}` })
    }
  },

  importSvgText: (name, raw) => {
    try {
      const base = parseSvg(raw)
      // imported SVGs get a catalog auto-derived from their named elements
      const landmarks = buildLandmarksFor(null, base.targetBoxes)
      const doc = makeDoc(name.replace(/\.svg$/i, ''), base, landmarks)
      set({
        doc,
        selectedCalloutId: null,
        selectedTextId: null,
        selectedLandmarkId: null,
        selectedDrawingId: null,
        status: '',
        tool: 'anchor',
        past: [],
        future: [],
        hoverLandmarkId: null,
      })
    } catch (e) {
      set({ status: `Import failed: ${(e as Error).message}` })
    }
  },

  loadDoc: (doc) =>
    set({
      doc,
      selectedCalloutId: null,
      selectedTextId: null,
      selectedLandmarkId: null,
      selectedDrawingId: null,
      status: '',
      tool: 'select',
      past: [],
      future: [],
      hoverLandmarkId: null,
    }),

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
    const prev = past[past.length - 1]
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [structuredClone(doc), ...future].slice(0, HISTORY_LIMIT),
    })
  },

  redo: () => {
    const { doc, past, future } = get()
    if (!future.length || !doc) return
    const next = future[0]
    set({
      doc: next,
      past: [...past, structuredClone(doc)].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    })
  },

  setTool: (t) => set({ tool: t }),
  select: (id) => set({
    selectedCalloutId: id,
    selectedTextId: null,
    selectedLandmarkId: null,
    selectedDrawingId: null,
  }),
  selectText: (id) => set({
    selectedTextId: id,
    selectedCalloutId: null,
    selectedLandmarkId: null,
    selectedDrawingId: null,
  }),
  selectLandmark: (id) => set({
    selectedLandmarkId: id,
    selectedCalloutId: null,
    selectedTextId: null,
    selectedDrawingId: null,
  }),
  selectDrawing: (id) => set({
    selectedDrawingId: id,
    selectedCalloutId: null,
    selectedTextId: null,
    selectedLandmarkId: null,
  }),

  setShowLandmarks: (v) => set({ showLandmarks: v }),
  setHoverLandmark: (id) => set({ hoverLandmarkId: id }),

  // add a new named location to the catalog (e.g. "save as landmark" on an
  // imported body so the point can be reused later)
  addLandmark: (name, point, targetId = null, group = 'Custom') => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const n = pointToNormalized(point, targetBoxFor(doc, targetId))
    const cleanGroup = group.trim() || 'Custom'
    const landmark: Landmark = {
      id: uid('lm'),
      name: name || 'Landmark',
      nx: n.nx,
      ny: n.ny,
      targetId,
      group: cleanGroup,
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

  addLandmarkAt: (point, targetId = null) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const n = pointToNormalized(point, targetBoxFor(doc, targetId))
    const group = doc.landmarkGroupOrder[0] || 'Custom'
    const landmark: Landmark = {
      id: uid('lm'),
      name: 'Landmark',
      nx: n.nx,
      ny: n.ny,
      targetId,
      group,
    }
    set({
      doc: {
        ...doc,
        landmarks: [...doc.landmarks, landmark],
        landmarkGroupOrder: doc.landmarkGroupOrder.includes(group)
          ? doc.landmarkGroupOrder
          : [...doc.landmarkGroupOrder, group],
      },
      selectedLandmarkId: landmark.id,
      selectedCalloutId: null,
      selectedTextId: null,
      selectedDrawingId: null,
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
    const n = pointToNormalized(point, targetBoxFor(doc, lm.targetId ?? null))
    get().updateLandmark(id, { nx: n.nx, ny: n.ny })
  },

  setLandmarkTarget: (id, targetId) => {
    const doc = get().doc
    if (!doc) return
    const lm = doc.landmarks.find((l) => l.id === id)
    if (!lm) return
    get().record()
    const currentBox = targetBoxFor(doc, lm.targetId ?? null)
    const point = { x: currentBox.x + lm.nx * currentBox.w, y: currentBox.y + lm.ny * currentBox.h }
    const n = pointToNormalized(point, targetBoxFor(doc, targetId))
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
    get().record()
    const targetId = lm.targetId ?? null
    const anchor: Anchor = {
      id: uid('anchor'),
      mode: 'relative-bbox',
      relative: { targetId, nx: lm.nx, ny: lm.ny },
    }
    const point = resolveAnchor(anchor, targetBoxFor(doc, targetId))
    const next = nextBalloonNumber(doc)
    const style = defaultStyle(get().presets, get().defaultPresetId)
    const callout: Callout = {
      id: uid('callout'),
      anchorId: anchor.id,
      labelText: lm.name,
      balloonText: String(next),
      ...style,
      labelPos: outwardLabelPos(doc.base, point),
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
      selectedCalloutId: callout.id,
      selectedTextId: null,
      selectedLandmarkId: null,
      selectedDrawingId: null,
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

  addCalloutAt: (point, targetId = null) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const n = pointToNormalized(point, targetBoxFor(doc, targetId))
    const anchor: Anchor = {
      id: uid('anchor'),
      mode: 'relative-bbox',
      relative: { targetId, nx: n.nx, ny: n.ny },
    }
    const next = nextBalloonNumber(doc)
    const style = defaultStyle(get().presets, get().defaultPresetId)
    const callout: Callout = {
      id: uid('callout'),
      anchorId: anchor.id,
      // start unnamed: a free-clicked point is a dot you name afterwards
      labelText: '',
      balloonText: String(next),
      ...style,
      labelPos: outwardLabelPos(doc.base, point),
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
      selectedCalloutId: callout.id,
      selectedTextId: null,
      selectedLandmarkId: null,
      selectedDrawingId: null,
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
    const targetId = anchor?.relative?.targetId ?? null
    const n = pointToNormalized(point, targetBoxFor(doc, targetId))
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
    const current = resolveAnchor(anchor, targetBoxFor(doc, anchor.relative?.targetId ?? null))
    const n = pointToNormalized(current, targetBoxFor(doc, targetId))
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
      ruleWidth: Math.max(120, doc.base.contentBox.w * 0.28),
    }
    set({
      doc: { ...doc, textAnnotations: [...doc.textAnnotations, item] },
      selectedTextId: item.id,
      selectedCalloutId: null,
      selectedLandmarkId: null,
      selectedDrawingId: null,
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
    set({
      doc: { ...doc, drawingElements: [...doc.drawingElements, item] },
      selectedDrawingId: item.id,
      selectedCalloutId: null,
      selectedTextId: null,
      selectedLandmarkId: null,
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

  duplicateBaseRight: (mirrored = false) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({ doc: duplicateBaseDocument(doc, mirrored), fitRequest: get().fitRequest + 1 })
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
  DIVIDER_SEEDS.forEach((s, i) => {
    const anchor: Anchor = {
      id: uid('anchor'),
      mode: 'relative-bbox',
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
    doc.textAnnotations.push({ id: uid('text'), ...seed })
  })
}

export { DEFAULT_SAMPLE_KEY, SAMPLES }
export type { BalloonShape, LabelMode, LeaderStyle }
