import { imageFrame, imageTransform } from '../geometry'
import type { ImageInstance } from '../types'

/** One placed drawing. Pointer handling lives on the canvas (hit-tested by data-image-id). */
export function PlacedImage({ image }: { image: ImageInstance }) {
  if (image.visible === false) return null
  return (
    <g
      className={`image${image.locked ? ' locked' : ''}`}
      data-image-id={image.id}
      transform={imageTransform(image)}
      dangerouslySetInnerHTML={{ __html: image.drawing.inner }}
    />
  )
}

interface ChromeProps {
  image: ImageInstance
  /** page units per screen pixel, so handles keep a constant on-screen size */
  unit: number
  onResizeDown: (e: React.PointerEvent, id: string) => void
  onRotateDown: (e: React.PointerEvent, id: string) => void
}

/** Selection frame for the selected image, with resize (corner) and rotate (top) handles. */
export function ImageChrome({ image, unit, onResizeDown, onRotateDown }: ChromeProps) {
  if (image.visible === false) return null
  const { center, angle, corners } = imageFrame(image)
  const points = corners.map((p) => `${p.x},${p.y}`).join(' ')
  const handle = 10 * unit
  const br = corners[2]
  // rotation handle sits above the top edge's midpoint
  const top = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }
  const lift = 26 * unit
  const rot = { x: top.x + Math.sin(angle) * lift, y: top.y - Math.cos(angle) * lift }
  const color = image.locked ? '#8a94a3' : '#2674bd'
  return (
    <g className="image-chrome" data-image-chrome={image.id}>
      <polygon
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5 * unit}
        strokeDasharray={`${7 * unit} ${4 * unit}`}
        pointerEvents="none"
      />
      {!image.locked && (
        <>
          <line x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} stroke={color} strokeWidth={1.2 * unit} pointerEvents="none" />
          <circle
            className="rotate-handle"
            data-rotate-handle={image.id}
            cx={rot.x}
            cy={rot.y}
            r={handle * 0.6}
            fill="#fff"
            stroke={color}
            strokeWidth={1.5 * unit}
            onPointerDown={(e) => onRotateDown(e, image.id)}
          >
            <title>Drag to rotate (Shift snaps to 15°)</title>
          </circle>
          <rect
            className="resize-handle"
            data-resize-handle={image.id}
            x={br.x - handle / 2}
            y={br.y - handle / 2}
            width={handle}
            height={handle}
            fill="#fff"
            stroke={color}
            strokeWidth={1.5 * unit}
            onPointerDown={(e) => onResizeDown(e, image.id)}
          >
            <title>Drag to resize (Alt frees the aspect ratio)</title>
          </rect>
        </>
      )}
      <circle cx={center.x} cy={center.y} r={2 * unit} fill={color} pointerEvents="none" />
    </g>
  )
}
