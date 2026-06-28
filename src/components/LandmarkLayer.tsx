import type { Vec2 } from '../types'

export interface LandmarkMark extends Vec2 {
  id: string
  name: string
  /** has a callout already been placed here (best-effort, by name) */
  used: boolean
}

interface Props {
  marks: LandmarkMark[]
  hoverId: string | null
  fontSize: number
  onDown: (e: React.PointerEvent, id: string) => void
  onEnter: (id: string) => void
  onLeave: () => void
}

/**
 * The catalog rendered on the body: a small ring at each named location. These
 * are the snap targets — hover to preview, click to drop a named callout. Drawn
 * only while the Add-callout tool is active.
 */
export function LandmarkLayer({ marks, hoverId, fontSize, onDown, onEnter, onLeave }: Props) {
  const r = Math.max(3, fontSize * 0.3)
  return (
    <g className="landmark-layer">
      {marks.map((m) => {
        const hot = m.id === hoverId
        return (
          <g
            key={m.id}
            className={`landmark${hot ? ' hot' : ''}${m.used ? ' used' : ''}`}
            onPointerDown={(e) => onDown(e, m.id)}
            onPointerEnter={() => onEnter(m.id)}
            onPointerLeave={onLeave}
            style={{ cursor: 'copy' }}
          >
            {/* generous invisible hit pad for easy snapping */}
            <circle cx={m.x} cy={m.y} r={r * 2.4} fill="transparent" />
            <circle
              className="landmark-dot"
              cx={m.x}
              cy={m.y}
              r={hot ? r * 1.25 : r}
            />
            {hot && (
              <text
                className="landmark-name"
                x={m.x}
                y={m.y - r * 1.9}
                textAnchor="middle"
                fontSize={fontSize * 0.82}
              >
                {m.name}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}
