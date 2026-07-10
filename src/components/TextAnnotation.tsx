import { textAnnotationBounds } from '../geometry'
import type { TextAnnotation } from '../types'

interface Props {
  item: TextAnnotation
  selected: boolean
  onPointerDown: (e: React.PointerEvent, id: string) => void
}

/** Draggable standalone text, optionally with a textbook section-heading rule. */
export function TextAnnotationView({ item, selected, onPointerDown }: Props) {
  const bounds = textAnnotationBounds(item)
  const ruleY = item.pos.y + item.fontSize * 0.78
  const ruleCenter =
    item.align === 'middle'
      ? item.pos.x
      : item.align === 'start'
        ? item.pos.x + item.ruleWidth / 2
        : item.pos.x - item.ruleWidth / 2

  return (
    <g
      className={`text-annotation${selected ? ' selected' : ''}`}
      data-text-id={item.id}
      onPointerDown={(e) => onPointerDown(e, item.id)}
      style={{ cursor: 'move' }}
    >
      <rect
        x={bounds.x - item.fontSize * 0.25}
        y={bounds.y - item.fontSize * 0.2}
        width={bounds.w + item.fontSize * 0.5}
        height={bounds.h + item.fontSize * 0.4}
        fill="transparent"
      />
      <text
        x={item.pos.x}
        y={item.pos.y}
        textAnchor={item.align}
        dominantBaseline="central"
        fontSize={item.fontSize}
        fontWeight={item.fontWeight}
        fill={item.color}
      >
        {item.text}
      </text>
      {item.style === 'heading' && (
        <line
          x1={ruleCenter - item.ruleWidth / 2}
          y1={ruleY}
          x2={ruleCenter + item.ruleWidth / 2}
          y2={ruleY}
          stroke={item.color}
          strokeWidth={Math.max(1.5, item.fontSize * 0.065)}
          strokeLinecap="round"
        />
      )}
      {selected && (
        <rect
          x={bounds.x - item.fontSize * 0.3}
          y={bounds.y - item.fontSize * 0.25}
          width={bounds.w + item.fontSize * 0.6}
          height={bounds.h + item.fontSize * 0.5}
          fill="none"
          stroke="#1f6feb"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          pointerEvents="none"
        />
      )}
    </g>
  )
}
