import { create } from 'zustand'
import { boxForTarget, pointToNormalized, resolveAnchor } from './geometry'
import { uid } from './id'
import { buildLandmarksFor } from './landmarks'
import {
  DEFAULT_SAMPLE_KEY,
  DIVIDER_SEEDS,
  SAMPLES,
  sampleUrl,
} from './samples'
import { parseSvg } from './svgParse'
import type {
  Anchor,
  BalloonShape,
  BaseDrawing,
  Box,
  Callout,
  CalloutOverride,
  DrawerDoc,
  LabelMode,
  Landmark,
  LeaderStyle,
  Vec2,
  View,
} from './types'

export type Tool = 'select' | 'anchor'

const PALETTE = ['#1f6feb', '#d1242f', '#1a7f37', '#9a6700', '#8250df', '#bf3989']

function newView(name: string, labelMode: LabelMode): View {
  return { id: uid('view'), name, labelMode, overrides: {} }
}

function makeDoc(name: string, base: BaseDrawing, landmarks: Landmark[] = []): DrawerDoc {
  const view = newView('Names', 'names')
  return {
    id: uid('doc'),
    name,
    base,
    anchors: [],
    callouts: [],
    views: [view],
    activeViewId: view.id,
    landmarks,
  }
}

/** Place a label/balloon outward from the body center on the nearer side. */
function outwardLabelPos(base: BaseDrawing, point: Vec2): Vec2 {
  const center = base.contentBox.x + base.contentBox.w / 2
  const outX =
    point.x < center ? base.contentBox.x - 4 : base.contentBox.x + base.contentBox.w + 4
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
  status: string
  past: DrawerDoc[]
  future: DrawerDoc[]
  // landmark catalog UI
  showLandmarks: boolean
  hoverLandmarkId: string | null
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
  // landmark catalog
  setShowLandmarks: (v: boolean) => void
  setHoverLandmark: (id: string | null) => void
  addLandmark: (name: string, point: Vec2, targetId?: string | null) => void
  removeLandmark: (id: string) => void
  addCalloutAtLandmark: (landmarkId: string) => void
  // callouts
  addCalloutAt: (point: Vec2, targetId?: string | null) => void
  updateCalloutBase: (id: string, patch: Partial<Callout>) => void
  updateOverride: (id: string, patch: CalloutOverride) => void
  moveLabel: (id: string, pos: Vec2) => void
  moveAnchorForCallout: (id: string, point: Vec2) => void
  setAnchorTarget: (id: string, targetId: string | null) => void
  setElbow: (id: string, point: Vec2 | null) => void
  deleteCallout: (id: string) => void
  // views
  addView: (name: string, labelMode: LabelMode, copyFromActive?: boolean) => void
  setActiveView: (id: string) => void
  updateViewMeta: (id: string, patch: Partial<Pick<View, 'name' | 'labelMode'>>) => void
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

export const useStore = create<StoreState>((set, get) => ({
  doc: null,
  tool: 'anchor',
  selectedCalloutId: null,
  status: 'Loading…',
  past: [],
  future: [],
  showLandmarks: true,
  hoverLandmarkId: null,

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
  select: (id) => set({ selectedCalloutId: id }),

  setShowLandmarks: (v) => set({ showLandmarks: v }),
  setHoverLandmark: (id) => set({ hoverLandmarkId: id }),

  // add a new named location to the catalog (e.g. "save as landmark" on an
  // imported body so the point can be reused later)
  addLandmark: (name, point, targetId = null) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    const n = pointToNormalized(point, targetBoxFor(doc, targetId))
    const landmark: Landmark = {
      id: uid('lm'),
      name: name || 'Landmark',
      nx: n.nx,
      ny: n.ny,
      targetId,
      group: 'Custom',
    }
    set({ doc: { ...doc, landmarks: [...doc.landmarks, landmark] } })
  },

  removeLandmark: (id) => {
    const doc = get().doc
    if (!doc) return
    get().record()
    set({ doc: { ...doc, landmarks: doc.landmarks.filter((l) => l.id !== id) } })
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
    const callout: Callout = {
      id: uid('callout'),
      anchorId: anchor.id,
      labelText: lm.name,
      balloonShape: 'none',
      balloonText: String(next),
      leaderStyle: 'elbow',
      labelPos: outwardLabelPos(doc.base, point),
      elbow: null,
      color: PALETTE[(next - 1) % PALETTE.length],
    }
    set({
      doc: {
        ...doc,
        anchors: [...doc.anchors, anchor],
        callouts: [...doc.callouts, callout],
      },
      selectedCalloutId: callout.id,
    })
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
    const callout: Callout = {
      id: uid('callout'),
      anchorId: anchor.id,
      labelText: `Label ${next}`,
      balloonShape: 'none',
      balloonText: String(next),
      leaderStyle: 'elbow',
      labelPos: outwardLabelPos(doc.base, point),
      elbow: null,
      color: PALETTE[(next - 1) % PALETTE.length],
    }
    set({
      doc: {
        ...doc,
        anchors: [...doc.anchors, anchor],
        callouts: [...doc.callouts, callout],
      },
      selectedCalloutId: callout.id,
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
}

export { DEFAULT_SAMPLE_KEY, SAMPLES }
export type { BalloonShape, LabelMode, LeaderStyle }
