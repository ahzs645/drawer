import { create } from 'zustand'
import { pointToNormalized } from './geometry'
import { uid } from './id'
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
  Callout,
  CalloutOverride,
  DrawerDoc,
  LabelMode,
  LeaderStyle,
  Vec2,
  View,
} from './types'

export type Tool = 'select' | 'anchor'

const PALETTE = ['#1f6feb', '#d1242f', '#1a7f37', '#9a6700', '#8250df', '#bf3989']

function newView(name: string, labelMode: LabelMode): View {
  return { id: uid('view'), name, labelMode, overrides: {} }
}

function makeDoc(name: string, base: BaseDrawing): DrawerDoc {
  const view = newView('Names', 'names')
  return {
    id: uid('doc'),
    name,
    base,
    anchors: [],
    callouts: [],
    views: [view],
    activeViewId: view.id,
  }
}

interface StoreState {
  doc: DrawerDoc | null
  tool: Tool
  selectedCalloutId: string | null
  status: string
  // lifecycle
  loadSampleKey: (key: string, withSeeds?: boolean) => Promise<void>
  importSvgText: (name: string, raw: string) => void
  loadDoc: (doc: DrawerDoc) => void
  // tools / selection
  setTool: (t: Tool) => void
  select: (id: string | null) => void
  // callouts
  addCalloutAt: (point: Vec2, targetId?: string | null) => void
  updateCalloutBase: (id: string, patch: Partial<Callout>) => void
  updateOverride: (id: string, patch: CalloutOverride) => void
  moveLabel: (id: string, pos: Vec2) => void
  moveAnchorForCallout: (id: string, point: Vec2) => void
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

export const useStore = create<StoreState>((set, get) => ({
  doc: null,
  tool: 'anchor',
  selectedCalloutId: null,
  status: 'Loading…',

  loadSampleKey: async (key, withSeeds = false) => {
    const sample = SAMPLES.find((s) => s.key === key) ?? SAMPLES[0]
    set({ status: `Loading ${sample.label}…` })
    try {
      const raw = await fetch(sampleUrl(sample.file)).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      const base = parseSvg(raw)
      const doc = makeDoc(sample.label, base)
      if (withSeeds && key === 'divider') seedDivider(doc)
      set({ doc, selectedCalloutId: null, status: '', tool: 'anchor' })
    } catch (e) {
      set({ status: `Failed to load sample: ${(e as Error).message}` })
    }
  },

  importSvgText: (name, raw) => {
    try {
      const base = parseSvg(raw)
      const doc = makeDoc(name.replace(/\.svg$/i, ''), base)
      set({ doc, selectedCalloutId: null, status: '', tool: 'anchor' })
    } catch (e) {
      set({ status: `Import failed: ${(e as Error).message}` })
    }
  },

  loadDoc: (doc) => set({ doc, selectedCalloutId: null, status: '', tool: 'select' }),

  setTool: (t) => set({ tool: t }),
  select: (id) => set({ selectedCalloutId: id }),

  addCalloutAt: (point, targetId = null) => {
    const doc = get().doc
    if (!doc) return
    const n = pointToNormalized(point, doc.base.contentBox)
    const anchor: Anchor = {
      id: uid('anchor'),
      mode: 'relative-bbox',
      relative: { targetId, nx: n.nx, ny: n.ny },
    }
    // place the label outward from the body center, on the nearer horizontal edge
    const center = doc.base.contentBox.x + doc.base.contentBox.w / 2
    const outX = point.x < center
      ? doc.base.contentBox.x - 4
      : doc.base.contentBox.x + doc.base.contentBox.w + 4
    const labelPos: Vec2 = {
      x: outX,
      y: point.y,
    }
    // derive the next number from the max existing numeric balloon text so it
    // never collides with a survivor after a middle callout is deleted
    const maxNum = doc.callouts.reduce((m, c) => {
      const n = parseInt(c.balloonText, 10)
      return Number.isFinite(n) ? Math.max(m, n) : m
    }, 0)
    const next = maxNum + 1
    const callout: Callout = {
      id: uid('callout'),
      anchorId: anchor.id,
      labelText: `Label ${next}`,
      balloonShape: 'none',
      balloonText: String(next),
      leaderStyle: 'elbow',
      labelPos,
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
    const n = pointToNormalized(point, doc.base.contentBox)
    set({
      doc: {
        ...doc,
        anchors: doc.anchors.map((a) =>
          a.id === callout.anchorId
            ? { ...a, mode: 'relative-bbox', relative: { targetId: a.relative?.targetId ?? null, nx: n.nx, ny: n.ny } }
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
