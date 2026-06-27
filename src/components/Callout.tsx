import {
  buildLeader,
  hexPoints,
  labelTextPlacement,
  polylineToPoints,
} from '../geometry'
import type { ResolvedCallout } from '../types'

export interface CalloutHandlers {
  onSelect: (id: string) => void
  onLabelDown: (e: React.PointerEvent, id: string) => void
  onAnchorDown: (e: React.PointerEvent, id: string) => void
  onElbowDown: (e: React.PointerEvent, id: string) => void
}

interface Props extends CalloutHandlers {
  c: ResolvedCallout
  selected: boolean
  editing: boolean
  fontSize: number
}

/** Pure presentational callout: anchor marker + leader + balloon + label. */
export function CalloutView({ c, selected, editing, fontSize, ...h }: Props) {
  if (!c.visible) return null
  const geo = buildLeader(c, fontSize)
  const anchor = c.anchorPoint
  const tp = labelTextPlacement(c, geo)
  const stroke = c.color
  const elbowPoint = c.leaderStyle === 'elbow' && geo.points.length >= 3 ? geo.points[1] : null

  return (
    <g
      className="callout"
      data-callout-id={c.id}
      data-anchor-x={anchor.x}
      data-anchor-y={anchor.y}
    >
      {/* leader line */}
      <polyline
        points={polylineToPoints(geo.points)}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 2.2 : 1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.95}
        pointerEvents="none"
      />

      {/* anchor marker on the body */}
      <g
        className="anchor-handle"
        onPointerDown={(e) => h.onAnchorDown(e, c.id)}
        style={{ cursor: 'crosshair' }}
      >
        <circle cx={anchor.x} cy={anchor.y} r={5.5} fill="#fff" stroke={stroke} strokeWidth={2} />
        <circle cx={anchor.x} cy={anchor.y} r={1.8} fill={stroke} />
      </g>

      {/* editable elbow handle */}
      {elbowPoint && selected && (
        <rect
          className="elbow-handle"
          x={elbowPoint.x - 4}
          y={elbowPoint.y - 4}
          width={8}
          height={8}
          fill="#fff"
          stroke={stroke}
          strokeWidth={1.5}
          onPointerDown={(e) => h.onElbowDown(e, c.id)}
          style={{ cursor: 'move' }}
        />
      )}

      {/* balloon + label, draggable together */}
      <g
        className="callout-head"
        onPointerDown={(e) => h.onLabelDown(e, c.id)}
        onClick={() => h.onSelect(c.id)}
        style={{ cursor: 'move' }}
      >
        {/* invisible hit pad so text/empty balloons are easy to grab */}
        <circle cx={c.labelPos.x} cy={c.labelPos.y} r={Math.max(geo.radius, 10)} fill="transparent" />

        {c.balloonShape === 'circle' && (
          <circle
            cx={c.labelPos.x}
            cy={c.labelPos.y}
            r={geo.radius}
            fill="#fff"
            stroke={stroke}
            strokeWidth={selected ? 2.2 : 1.6}
          />
        )}
        {c.balloonShape === 'hex' && (
          <polygon
            points={hexPoints(c.labelPos, geo.radius)}
            fill="#fff"
            stroke={stroke}
            strokeWidth={selected ? 2.2 : 1.6}
          />
        )}
        {c.balloonShape !== 'none' && c.balloonText && (
          <text
            x={c.labelPos.x}
            y={c.labelPos.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="balloon-text"
            fontSize={fontSize * 0.82}
            fill={stroke}
          >
            {c.balloonText}
          </text>
        )}

        {c.labelText && (
          <text
            x={tp.x}
            y={tp.y}
            textAnchor={tp.anchor}
            dominantBaseline="central"
            className="label-text"
            fontSize={fontSize}
            fill="#111"
          >
            {c.labelText}
          </text>
        )}
      </g>

      {selected && (
        <rect
          className="select-ring"
          x={Math.min(anchor.x, c.labelPos.x) - 14}
          y={Math.min(anchor.y, c.labelPos.y) - 14}
          width={Math.abs(anchor.x - c.labelPos.x) + 28}
          height={Math.abs(anchor.y - c.labelPos.y) + 28}
          fill="none"
          stroke={editing ? stroke : 'transparent'}
          strokeDasharray="4 4"
          strokeWidth={1}
          pointerEvents="none"
          opacity={0.4}
        />
      )}
    </g>
  )
}
