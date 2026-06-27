import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { buildLeader, clientToSvg, fontSizeFor } from '../geometry'
import { usePointerDrag } from '../hooks/usePointerDrag'
import { resolveCallouts } from '../resolve'
import { useStore } from '../store'
import type { Box, Vec2 } from '../types'
import { CalloutView } from './Callout'

/** Camera stores x/y/w; height is derived from the live viewport aspect so the
 * camera box aspect always equals the element's pixel aspect (no letterbox),
 * which keeps wheel-zoom focal math and pan exact. */
interface Camera {
  x: number
  y: number
  w: number
}

function padBox(b: Box, frac = 0.06): Box {
  const pad = Math.max(b.w, b.h) * frac
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
}

/** Initial camera that contains the (padded) drawing within the viewport aspect. */
function initCamera(viewBox: Box, size: { w: number; h: number }): Camera {
  const pad = padBox(viewBox)
  const aspect = size.w > 0 ? size.h / size.w : pad.h / pad.w
  const w = Math.max(pad.w, pad.h / aspect)
  const h = w * aspect
  const cx = pad.x + pad.w / 2
  const cy = pad.y + pad.h / 2
  return { x: cx - w / 2, y: cy - h / 2, w }
}

export function Canvas() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const begin = usePointerDrag(svgRef)

  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  const selectedId = useStore((s) => s.selectedCalloutId)
  const select = useStore((s) => s.select)
  const addCalloutAt = useStore((s) => s.addCalloutAt)
  const moveLabel = useStore((s) => s.moveLabel)
  const moveAnchor = useStore((s) => s.moveAnchorForCallout)
  const setElbow = useStore((s) => s.setElbow)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, w: 100 })
  const initedFor = useRef<string | null>(null)

  // track the rendered pixel size so the camera aspect can match it
  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width && r.height) setSize({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // (re)initialize the camera once per document, after the size is known
  useEffect(() => {
    if (!doc || !size.w) return
    if (initedFor.current === doc.id) return
    initedFor.current = doc.id
    setCamera(initCamera(doc.base.viewBox, size))
  }, [doc?.id, size.w, size.h])

  if (!doc) return <div className="canvas-empty">No drawing loaded.</div>

  const resolved = resolveCallouts(doc)
  const fontSize = fontSizeFor(doc.base.viewBox)
  const aspect = size.w > 0 ? size.h / size.w : 1
  const camH = camera.w * aspect

  // --- background: place (anchor tool) or pan ---
  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const svg = svgRef.current!
    const downPoint = clientToSvg(svg, e.clientX, e.clientY)
    const rectW = svg.getBoundingClientRect().width || size.w || 1
    let lastX = e.clientX
    let lastY = e.clientY
    let moved = 0
    begin({
      onMove: (_p, ev) => {
        const dxPx = ev.clientX - lastX
        const dyPx = ev.clientY - lastY
        lastX = ev.clientX
        lastY = ev.clientY
        moved += Math.abs(dxPx) + Math.abs(dyPx)
        setCamera((c) => {
          const unitsPerPx = c.w / rectW
          return { ...c, x: c.x - dxPx * unitsPerPx, y: c.y - dyPx * unitsPerPx }
        })
      },
      onEnd: () => {
        if (moved < 4) {
          if (tool === 'anchor') addCalloutAt(downPoint)
          else select(null)
        }
      },
    })
  }

  // --- label/balloon drag (per-view position) ---
  const onLabelDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    select(id)
    const c = resolved.find((r) => r.id === id)
    if (!c) return
    const start = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const offset: Vec2 = { x: c.labelPos.x - start.x, y: c.labelPos.y - start.y }
    begin({ onMove: (p) => moveLabel(id, { x: p.x + offset.x, y: p.y + offset.y }) })
  }

  // --- anchor drag (body-locked, affects all views) ---
  const onAnchorDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    select(id)
    const c = resolved.find((r) => r.id === id)
    if (!c) return
    const start = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const offset: Vec2 = { x: c.anchorPoint.x - start.x, y: c.anchorPoint.y - start.y }
    begin({ onMove: (p) => moveAnchor(id, { x: p.x + offset.x, y: p.y + offset.y }) })
  }

  // --- elbow drag (grab offset, matching label/anchor) ---
  const onElbowDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    select(id)
    const c = resolved.find((r) => r.id === id)
    if (!c) return
    const geo = buildLeader(c, fontSize)
    const cur = geo.points.length >= 3 ? geo.points[1] : c.labelPos
    const start = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const offset: Vec2 = { x: cur.x - start.x, y: cur.y - start.y }
    begin({ onMove: (p) => setElbow(id, { x: p.x + offset.x, y: p.y + offset.y }) })
  }

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
    const p = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    setCamera((c) => {
      const w = Math.min(
        Math.max(c.w * factor, doc.base.viewBox.w * 0.05),
        doc.base.viewBox.w * 8,
      )
      const k = w / c.w
      // uniform scale (camH scales with w by the same k), so pivot p stays fixed
      return { x: p.x - (p.x - c.x) * k, y: p.y - (p.y - c.y) * k, w }
    })
  }

  return (
    <svg
      ref={svgRef}
      className={`canvas tool-${tool}`}
      viewBox={`${camera.x} ${camera.y} ${camera.w} ${camH}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
    >
      {/* background hit target */}
      <rect
        x={camera.x}
        y={camera.y}
        width={camera.w}
        height={camH}
        fill="#ffffff"
        onPointerDown={onBackgroundDown}
      />

      {/* base body drawing */}
      <g className="body-layer" dangerouslySetInnerHTML={{ __html: doc.base.inner }} />

      {/* callouts */}
      {resolved.map((c) => (
        <CalloutView
          key={c.id}
          c={c}
          fontSize={fontSize}
          selected={selectedId === c.id}
          editing={selectedId === c.id}
          onSelect={select}
          onLabelDown={onLabelDown}
          onAnchorDown={onAnchorDown}
          onElbowDown={onElbowDown}
        />
      ))}
    </svg>
  )
}
