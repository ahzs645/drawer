import { resolveCallouts } from '../resolve'
import { useStore } from '../store'
import { CollapsiblePanel } from './CollapsiblePanel'
import { DrawingInspector } from './DrawingInspector'
import { Inspector } from './Inspector'
import { LandmarkInspector } from './LandmarkInspector'
import { LandmarkPanel } from './LandmarkPanel'
import { TextInspector } from './TextInspector'
import { ViewBar } from './ViewBar'

function CalloutList() {
  const doc = useStore((s) => s.doc)
  const selectedId = useStore((s) => s.selectedCalloutId)
  const select = useStore((s) => s.select)
  const updateOverride = useStore((s) => s.updateOverride)
  const record = useStore((s) => s.record)

  if (!doc) return null
  const view = doc.views.find((v) => v.id === doc.activeViewId) ?? doc.views[0]
  const resolved = resolveCallouts(doc)

  return (
    <CollapsiblePanel title={`Callouts (${doc.callouts.length})`} className="callout-list">
      {doc.callouts.length === 0 && <p className="hint">No callouts yet.</p>}
      <ul>
        {doc.callouts.map((c, i) => {
          const r = resolved[i]
          const visible = view.overrides[c.id]?.visible ?? true
          return (
            <li
              key={c.id}
              className={c.id === selectedId ? 'selected' : ''}
              onClick={() => select(c.id)}
            >
              <span className="swatch" style={{ background: c.color }} />
              <span className="cl-index">{r?.visible ? r.index : '–'}</span>
              <span className="cl-name">
                {c.labelText || <span className="cl-unnamed">Unnamed</span>}
              </span>
              <input
                type="checkbox"
                checked={visible}
                title="Visible in this view"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  record()
                  updateOverride(c.id, { visible: e.target.checked })
                }}
              />
            </li>
          )
        })}
      </ul>
    </CollapsiblePanel>
  )
}

function TextList() {
  const doc = useStore((s) => s.doc)
  const selectedTextId = useStore((s) => s.selectedTextId)
  const selectText = useStore((s) => s.selectText)

  if (!doc || doc.textAnnotations.length === 0) return null
  return (
    <CollapsiblePanel title={`Text (${doc.textAnnotations.length})`} className="text-list">
      <ul>
        {doc.textAnnotations.map((item) => (
          <li
            key={item.id}
            className={item.id === selectedTextId ? 'selected' : ''}
            onClick={() => selectText(item.id)}
          >
            <span className="text-kind" aria-hidden="true">
              {item.style === 'heading' ? 'H' : 'T'}
            </span>
            <span className="cl-name">{item.text || <span className="cl-unnamed">Empty text</span>}</span>
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  )
}

function DrawingList() {
  const doc = useStore((s) => s.doc)
  const selectedId = useStore((s) => s.selectedDrawingId)
  const selectDrawing = useStore((s) => s.selectDrawing)
  if (!doc || doc.drawingElements.length === 0) return null
  return (
    <CollapsiblePanel title={`Lines / shapes (${doc.drawingElements.length})`} className="drawing-list">
      <ul>
        {doc.drawingElements.map((item, index) => (
          <li key={item.id} className={item.id === selectedId ? 'selected' : ''} onClick={() => selectDrawing(item.id)}>
            <span className="text-kind">{item.kind === 'line' ? '╱' : '□'}</span>
            <span className="cl-name">{item.kind === 'line' ? 'Line' : 'Rectangle'} {index + 1}</span>
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  )
}

function BasePanel() {
  const duplicate = useStore((s) => s.duplicateBaseRight)
  return (
    <CollapsiblePanel title="Base drawing" className="base-panel" defaultOpen={false}>
      <p className="hint">Create a second instance to the right before placing its landmarks and callouts.</p>
      <div className="row">
        <button onClick={() => duplicate(false)}>Duplicate right</button>
        <button onClick={() => duplicate(true)}>Mirror copy right</button>
      </div>
    </CollapsiblePanel>
  )
}

export function Sidebar() {
  const status = useStore((s) => s.status)
  const selectedTextId = useStore((s) => s.selectedTextId)
  const selectedLandmarkId = useStore((s) => s.selectedLandmarkId)
  const selectedDrawingId = useStore((s) => s.selectedDrawingId)
  return (
    <aside className="sidebar">
      {status && <div className="status">{status}</div>}
      <ViewBar />
      {selectedLandmarkId ? (
        <LandmarkInspector />
      ) : selectedDrawingId ? (
        <DrawingInspector />
      ) : selectedTextId ? (
        <TextInspector />
      ) : (
        <Inspector />
      )}
      <BasePanel />
      <TextList />
      <DrawingList />
      <LandmarkPanel />
      <CalloutList />
    </aside>
  )
}
