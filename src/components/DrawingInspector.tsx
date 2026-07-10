import { useStore } from '../store'
import type { DrawingElementKind } from '../types'
import { CollapsiblePanel } from './CollapsiblePanel'

export function DrawingInspector() {
  const doc = useStore((s) => s.doc)
  const selectedId = useStore((s) => s.selectedDrawingId)
  const update = useStore((s) => s.updateDrawingElement)
  const remove = useStore((s) => s.deleteDrawingElement)
  const record = useStore((s) => s.record)
  if (!doc) return null
  const item = doc.drawingElements.find((d) => d.id === selectedId)
  if (!item) return null

  const number = (value: string) => Number(value) || 0
  return (
    <CollapsiblePanel title="Line / shape" className="drawing-inspector">
      <label className="field">
        Kind
        <select
          value={item.kind}
          onChange={(e) => {
            record()
            update(item.id, { kind: e.target.value as DrawingElementKind })
          }}
        >
          <option value="line">Line</option>
          <option value="rect">Rectangle</option>
        </select>
      </label>
      <div className="row">
        <label className="field">X1<input type="number" value={item.start.x} onFocus={record} onChange={(e) => update(item.id, { start: { ...item.start, x: number(e.target.value) } })} /></label>
        <label className="field">Y1<input type="number" value={item.start.y} onFocus={record} onChange={(e) => update(item.id, { start: { ...item.start, y: number(e.target.value) } })} /></label>
      </div>
      <div className="row">
        <label className="field">X2<input type="number" value={item.end.x} onFocus={record} onChange={(e) => update(item.id, { end: { ...item.end, x: number(e.target.value) } })} /></label>
        <label className="field">Y2<input type="number" value={item.end.y} onFocus={record} onChange={(e) => update(item.id, { end: { ...item.end, y: number(e.target.value) } })} /></label>
      </div>
      <div className="row">
        <label className="field">Stroke<input type="color" value={item.stroke} onFocus={record} onChange={(e) => update(item.id, { stroke: e.target.value })} /></label>
        <label className="field">Width<input type="number" min="0.5" step="0.5" value={item.strokeWidth} onFocus={record} onChange={(e) => update(item.id, { strokeWidth: Math.max(0.5, number(e.target.value)) })} /></label>
      </div>
      {item.kind === 'rect' && (
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={item.fill !== null}
            onChange={(e) => {
              record()
              update(item.id, { fill: e.target.checked ? '#ffffff' : null })
            }}
          />
          Fill rectangle
        </label>
      )}
      {item.kind === 'rect' && item.fill && (
        <label className="field">Fill color<input type="color" value={item.fill} onFocus={record} onChange={(e) => update(item.id, { fill: e.target.value })} /></label>
      )}
      <label className="field checkbox">
        <input type="checkbox" checked={item.dashed} onChange={(e) => { record(); update(item.id, { dashed: e.target.checked }) }} />
        Dashed
      </label>
      <button className="danger block" onClick={() => remove(item.id)}>Delete line / shape</button>
    </CollapsiblePanel>
  )
}
