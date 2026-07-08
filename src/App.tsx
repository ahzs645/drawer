import { useEffect, useRef } from 'react'
import { Canvas } from './components/Canvas'
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
          /* storage full / unavailable — best effort */
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
        s.select(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (typing || !s.selectedCalloutId) return
        e.preventDefault()
        s.deleteCallout(s.selectedCalloutId)
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
      <div className="workspace">
        <main className="canvas-wrap">
          <Canvas />
        </main>
        <Sidebar />
      </div>
    </div>
  )
}
