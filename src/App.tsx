import { useEffect, useRef } from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { DEFAULT_SAMPLE_KEY, useStore } from './store'

export default function App() {
  const loadSampleKey = useStore((s) => s.loadSampleKey)
  const loadedOnce = useRef(false)

  useEffect(() => {
    // guard against StrictMode's double-invoke firing two initial fetches
    if (loadedOnce.current) return
    loadedOnce.current = true
    if (!useStore.getState().doc) loadSampleKey(DEFAULT_SAMPLE_KEY, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
