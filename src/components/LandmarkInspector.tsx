import { useEffect, useRef, useState } from 'react'
import { round } from '../geometry'
import { useStore } from '../store'
import { CollapsiblePanel } from './CollapsiblePanel'

export function LandmarkInspector() {
  const doc = useStore((s) => s.doc)
  const selectedId = useStore((s) => s.selectedLandmarkId)
  const updateLandmark = useStore((s) => s.updateLandmark)
  const setLandmarkTarget = useStore((s) => s.setLandmarkTarget)
  const removeLandmark = useStore((s) => s.removeLandmark)
  const addCalloutAtLandmark = useStore((s) => s.addCalloutAtLandmark)
  const record = useStore((s) => s.record)
  const focusRequest = useStore((s) => s.landmarkFocusRequest)
  const nameRef = useRef<HTMLInputElement>(null)
  const [newGroup, setNewGroup] = useState('')

  useEffect(() => {
    if (focusRequest > 0) {
      nameRef.current?.focus()
      nameRef.current?.select()
    }
  }, [focusRequest])

  if (!doc) return null
  const landmark = doc.landmarks.find((l) => l.id === selectedId)
  if (!landmark) return null

  return (
    <CollapsiblePanel title="Landmark" className="landmark-inspector">
      <p className="hint">
        Drag the marker on the figure, or edit its normalized position here. Type a new
        group name to create that group immediately.
      </p>
      <label className="field">
        Name
        <input
          ref={nameRef}
          type="text"
          value={landmark.name}
          onFocus={record}
          onChange={(e) => updateLandmark(landmark.id, { name: e.target.value })}
        />
      </label>
      <label className="field">
        Group
        <select
          value={landmark.group || 'Other'}
          onChange={(e) => {
            record()
            updateLandmark(landmark.id, { group: e.target.value })
          }}
        >
          {doc.landmarkGroupOrder.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
      </label>
      <div className="row">
        <label className="field">
          New group
          <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Anterior" />
        </label>
        <button
          disabled={!newGroup.trim()}
          onClick={() => {
            const group = newGroup.trim()
            if (!group) return
            record()
            updateLandmark(landmark.id, { group })
            setNewGroup('')
          }}
        >
          Create & assign
        </button>
      </div>
      <label className="field">
        Anchored to part
        <select
          value={landmark.targetId ?? ''}
          onChange={(e) => setLandmarkTarget(landmark.id, e.target.value || null)}
        >
          <option value="">Whole drawing</option>
          {Object.keys(doc.base.targetBoxes).map((key) => (
            <option key={key} value={key}>{key}</option>
          ))}
        </select>
      </label>
      <div className="row">
        <label className="field">
          X (%)
          <input
            type="number"
            step="0.1"
            value={round(landmark.nx * 100)}
            onFocus={record}
            onChange={(e) => updateLandmark(landmark.id, { nx: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="field">
          Y (%)
          <input
            type="number"
            step="0.1"
            value={round(landmark.ny * 100)}
            onFocus={record}
            onChange={(e) => updateLandmark(landmark.id, { ny: Number(e.target.value) / 100 })}
          />
        </label>
      </div>
      <button onClick={() => addCalloutAtLandmark(landmark.id)}>Place callout here</button>
      <button className="danger block" onClick={() => removeLandmark(landmark.id)}>
        Delete landmark
      </button>
    </CollapsiblePanel>
  )
}
