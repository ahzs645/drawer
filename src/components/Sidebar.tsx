import { resolveCallouts } from '../resolve'
import { useStore } from '../store'
import { CollapsiblePanel } from './CollapsiblePanel'
import { Inspector } from './Inspector'
import { LandmarkPanel } from './LandmarkPanel'
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

export function Sidebar() {
  const status = useStore((s) => s.status)
  return (
    <aside className="sidebar">
      {status && <div className="status">{status}</div>}
      <ViewBar />
      <Inspector />
      <LandmarkPanel />
      <CalloutList />
    </aside>
  )
}
