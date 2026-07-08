import { useState } from 'react'
import { useStore } from '../store'
import type { Landmark } from '../types'
import { CollapsiblePanel } from './CollapsiblePanel'

/**
 * The catalog as a pick-list: named body locations grouped for browsing. Click
 * one to drop a callout there; hover to highlight it on the body. This is the
 * "pick a named region" UX from body-map libraries, backed by Drawer's anchors.
 */

function LandmarkGroup({
  name,
  landmarks,
  used,
}: {
  name: string
  landmarks: Landmark[]
  used: Set<string>
}) {
  const [open, setOpen] = useState(true)
  const addCalloutAtLandmark = useStore((s) => s.addCalloutAtLandmark)
  const removeLandmark = useStore((s) => s.removeLandmark)
  const setHoverLandmark = useStore((s) => s.setHoverLandmark)
  const placed = landmarks.filter((lm) => used.has(lm.name)).length

  return (
    <div className="lm-group">
      <button className="lm-group-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        <span className="lm-group-title">{name}</span>
        <span className="lm-group-count">
          {placed}/{landmarks.length}
        </span>
      </button>
      {open && (
        <ul className="lm-list">
          {landmarks.map((lm) => {
            const isUsed = used.has(lm.name)
            return (
              <li
                key={lm.id}
                className={isUsed ? 'used' : ''}
                title="Place a callout at this landmark"
                onClick={() => addCalloutAtLandmark(lm.id)}
                onMouseEnter={() => setHoverLandmark(lm.id)}
                onMouseLeave={() => setHoverLandmark(null)}
              >
                <span className="cl-name">{lm.name}</span>
                {name === 'Custom' && (
                  <button
                    className="link"
                    title="Remove landmark"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeLandmark(lm.id)
                    }}
                  >
                    ✕
                  </button>
                )}
                {isUsed ? <span className="lm-check">✓</span> : <span className="lm-add">+</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function LandmarkPanel() {
  const doc = useStore((s) => s.doc)
  const showLandmarks = useStore((s) => s.showLandmarks)
  const setShowLandmarks = useStore((s) => s.setShowLandmarks)

  if (!doc) return null

  const used = new Set(doc.callouts.map((c) => c.labelText))
  const groups: Record<string, Landmark[]> = {}
  for (const lm of doc.landmarks) {
    const g = lm.group || 'Other'
    ;(groups[g] ??= []).push(lm)
  }

  const showToggle = (
    <label className="field checkbox" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={showLandmarks}
        onChange={(e) => setShowLandmarks(e.target.checked)}
      />
      Show on body
    </label>
  )

  return (
    <CollapsiblePanel
      title={`Landmarks (${doc.landmarks.length})`}
      right={showToggle}
      className="landmark-panel"
    >
      {doc.landmarks.length === 0 ? (
        <p className="hint">
          No catalog for this body yet. Click the body to place a callout, then use{' '}
          <b>Save as landmark</b> in the inspector to start one.
        </p>
      ) : (
        <p className="hint">Click a name to drop a callout there; hover to locate it.</p>
      )}

      {Object.keys(groups).map((g) => (
        <LandmarkGroup key={g} name={g} landmarks={groups[g]} used={used} />
      ))}
    </CollapsiblePanel>
  )
}
