import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { calloutName, siteById, siteLegendBox } from '../docModel'
import {
  boundsOfPoints,
  buildLeader,
  clientToSvg,
  diagramContentBounds,
  docContentBox,
  findImage,
  fontSizeFor,
  imageAtPoint,
  imageFrame,
  imageTransform,
  isImageVisible,
  landmarkPoint,
  nearestLandmark,
} from '../geometry'
import { usePointerDrag } from '../hooks/usePointerDrag'
import { resolveCallouts } from '../resolve'
import { useStore } from '../store'
import type { Box, DrawerDoc, DrawingElement, Vec2 } from '../types'
import { CalloutView } from './Callout'
import { DrawingElementView } from './DrawingElement'
import { ImageChrome, PlacedImage } from './ImageLayer'
import { LandmarkLayer, type LandmarkMark } from './LandmarkLayer'
import { SiteLegendView } from './SiteLegend'
import { TextAnnotationView } from './TextAnnotation'

/** Screen-space snap radius (px) for catalog landmarks. */
const SNAP_PX = 16

/** Read a body element's markup for the highlight overlay, stripping its id so
 * the clone doesn't collide with the original. Searches only the given image,
 * since copies of one drawing share element ids. */
function elementMarkup(root: SVGGElement | null, imageId: string | null, id: string | null): string | null {
  if (!root || !id) return null
  let el: Element | null = null
  try {
    const scope = imageId ? root.querySelector(`[data-image-id="${CSS.escape(imageId)}"]`) : root
    el = scope?.querySelector(`#${CSS.escape(id)}, [data-drawer-el="${CSS.escape(id)}"]`) ?? null
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
  const box = diagramContentBounds(
    docContentBox(doc),
    resolved,
    fs,
    doc.textAnnotations.filter((t) => isImageVisible(doc, t.imageId)),
    doc.drawingElements.filter((d) => isImageVisible(doc, d.imageId)),
  )
  const extra: Box[] = [box]
  const legend = siteLegendBox(doc)
  if (legend) extra.push(legend)
  if (doc.exportFrame === 'page') extra.push(doc.base.viewBox)
  const all = boundsOfPoints(extra.flatMap((b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]))
  return all.w > 0 && all.h > 0 ? all : doc.base.viewBox
}

/** Zoom limits scale with whichever is larger: the page or the content. */
function zoomSpan(doc: DrawerDoc): number {
  return Math.max(doc.base.viewBox.w, docContentBox(doc).w)
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
  const selectedLandmarkId = useStore((s) => s.selectedLandmarkId)
  const selectedDrawingId = useStore((s) => s.selectedDrawingId)
  const selectedImageId = useStore((s) => s.selectedImageId)
  const selectedSiteId = useStore((s) => s.selectedSiteId)
  const pendingSiteId = useStore((s) => s.pendingSiteId)
  const showSiteConnections = useStore((s) => s.showSiteConnections)
  const reference = useStore((s) => s.reference)
  const select = useStore((s) => s.select)
  const selectImage = useStore((s) => s.selectImage)
  const selectSite = useStore((s) => s.selectSite)
  const setImagePlacement = useStore((s) => s.setImagePlacement)
  const updateSiteLegend = useStore((s) => s.updateSiteLegend)
  const selectText = useStore((s) => s.selectText)
  const selectLandmark = useStore((s) => s.selectLandmark)
  const selectDrawing = useStore((s) => s.selectDrawing)
  const addCalloutAt = useStore((s) => s.addCalloutAt)
  const addCalloutAtLandmark = useStore((s) => s.addCalloutAtLandmark)
  const moveLabel = useStore((s) => s.moveLabel)
  const moveAnchor = useStore((s) => s.moveAnchorForCallout)
  const setElbow = useStore((s) => s.setElbow)
  const addTextAt = useStore((s) => s.addTextAt)
  const moveText = useStore((s) => s.moveText)
  const addLandmarkAt = useStore((s) => s.addLandmarkAt)
  const moveLandmark = useStore((s) => s.moveLandmark)
  const addDrawingElement = useStore((s) => s.addDrawingElement)
  const moveDrawingElement = useStore((s) => s.moveDrawingElement)
  const record = useStore((s) => s.record)
  const showLandmarks = useStore((s) => s.showLandmarks)
  const hoverLandmarkId = useStore((s) => s.hoverLandmarkId)
  const setHoverLandmark = useStore((s) => s.setHoverLandmark)
  const fitRequest = useStore((s) => s.fitRequest)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, w: 100 })
  const [highlightMarkup, setHighlightMarkup] = useState<string | null>(null)
  const [draftDrawing, setDraftDrawing] = useState<DrawingElement | null>(null)
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
        const span = zoomSpan(d)
        const w = Math.min(Math.max(c.w * factor, span * 0.05), span * 8)
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
  const usedNames = new Set(doc?.callouts.map((c) => calloutName(doc, c)) ?? [])
  const marks: LandmarkMark[] =
    doc && showLandmarks && (tool === 'anchor' || tool === 'landmark' || !!selectedLandmarkId)
      ? doc.landmarks
        .filter((lm) => !doc.hiddenLandmarkGroups.includes(lm.group || 'Other') && isImageVisible(doc, lm.imageId))
        .map((lm) => {
          const p = landmarkPoint(doc, lm)
          return { id: lm.id, name: lm.name, x: p.x, y: p.y, used: usedNames.has(lm.name) }
        })
      : []

  /** screen px -> svg user units at the current zoom */
  const unitsPerPx = () => camera.w / (svgRef.current?.getBoundingClientRect().width || size.w || 1)

  /** nearest catalog landmark to an svg point, within the screen snap radius */
  const snapAt = (p: Vec2) =>
    doc ? nearestLandmark(doc, doc.landmarks, p, SNAP_PX * unitsPerPx()) : null

  // region highlight: the named part under the hovered landmark, else the part
  // the selected callout is anchored to. Recolored clone overlays the original.
  const hoverLm = doc?.landmarks.find((l) => l.id === hoverLandmarkId)
  let highlightTargetId: string | null = hoverLm?.targetId ?? null
  let highlightImageId: string | null = hoverLm?.imageId ?? null
  if (!highlightTargetId && selectedId && doc) {
    const c = doc.callouts.find((x) => x.id === selectedId)
    const a = c && doc.anchors.find((x) => x.id === c.anchorId)
    highlightTargetId = a?.relative?.targetId ?? null
    highlightImageId = a?.imageId ?? null
  }
  if (!highlightTargetId && selectedLandmarkId && doc) {
    const lm = doc.landmarks.find((l) => l.id === selectedLandmarkId)
    highlightTargetId = lm?.targetId ?? null
    highlightImageId = lm?.imageId ?? null
  }
  const highlightImage = doc ? findImage(doc, highlightImageId) : undefined
  useLayoutEffect(() => {
    setHighlightMarkup(elementMarkup(bodyRef.current, highlightImageId, highlightTargetId))
  }, [highlightTargetId, highlightImageId, doc?.id])

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
    const span = zoomSpan(doc)
    setCamera((c) => {
      const w = Math.min(Math.max(c.w * factor, span * 0.05), span * 8)
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
    // which image, and which named part of it (if any), was clicked, so the
    // anchor can live on that image and target that part
    const imageEl = (e.target as Element).closest('.body-layer [data-image-id]')
    const hit = (e.target as Element).closest('[data-drawer-el],[id]')
    const inImage = !!imageEl && !!hit && imageEl.contains(hit) && hit !== imageEl
    const inBody = !!(e.target as Element).closest('.body-layer')
    const targetId = (imageEl ? inImage : inBody) && hit ? hit.id || hit.getAttribute('data-drawer-el') : null
    // line art is mostly empty: anywhere inside an image's frame counts as that image
    const image = findImage(doc, imageEl?.getAttribute('data-image-id')) ?? imageAtPoint(doc, downPoint)
    const imageId = image?.id ?? null

    // Select tool: grab an image to move it (locked images just get selected)
    if (tool === 'select' && image) {
      selectImage(image.id)
      if (!image.locked) {
        const start = { x: image.x, y: image.y }
        let rec = false
        begin({
          onMove: (p, ev) => {
            let x = start.x + p.x - downPoint.x
            let y = start.y + p.y - downPoint.y
            if (ev.shiftKey) {
              x = Math.round(x / 8) * 8
              y = Math.round(y / 8) * 8
            }
            if (!rec) {
              if (Math.hypot(p.x - downPoint.x, p.y - downPoint.y) < 2 * unitsPerPx()) return
              rec = true
              record()
            }
            setImagePlacement(image.id, { x, y })
          },
        })
        return
      }
    }

    if (tool === 'line' || tool === 'rect') {
      let endPoint = downPoint
      const kind = tool
      setDraftDrawing({
        id: 'draft',
        kind,
        start: downPoint,
        end: downPoint,
        stroke: '#111111',
        strokeWidth: 2,
        dashed: false,
        fill: null,
      })
      begin({
        onMove: (p) => {
          endPoint = p
          setDraftDrawing((draft) => draft ? { ...draft, end: p } : null)
        },
        onEnd: () => {
          setDraftDrawing(null)
          if (Math.hypot(endPoint.x - downPoint.x, endPoint.y - downPoint.y) > 2) {
            addDrawingElement(kind, downPoint, endPoint)
          }
        },
      })
      return
    }

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
            else addCalloutAt(downPoint, targetId, imageId)
          } else if (tool === 'text') {
            addTextAt(downPoint)
          } else if (tool === 'landmark') {
            addLandmarkAt(downPoint, targetId, imageId)
          } else if (!image) {
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

  // click a catalog marker to place a callout, or select/drag it while authoring
  const onLandmarkDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (tool === 'anchor') {
      addCalloutAtLandmark(id)
      return
    }
    if (!doc) return
    selectLandmark(id)
    const lm = doc.landmarks.find((l) => l.id === id)
    if (!lm) return
    const current = landmarkPoint(doc, lm)
    const start = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const offset = { x: current.x - start.x, y: current.y - start.y }
    let rec = false
    begin({
      onMove: (p) => {
        if (!rec) { rec = true; record() }
        moveLandmark(id, { x: p.x + offset.x, y: p.y + offset.y })
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
    const geo = buildLeader(c, c.fontSize || fontSize)
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

  // --- image resize: bottom-right corner, top-left stays put ---
  const onResizeDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || !doc) return
    e.stopPropagation()
    const image = findImage(doc, id)
    if (!image || image.locked) return
    const { angle, corners } = imageFrame(image)
    const tl = corners[0]
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    let rec = false
    begin({
      onMove: (p, ev) => {
        if (!rec) { rec = true; record() }
        const wx = p.x - tl.x
        const wy = p.y - tl.y
        const w = Math.max(10, wx * c + wy * s)
        // Alt frees the aspect ratio
        const h = ev.altKey ? Math.max(10, -wx * s + wy * c) : (w * image.height) / image.width
        const cx = tl.x + (w / 2) * c - (h / 2) * s
        const cy = tl.y + (w / 2) * s + (h / 2) * c
        setImagePlacement(id, { x: cx - w / 2, y: cy - h / 2, width: w, height: h })
      },
    })
  }

  // --- image rotate: about the box center ---
  const onRotateDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || !doc) return
    e.stopPropagation()
    const image = findImage(doc, id)
    if (!image || image.locked) return
    const { center } = imageFrame(image)
    let rec = false
    begin({
      onMove: (p, ev) => {
        if (!rec) { rec = true; record() }
        let deg = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI + 90
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15
        deg = ((deg + 540) % 360) - 180
        setImagePlacement(id, { rotation: Math.round(deg * 10) / 10 })
      },
    })
  }

  // --- site legend: drag to move, click a row to select its site ---
  const onLegendDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !doc?.siteLegend) return
    e.stopPropagation()
    const start = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    const origin = doc.siteLegend.pos
    let rec = false
    begin({
      onMove: (p) => {
        if (!rec) {
          if (Math.hypot(p.x - start.x, p.y - start.y) < 3 * unitsPerPx()) return
          rec = true
          record()
        }
        updateSiteLegend({ pos: { x: origin.x + p.x - start.x, y: origin.y + p.y - start.y } })
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

  const onDrawingDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    selectDrawing(id)
    let previous = clientToSvg(svgRef.current!, e.clientX, e.clientY)
    let rec = false
    begin({
      onMove: (p) => {
        if (!rec) { rec = true; record() }
        moveDrawingElement(id, { x: p.x - previous.x, y: p.y - previous.y })
        previous = p
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

            {/* page frame (the export crop when exporting the page) */}
            {doc.exportFrame === 'page' && (
              <rect
                className="page-frame"
                x={doc.base.viewBox.x}
                y={doc.base.viewBox.y}
                width={doc.base.viewBox.w}
                height={doc.base.viewBox.h}
                fill="none"
                stroke="#c3ccd6"
                strokeWidth={unitsPerPx()}
                strokeDasharray={`${6 * unitsPerPx()} ${4 * unitsPerPx()}`}
                pointerEvents="none"
              />
            )}

            {/* artwork: legacy base markup (normally empty) + placed images */}
            <g ref={bodyRef} className="body-layer">
              {doc.base.inner && <g dangerouslySetInnerHTML={{ __html: doc.base.inner }} />}
              {doc.images.map((image) => (
                <PlacedImage key={image.id} image={image} />
              ))}
            </g>

            {/* session-only tracing reference over the page */}
            {reference?.visible && (
              <image
                className="reference-overlay"
                href={reference.dataUrl}
                x={doc.base.viewBox.x}
                y={doc.base.viewBox.y}
                width={doc.base.viewBox.w}
                height={doc.base.viewBox.h}
                opacity={reference.opacity}
                preserveAspectRatio="none"
                pointerEvents="none"
              />
            )}

            {/* freely drawn divider lines and simple shapes */}
            {doc.drawingElements.filter((d) => isImageVisible(doc, d.imageId)).map((item) => (
              <DrawingElementView
                key={item.id}
                item={item}
                selected={selectedDrawingId === item.id}
                onPointerDown={onDrawingDown}
              />
            ))}
            {draftDrawing && <DrawingElementView item={draftDrawing} selected={false} draft />}

            {/* region highlight: recolored clone of the active named part */}
            {highlightMarkup && (
              <g
                className="region-highlight"
                pointerEvents="none"
                transform={highlightImage ? imageTransform(highlightImage) : undefined}
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
            {doc.textAnnotations.filter((t) => isImageVisible(doc, t.imageId)).map((item) => (
              <TextAnnotationView
                key={item.id}
                item={item}
                selected={selectedTextId === item.id}
                onPointerDown={onTextDown}
              />
            ))}

            {/* numbered site list */}
            <SiteLegendView
              doc={doc}
              selectedSiteId={selectedSiteId}
              connections={
                showSiteConnections && selectedSiteId
                  ? resolved.filter((c) => c.visible && c.siteId === selectedSiteId).map((c) => c.anchorPoint)
                  : []
              }
              onDown={onLegendDown}
              onRowClick={selectSite}
            />

            {/* callouts */}
            {resolved.map((c) => (
              <CalloutView
                key={c.id}
                c={c}
                fontSize={fontSize}
                selected={selectedId === c.id || (!!selectedSiteId && c.siteId === selectedSiteId)}
                editing={selectedId === c.id}
                onSelect={select}
                onLabelDown={onLabelDown}
                onAnchorDown={onAnchorDown}
                onElbowDown={onElbowDown}
              />
            ))}

            {/* selected image: frame + resize / rotate handles */}
            {selectedImageId && findImage(doc, selectedImageId) && (
              <ImageChrome
                image={findImage(doc, selectedImageId)!}
                unit={unitsPerPx()}
                onResizeDown={onResizeDown}
                onRotateDown={onRotateDown}
              />
            )}
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
      {doc && pendingSiteId && (
        <div className="canvas-hint" role="status">
          Click an image to place site {siteById(doc, pendingSiteId)?.number}
          {siteById(doc, pendingSiteId) ? ` (${siteById(doc, pendingSiteId)!.label})` : ''}. Esc cancels.
        </div>
      )}
      {!doc && <div className="canvas-empty">No drawing loaded.</div>}
    </>
  )
}
