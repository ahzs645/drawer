import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  buildLeader,
  clientToSvg,
  diagramContentBounds,
  fontSizeFor,
  landmarkPoint,
  nearestLandmark,
} from '../geometry'
import { usePointerDrag } from '../hooks/usePointerDrag'
import { resolveCallouts } from '../resolve'
import { useStore } from '../store'
import type { Box, DrawerDoc, Vec2 } from '../types'
import { CalloutView } from './Callout'
import { LandmarkLayer, type LandmarkMark } from './LandmarkLayer'
import { TextAnnotationView } from './TextAnnotation'

/** Screen-space snap radius (px) for catalog landmarks. */
const SNAP_PX = 16

/** Read a body element's markup for the highlight overlay, stripping its id so
 * the clone doesn't collide with the original. */
function elementMarkup(root: SVGGElement | null, id: string | null): string | null {
  if (!root || !id) return null
  let el: Element | null = null
  try {
    el = root.querySelector(`#${CSS.escape(id)}, [data-drawer-el="${CSS.escape(id)}"]`)
  } catch {
    return null
  }
  if (!el) return null
  const clone = el.cloneNode(true) as Element
  clone.removeAttribute('id')
  clone.removeAttribute('data-drawer-el')
  return clone.outerHTML
}

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

/**
 * The box the camera should fit: the body plus every visible callout label, so
 * arranged labels in the side columns stay on screen. Falls back to the imported
 * viewBox when the content box is degenerate.
 */
function contentFitBox(doc: DrawerDoc): Box {
  const resolved = resolveCallouts(doc)
  const fs = fontSizeFor(doc.base.viewBox)
  const box = diagramContentBounds(doc.base.contentBox, resolved, fs, doc.textAnnotations)
  return box.w > 0 && box.h > 0 ? box : doc.base.viewBox
}

/** Initial camera that contains the (padded) drawing within the viewport aspect. */
function initCamera(viewBox: Box, size: { w: number; h: number }): Camera {
  const pad = padBox(viewBox)
  const aspect = size.w > 0 ? size.h / size.w : pad.h / pad.w
  const w = Math.max(pad.w, pad.h / aspect)
  const cx = pad.x + pad.w / 2
  const cy = pad.y + pad.h / 2
  return { x: cx - w / 2, y: cy - (w * aspect) / 2, w }
}

