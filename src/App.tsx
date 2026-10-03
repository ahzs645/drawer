import { useEffect, useRef } from 'react'
import { Canvas } from './components/Canvas'
import { DiagramMappingsPanel } from './components/DiagramMappingsPanel'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { parseProject, serializeProject } from './export/projectIo'
import { DEFAULT_SAMPLE_KEY, useStore } from './store'

const AUTOSAVE_KEY = 'drawer:autosave:v1'
const RESTORED_MSG = 'Restored your last session.'

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t) return false
  return (
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    t.isContentEditable
  )
}

export default function App() {
  const loadSampleKey = useStore((s) => s.loadSampleKey)
  const loadDoc = useStore((s) => s.loadDoc)
  const loadedOnce = useRef(false)

  // initial load: restore the autosaved session if present, else the demo
  useEffect(() => {
    if (loadedOnce.current) return
    loadedOnce.current = true
    if (useStore.getState().doc) return
    let restored = false
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) {
        loadDoc(parseProject(saved))
        useStore.setState({ status: RESTORED_MSG })
        restored = true
        window.setTimeout(() => {
          if (useStore.getState().status === RESTORED_MSG) useStore.setState({ status: '' })
        }, 4000)
      }
    } catch {
      /* ignore corrupt autosave and fall back to the demo */
    }
    if (!restored) loadSampleKey(DEFAULT_SAMPLE_KEY, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // debounced autosave on every document change
  useEffect(() => {
    let timer: number | undefined
    const unsub = useStore.subscribe((state, prev) => {
      if (state.doc === prev.doc || !state.doc) return
      const doc = state.doc
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, serializeProject(doc))
        } catch {
          useStore.setState({ status: 'Autosave failed. Export the project to keep your mappings and attachments.' })
        }
      }, 500)
    })
    return () => {
      window.clearTimeout(timer)
      unsub()
    }
  }, [])

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      const typing = isTypingTarget(document.activeElement)
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        if (typing) return
        e.preventDefault()
        s.redo()
      } else if (e.key === 'Escape') {
        if (s.pendingSiteId) s.startSitePlacement(null)
        else s.select(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          typing ||
          (!s.selectedCalloutId && !s.selectedTextId && !s.selectedLandmarkId && !s.selectedDrawingId && !s.selectedImageId && !s.selectedAreaId)
        ) return
        e.preventDefault()
        if (s.selectedCalloutId) s.deleteCallout(s.selectedCalloutId)
        else if (s.selectedAreaId) s.deleteArea(s.selectedAreaId)
        else if (s.selectedTextId) s.deleteText(s.selectedTextId)
        else if (s.selectedLandmarkId) s.removeLandmark(s.selectedLandmarkId)
        else if (s.selectedDrawingId) s.deleteDrawingElement(s.selectedDrawingId)
        else if (s.selectedImageId) {
          const image = s.doc?.images.find((i) => i.id === s.selectedImageId)
          const attached = s.doc?.anchors.filter((a) => a.imageId === s.selectedImageId).length ?? 0
          if (image && !image.locked && (!attached || window.confirm(`Delete ${image.name} and everything attached to it?`))) s.deleteImage(image.id)
        }
      } else if (e.key.startsWith('Arrow') && s.selectedImageId && !mod) {
        // nudge the selected image (Shift = 10 units)
        if (typing) return
        const image = s.doc?.images.find((i) => i.id === s.selectedImageId)
        if (!image || image.locked) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        if (!d) return
        s.record()
        s.setImagePlacement(image.id, { x: image.x + d[0], y: image.y + d[1] })
      } else if ((e.key === 'a' || e.key === 'A') && !mod && !e.altKey) {
        // auto-arrange the current view's labels into non-overlapping columns
        if (typing) return
        e.preventDefault()
        s.arrangeLabels()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Toolbar />
      <DiagramMappingsPanel />
      <div className="workspace">
        <main className="canvas-wrap">
          <Canvas />
        </main>
        <Sidebar />
      </div>
    </div>
  )
}
