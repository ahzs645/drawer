import { findImage, imageTransform, isImageVisible } from '../geometry'
import { areaCenter, imageScale } from '../surface'
import type { AreaShape, DrawerDoc, Vec2 } from '../types'

/** One drawn area shape in its own (drawing or page) coordinates. */
export function AreaShapeView({
  shape,
  className,
  open = false,
  ...rest
}: {
  shape: AreaShape
  className: string
  /** draw a polygon as an open polyline (the in-progress draft) */
  open?: boolean
} & Omit<React.SVGProps<SVGElement>, 'className'>) {
  const props = { className, vectorEffect: 'non-scaling-stroke', ...rest } as React.SVGProps<SVGElement>
  switch (shape.kind) {
    case 'rect':
      return <rect {...(props as React.SVGProps<SVGRectElement>)} x={shape.x} y={shape.y} width={shape.w} height={shape.h} />
    case 'ellipse':
      return <ellipse {...(props as React.SVGProps<SVGEllipseElement>)} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
    case 'polygon': {
      const points = shape.points.map((p) => `${p.x},${p.y}`).join(' ')
      return open
        ? <polyline {...(props as React.SVGProps<SVGPolylineElement>)} points={points} />
        : <polygon {...(props as React.SVGProps<SVGPolygonElement>)} points={points} />
    }
    default:
      return null
  }
}

/** Wrap drawing-space content in its image's transform (page content passes through). */
function InImage({ doc, imageId, children }: { doc: DrawerDoc; imageId?: string | null; children: React.ReactNode }) {
  const image = findImage(doc, imageId)
  return image ? <g transform={imageTransform(image)}>{children}</g> : <>{children}</>
}

interface AreaLayerProps {
  doc: DrawerDoc
  selectedAreaId: string | null
  /** members of the selected group, highlighted together */
  groupAreaIds: Set<string>
  /** outline markup of each part area's element, keyed by area id (read from the canvas) */
  partMarkup: Record<string, string>
  fontSize: number
  /** areas take clicks (Select tool); otherwise clicks fall through to the drawing */
  interactive: boolean
  onDown: (e: React.PointerEvent, id: string) => void
}

/**
 * Areas on the canvas: drawn shapes and outlines of named parts, placed
 * through their image's transform so they follow every move, resize, rotation
 * and mirror, plus a label at each area's centre.
 */
export function AreaLayer({ doc, selectedAreaId, groupAreaIds, partMarkup, fontSize, interactive, onDown }: AreaLayerProps) {
  const areas = (doc.areas ?? []).filter((a) => isImageVisible(doc, a.imageId))
  if (!areas.length) return null
  const state = (id: string) => (id === selectedAreaId ? ' selected' : groupAreaIds.has(id) ? ' in-group' : '')
  return (
    <g className={`area-layer${interactive ? ' interactive' : ''}`} pointerEvents={interactive ? undefined : 'none'}>
      {areas.map((area) => {
        const cls = `area-shape${state(area.id)}`
        if (area.shape.kind === 'part') {
          const markup = partMarkup[area.id]
          if (!markup) return null
          return (
            <InImage key={area.id} doc={doc} imageId={area.imageId}>
              <g
                className={`${cls} area-part`}
                data-area-id={area.id}
                onPointerDown={(e) => onDown(e, area.id)}
                dangerouslySetInnerHTML={{ __html: markup }}
              />
            </InImage>
          )
        }
        return (
          <InImage key={area.id} doc={doc} imageId={area.imageId}>
            <AreaShapeView shape={area.shape} className={cls} data-area-id={area.id} onPointerDown={(e) => onDown(e, area.id)} />
          </InImage>
        )
      })}
      {areas.map((area) => {
        const c = areaCenter(doc, area)
        return (
          <text
            key={`label-${area.id}`}
            className={`area-label${state(area.id)}`}
            x={c.x}
            y={c.y}
            fontSize={fontSize * 0.7}
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
          >
            {area.label}
          </text>
        )
      })}
    </g>
  )
}

/** The shape being drawn with the Area tool (plus the rubber band to the cursor). */
export function AreaDraftView({
  doc,
  imageId,
  shape,
  cursor,
  unit,
}: {
  doc: DrawerDoc
  imageId: string | null
  shape: AreaShape
  cursor?: Vec2 | null
  /** page units per screen pixel, so vertex dots keep a constant size */
  unit: number
}) {
  const r = (4 * unit) / imageScale(doc, imageId ?? undefined)
  const draft = shape.kind === 'polygon' && cursor ? { ...shape, points: [...shape.points, cursor] } : shape
  return (
    <g className="area-draft" pointerEvents="none">
      <InImage doc={doc} imageId={imageId}>
        <AreaShapeView shape={draft} className="area-shape draft" open={shape.kind === 'polygon'} />
        {shape.kind === 'polygon' &&
          shape.points.map((p, i) => (
            <circle key={i} className={`area-vertex${i === 0 ? ' first' : ''}`} cx={p.x} cy={p.y} r={r} vectorEffect="non-scaling-stroke" />
          ))}
      </InImage>
    </g>
  )
}
