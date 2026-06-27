import { useCallback, useEffect, useRef } from 'react'
import { clientToSvg } from '../geometry'
import type { Vec2 } from '../types'

export interface DragSession {
  onMove: (svgPoint: Vec2, ev: PointerEvent) => void
  onEnd?: (ev: PointerEvent) => void
}

/**
 * Pointer-drag manager bound to an <svg>. Any element's onPointerDown can call
 * begin({onMove,onEnd}); subsequent window pointermove events are converted to
 * SVG user-space and forwarded until pointerup. Window-level listeners keep the
 * drag alive even if the cursor leaves the element.
 */
export function usePointerDrag(svgRef: React.RefObject<SVGSVGElement | null>) {
  const session = useRef<DragSession | null>(null)

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      if (!session.current || !svgRef.current) return
      ev.preventDefault()
      const p = clientToSvg(svgRef.current, ev.clientX, ev.clientY)
      session.current.onMove(p, ev)
    }
    const up = (ev: PointerEvent) => {
      if (!session.current) return
      const s = session.current
      session.current = null
      s.onEnd?.(ev)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [svgRef])

  return useCallback((s: DragSession) => {
    session.current = s
  }, [])
}
