import type { DrawingElement } from '../types'

interface Props {
  item: DrawingElement
  selected: boolean
  onPointerDown?: (e: React.PointerEvent, id: string) => void
  draft?: boolean
}

export function DrawingElementView({ item, selected, onPointerDown, draft = false }: Props) {
  const dash = item.dashed ? `${item.strokeWidth * 4} ${item.strokeWidth * 3}` : undefined
  const common = {
    stroke: item.stroke,
    strokeWidth: item.strokeWidth,
    strokeDasharray: dash,
    pointerEvents: 'none' as const,
  }
  const x = Math.min(item.start.x, item.end.x)
  const y = Math.min(item.start.y, item.end.y)
  const w = Math.abs(item.end.x - item.start.x)
  const h = Math.abs(item.end.y - item.start.y)

  return (
    <g
      className={`drawing-element${selected ? ' selected' : ''}${draft ? ' draft' : ''}`}
      data-drawing-id={item.id}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, item.id) : undefined}
      style={{ cursor: draft ? 'crosshair' : 'move', opacity: draft ? 0.65 : 1 }}
    >
      {item.kind === 'line' ? (
        <>
          <line {...common} x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} strokeLinecap="round" />
          <line x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="transparent" strokeWidth={Math.max(12, item.strokeWidth + 8)} />
        </>
      ) : (
        <>
          <rect {...common} x={x} y={y} width={w} height={h} fill={item.fill ?? 'none'} />
          <rect x={x} y={y} width={w} height={h} fill="transparent" stroke="transparent" strokeWidth={Math.max(12, item.strokeWidth + 8)} />
        </>
      )}
      {selected && (
        <>
          <circle cx={item.start.x} cy={item.start.y} r={5} fill="#fff" stroke="#1f6feb" strokeWidth={1.5} pointerEvents="none" />
          <circle cx={item.end.x} cy={item.end.y} r={5} fill="#fff" stroke="#1f6feb" strokeWidth={1.5} pointerEvents="none" />
        </>
      )}
    </g>
  )
}