export function Canvas() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const bodyRef = useRef<SVGGElement | null>(null)
  const begin = usePointerDrag(svgRef)

  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  const selectedId = useStore((s) => s.selectedCalloutId)
  const selectedTextId = useStore((s) => s.selectedTextId)
  const select = useStore((s) => s.select)
  const selectText = useStore((s) => s.selectText)
  const addCalloutAt = useStore((s) => s.addCalloutAt)
  const addCalloutAtLandmark = useStore((s) => s.addCalloutAtLandmark)
  const moveLabel = useStore((s) => s.moveLabel)
  const moveAnchor = useStore((s) => s.moveAnchorForCallout)
  const setElbow = useStore((s) => s.setElbow)
  const addTextAt = useStore((s) => s.addTextAt)
  const moveText = useStore((s) => s.moveText)
  const record = useStore((s) => s.record)
  const showLandmarks = useStore((s) => s.showLandmarks)
  const hoverLandmarkId = useStore((s) => s.hoverLandmarkId)
  const setHoverLandmark = useStore((s) => s.setHoverLandmark)
  const fitRequest = useStore((s) => s.fitRequest)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, w: 100 })
  const [highlightMarkup, setHighlightMarkup] = useState<string | null>(null)
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
    setCamera(initCamera(contentFitBox(doc), size))
  }, [doc?.id, size.w, size.h])

  // non-passive wheel listener so zooming never scrolls the page
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheelNative = (e: WheelEvent) => {
      const d = useStore.getState().doc
      if (!d) return
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
      const p = clientToSvg(el, e.clientX, e.clientY)
      setCamera((c) => {
        const w = Math.min(
          Math.max(c.w * factor, d.base.viewBox.w * 0.05),
          d.base.viewBox.w * 8,
        )
        const k = w / c.w
        return { x: p.x - (p.x - c.x) * k, y: p.y - (p.y - c.y) * k, w }
      })
    }
    el.addEventListener('wheel', onWheelNative, { passive: false })
    return () => el.removeEventListener('wheel', onWheelNative)
  }, [])

  const resolved = doc ? resolveCallouts(doc) : []
  const fontSize = doc ? fontSizeFor(doc.base.viewBox) : 14
  const aspect = size.w > 0 ? size.h / size.w : 1
  const camH = camera.w * aspect

  // catalog markers resolved to user-space points (best-effort "used" by name)
  const usedNames = new Set(doc?.callouts.map((c) => c.labelText) ?? [])
  const marks: LandmarkMark[] =
    doc && showLandmarks && tool === 'anchor'
      ? doc.landmarks.map((lm) => {
          const p = landmarkPoint(doc.base, lm)
          return { id: lm.id, name: lm.name, x: p.x, y: p.y, used: usedNames.has(lm.name) }
        })
      : []

  /** screen px -> svg user units at the current zoom */
  const unitsPerPx = () => camera.w / (svgRef.current?.getBoundingClientRect().width || size.w || 1)

  /** nearest catalog landmark to an svg point, within the screen snap radius */
  const snapAt = (p: Vec2) =>
    doc ? nearestLandmark(doc.base, doc.landmarks, p, SNAP_PX * unitsPerPx()) : null

  // region highlight: the named part under the hovered landmark, else the part
  // the selected callout is anchored to. Recolored clone overlays the original.
  const hoverLm = doc?.landmarks.find((l) => l.id === hoverLandmarkId)
  let highlightTargetId: string | null = hoverLm?.targetId ?? null
  if (!highlightTargetId && selectedId && doc) {
    const c = doc.callouts.find((x) => x.id === selectedId)
    const a = c && doc.anchors.find((x) => x.id === c.anchorId)
    highlightTargetId = a?.relative?.targetId ?? null
  }
  useLayoutEffect(() => {
    setHighlightMarkup(elementMarkup(bodyRef.current, highlightTargetId))
  }, [highlightTargetId, doc?.id])

  const fitView = () => {
    if (doc && size.w) setCamera(initCamera(contentFitBox(doc), size))
  }
  // honor an external fit request (bumped by the store after an explicit arrange)
  useEffect(() => {
    if (fitRequest > 0 && doc && size.w) setCamera(initCamera(contentFitBox(doc), size))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest])
  const zoomBy = (factor: number) => {
    if (!doc) return
    setCamera((c) => {
      const w = Math.min(
        Math.max(c.w * factor, doc.base.viewBox.w * 0.05),
        doc.base.viewBox.w * 8,
      )
      const cx = c.x + c.w / 2
      const cyc = c.y + (c.w * aspect) / 2
      return { x: cx - w / 2, y: cyc - (w * aspect) / 2, w }
    })
  }

  // --- canvas background/body: place (anchor tool) or pan ---
  const onCanvasDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !doc) return
    const svg = svgRef.current!
    const downPoint = clientToSvg(svg, e.clientX, e.clientY)
    // which body element (if any) was clicked, so the anchor can target that part
    const hit = (e.target as Element).closest('[data-drawer-el],[id]')
    const inBody = !!(e.target as Element).closest('.body-layer')
    const targetId = inBody && hit ? hit.id || hit.getAttribute('data-drawer-el') : null
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
          if (tool === 'anchor') {
            // a click near a catalog landmark snaps to it (named + locked)
            const snap = snapAt(downPoint)
            if (snap) addCalloutAtLandmark(snap.landmark.id)
            else addCalloutAt(downPoint, targetId)
          } else if (tool === 'text') {
            addTextAt(downPoint)
          } else {
            select(null)
          }
        }
      },
    })
  }

  // hover preview: in the Add-callout tool, highlight the nearest snap target
  const onCanvasMove = (e: React.PointerEvent) => {
    if (!doc || tool !== 'anchor') return
    const p = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const snap = snapAt(p)
    const id = snap?.landmark.id ?? null
    if (id !== useStore.getState().hoverLandmarkId) setHoverLandmark(id)
  }

  // click a catalog marker directly -> place a named callout there
  const onLandmarkDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    addCalloutAtLandmark(id)
  }

  // --- label/balloon drag (per-view position) ---
  const onLabelDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    select(id)
    const c = resolved.find((r) => r.id === id)
    if (!c) return
    const start = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const offset: Vec2 = { x: c.labelPos.x - start.x, y: c.labelPos.y - start.y }
    let rec = false
    begin({
      onMove: (p) => {
        if (!rec) { rec = true; record() }
        moveLabel(id, { x: p.x + offset.x, y: p.y + offset.y })
      },
    })
  }

  // --- anchor drag (body-locked, affects all views) ---
  const onAnchorDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    select(id)
    const c = resolved.find((r) => r.id === id)
    if (!c) return
    const start = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const offset: Vec2 = { x: c.anchorPoint.x - start.x, y: c.anchorPoint.y - start.y }
    let rec = false
    begin({
      onMove: (p) => {
        if (!rec) { rec = true; record() }
        const raw = { x: p.x + offset.x, y: p.y + offset.y }
        // snap the dragged anchor onto a nearby catalog landmark
        const snap = snapAt(raw)
        setHoverLandmark(snap?.landmark.id ?? null)
        moveAnchor(id, snap ? snap.point : raw)
      },
      onEnd: () => setHoverLandmark(null),
    })
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
    let rec = false
    begin({
      onMove: (p) => {
        if (!rec) { rec = true; record() }
        setElbow(id, { x: p.x + offset.x, y: p.y + offset.y })
      },
    })
  }

  // --- standalone text drag ---
  const onTextDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || !doc) return
    e.stopPropagation()
    selectText(id)
    const item = doc.textAnnotations.find((t) => t.id === id)
    if (!item) return
    const start = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const offset: Vec2 = { x: item.pos.x - start.x, y: item.pos.y - start.y }
    let rec = false
    begin({
      onMove: (p) => {
        if (!rec) { rec = true; record() }
        moveText(id, { x: p.x + offset.x, y: p.y + offset.y })
      },
    })
  }

  return (
    <>
      <svg
        ref={svgRef}
        className={`canvas tool-${tool}`}
        viewBox={`${camera.x} ${camera.y} ${camera.w} ${camH}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
      >
        {doc && (
          <>
            {/* background hit target */}
            <rect
              x={camera.x}
              y={camera.y}
              width={camera.w}
              height={camH}
              fill="#ffffff"
            />

            {/* base body drawing */}
            <g
              ref={bodyRef}
              className="body-layer"
              dangerouslySetInnerHTML={{ __html: doc.base.inner }}
            />

            {/* region highlight: recolored clone of the active named part */}
            {highlightMarkup && (
              <g
                className="region-highlight"
                pointerEvents="none"
                dangerouslySetInnerHTML={{ __html: highlightMarkup }}
              />
            )}

            {/* catalog snap targets (Add-callout tool only) */}
            <LandmarkLayer
              marks={marks}
              hoverId={hoverLandmarkId}
              fontSize={fontSize}
              onDown={onLandmarkDown}
              onEnter={(id) => setHoverLandmark(id)}
              onLeave={() => setHoverLandmark(null)}
            />

            {/* standalone headings, figure letters, and captions */}
            {doc.textAnnotations.map((item) => (
              <TextAnnotationView
                key={item.id}
                item={item}
                selected={selectedTextId === item.id}
                onPointerDown={onTextDown}
              />
            ))}

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
          </>
        )}
      </svg>
      {doc && (
        <div className="zoom-controls">
          <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out" aria-label="Zoom out">−</button>
          <button onClick={fitView} title="Fit to view">Fit</button>
          <button onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in">+</button>
        </div>
      )}
      {!doc && <div className="canvas-empty">No drawing loaded.</div>}
    </>
  )
}
