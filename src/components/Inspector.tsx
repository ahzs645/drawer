import { round } from '../geometry'
import { useStore } from '../store'
import type { BalloonShape, LeaderStyle } from '../types'

export function Inspector() {
  const doc = useStore((s) => s.doc)
  const selectedId = useStore((s) => s.selectedCalloutId)
  const updateBase = useStore((s) => s.updateCalloutBase)
  const updateOverride = useStore((s) => s.updateOverride)
  const setElbow = useStore((s) => s.setElbow)
  const deleteCallout = useStore((s) => s.deleteCallout)
  const record = useStore((s) => s.record)

  if (!doc) return null
  const callout = doc.callouts.find((c) => c.id === selectedId)
  if (!callout) {
    return (
      <section className="panel inspector">
        <div className="panel-title">Callout</div>
        <p className="hint">
          Select <b>Add callout</b>, then click a point on the body. Drag the white dot to move
          the anchor, drag the label to reposition it, drag the small square to bend the leader.
        </p>
      </section>
    )
  }

  const view = doc.views.find((v) => v.id === doc.activeViewId) ?? doc.views[0]
  const ov = view.overrides[callout.id] ?? {}
  const visible = ov.visible ?? true
  const anchor = doc.anchors.find((a) => a.id === callout.anchorId)

  return (
    <section className="panel inspector">
      <div className="panel-title">Callout</div>

      <label className="field">
        Label text
        <input
          type="text"
          value={callout.labelText}
          onFocus={record}
          onChange={(e) => updateBase(callout.id, { labelText: e.target.value })}
        />
      </label>

      <div className="row">
        <label className="field">
          Balloon
          <select
            value={callout.balloonShape}
            onChange={(e) => {
              record()
              updateBase(callout.id, { balloonShape: e.target.value as BalloonShape })
            }}
          >
            <option value="none">None</option>
            <option value="circle">Circle</option>
            <option value="hex">Hexagon</option>
          </select>
        </label>
        <label className="field">
          Number / code
          <input
            type="text"
            value={callout.balloonText}
            onFocus={record}
            onChange={(e) => updateBase(callout.id, { balloonText: e.target.value })}
          />
        </label>
      </div>

      <div className="row">
        <label className="field">
          Leader
          <select
            value={callout.leaderStyle}
            onChange={(e) => {
              record()
              updateBase(callout.id, { leaderStyle: e.target.value as LeaderStyle })
            }}
          >
            <option value="elbow">Elbow</option>
            <option value="straight">Straight</option>
          </select>
        </label>
        <label className="field">
          Color
          <input
            type="color"
            value={callout.color}
            onFocus={record}
            onChange={(e) => updateBase(callout.id, { color: e.target.value })}
          />
        </label>
      </div>

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => {
            record()
            updateOverride(callout.id, { visible: e.target.checked })
          }}
        />
        Visible in “{view.name}”
      </label>

      {ov.elbow && (
        <button
          className="link"
          onClick={() => {
            record()
            setElbow(callout.id, null)
          }}
        >
          Reset leader bend
        </button>
      )}

      {anchor?.mode === 'relative-bbox' && anchor.relative && (
        <p className="hint mono">
          anchor → {round(anchor.relative.nx * 100)}%, {round(anchor.relative.ny * 100)}% of body box
        </p>
      )}

      <button className="danger block" onClick={() => deleteCallout(callout.id)}>
        Delete callout
      </button>
    </section>
  )
}
