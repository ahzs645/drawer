import { useEffect, useRef } from 'react'
import { boxForTarget, fontSizeFor, resolveAnchor, round } from '../geometry'
import { styleFromCallout } from '../presets'
import { useStore } from '../store'
import type { AnchorMarker, BalloonShape, FontWeight, LeaderEnd, LeaderStyle } from '../types'
import { CollapsiblePanel } from './CollapsiblePanel'

/** Shared preset picker: choose which style new callouts start from. */
function DefaultPresetField() {
  const presets = useStore((s) => s.presets)
  const defaultPresetId = useStore((s) => s.defaultPresetId)
  const setDefaultPreset = useStore((s) => s.setDefaultPreset)
  return (
    <label className="field">
      Style for new callouts
      <select value={defaultPresetId} onChange={(e) => setDefaultPreset(e.target.value)}>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Inspector() {
  const doc = useStore((s) => s.doc)
  const selectedId = useStore((s) => s.selectedCalloutId)
  const updateBase = useStore((s) => s.updateCalloutBase)
  const updateOverride = useStore((s) => s.updateOverride)
  const setElbow = useStore((s) => s.setElbow)
  const setAnchorTarget = useStore((s) => s.setAnchorTarget)
  const deleteCallout = useStore((s) => s.deleteCallout)
  const addLandmark = useStore((s) => s.addLandmark)
  const record = useStore((s) => s.record)
  const presets = useStore((s) => s.presets)
  const applyPreset = useStore((s) => s.applyPreset)
  const applyPresetToAll = useStore((s) => s.applyPresetToAll)
  const saveStyleAsPreset = useStore((s) => s.saveStyleAsPreset)
  const deletePreset = useStore((s) => s.deletePreset)
  const labelFocusRequest = useStore((s) => s.labelFocusRequest)

  // focus the name field right after a point is placed, so you can type its name
  const labelRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (labelFocusRequest > 0) {
      labelRef.current?.focus()
      labelRef.current?.select()
    }
  }, [labelFocusRequest])

  if (!doc) return null
  const callout = doc.callouts.find((c) => c.id === selectedId)
  if (!callout) {
    return (
      <CollapsiblePanel title="Callout" className="inspector">
        <DefaultPresetField />
        <p className="hint">
          Select <b>Add callout</b>, then click a point on the body. Drag the white dot to move
          the anchor, drag the label to reposition it, drag the small square to bend the leader.
        </p>
      </CollapsiblePanel>
    )
  }

  const view = doc.views.find((v) => v.id === doc.activeViewId) ?? doc.views[0]
  const ov = view.overrides[callout.id] ?? {}
  const visible = ov.visible ?? true
  const anchor = doc.anchors.find((a) => a.id === callout.anchorId)

  const onSavePreset = () => {
    const name = window.prompt('Name this style preset:', 'My style')
    if (name == null) return
    const id = saveStyleAsPreset(name.trim() || 'My style', styleFromCallout(callout))
    // make it the applied preset selection immediately (no-op visually, just clarity)
    void id
  }

  return (
    <CollapsiblePanel title="Callout" className="inspector">
      {view.style && (
        <p className="hint">
          View “{view.name}” imposes a <b>style format</b> on all markers, so the point/leader/balloon
          settings below are overridden here. Set the view’s Format to “Per-callout” to use them.
        </p>
      )}

      {/* --- style preset --- */}
      <label className="field">
        Style preset
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) applyPreset(callout.id, e.target.value)
            e.target.value = ''
          }}
        >
          <option value="">Apply preset…</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row preset-actions">
        <button className="link" onClick={onSavePreset} title="Save this callout's look as a reusable preset">
          + Save as preset
        </button>
        <select
          className="apply-all"
          value=""
          onChange={(e) => {
            if (e.target.value) applyPresetToAll(e.target.value)
            e.target.value = ''
          }}
          title="Apply a preset to every callout"
        >
          <option value="">Apply to all…</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {presets.some((p) => !p.builtin) && (
        <label className="field">
          Delete a saved preset
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) deletePreset(e.target.value)
              e.target.value = ''
            }}
          >
            <option value="">Remove preset…</option>
            {presets
              .filter((p) => !p.builtin)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      )}

      <label className="field">
        Label text{doc.views.length > 1 ? ' (default)' : ''}
        <input
          ref={labelRef}
          type="text"
          value={callout.labelText}
          placeholder="Name this point…"
          onFocus={record}
          onChange={(e) => updateBase(callout.id, { labelText: e.target.value })}
        />
      </label>

      {doc.views.length > 1 && view.labelMode === 'names' && (
        <label className="field">
          Label in “{view.name}”
          <input
            type="text"
            value={ov.labelText ?? ''}
            placeholder={callout.labelText || '(default)'}
            onFocus={record}
            onChange={(e) =>
              updateOverride(callout.id, { labelText: e.target.value || undefined })
            }
          />
        </label>
      )}

      <div className="row">
        <label className="field">
          Balloon (label end)
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
          Label size
          <input
            type="number"
            min="6"
            max="160"
            step="1"
            value={callout.fontSize ?? fontSizeFor(doc.base.viewBox)}
            onFocus={record}
            onChange={(e) =>
              updateBase(callout.id, { fontSize: Math.max(6, Number(e.target.value) || 6) })
            }
          />
        </label>
        <label className="field">
          Label weight
          <select
            value={String(callout.fontWeight ?? 500)}
            onChange={(e) => {
              record()
              updateBase(callout.id, { fontWeight: Number(e.target.value) as FontWeight })
            }}
          >
            <option value="400">Regular</option>
            <option value="500">Medium</option>
            <option value="600">Semibold</option>
            <option value="700">Bold</option>
          </select>
        </label>
        <label className="field">
          Line width
          <input
            type="number"
            min="0.5"
            max="20"
            step="0.5"
            value={callout.leaderWidth ?? 1.6}
            onFocus={record}
            onChange={(e) =>
              updateBase(callout.id, { leaderWidth: Math.max(0.5, Number(e.target.value) || 0.5) })
            }
          />
        </label>
      </div>

      <div className="row">
        <label className="field">
          Point (body end)
          <select
            value={callout.anchorMarker ?? 'ring'}
            onChange={(e) => {
              record()
              updateBase(callout.id, { anchorMarker: e.target.value as AnchorMarker })
            }}
          >
            <option value="ring">Ring + dot</option>
            <option value="dot">Dot</option>
            <option value="tick">Tick</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="field">
          Leader end
          <select
            value={callout.leaderEnd ?? 'none'}
            onChange={(e) => {
              record()
              updateBase(callout.id, { leaderEnd: e.target.value as LeaderEnd })
            }}
          >
            <option value="none">Plain</option>
            <option value="arrow">Arrow</option>
            <option value="dot">Dot</option>
          </select>
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
          checked={callout.dashed ?? false}
          onChange={(e) => {
            record()
            updateBase(callout.id, { dashed: e.target.checked })
          }}
        />
        Dashed leader
      </label>

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

      {anchor?.relative && (
        <>
          <label className="field">
            Anchored to part
            <select
              value={anchor.relative.targetId ?? ''}
              onChange={(e) => setAnchorTarget(callout.id, e.target.value || null)}
            >
              <option value="">Whole body (box)</option>
              {Object.keys(doc.base.targetBoxes).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <p className="hint mono">
            {round(anchor.relative.nx * 100)}%, {round(anchor.relative.ny * 100)}% of{' '}
            {anchor.relative.targetId ?? 'body'} box
          </p>
          <button
            className="link"
            title="Add this point to the catalog so it can be reused"
            onClick={() => {
              const targetId = anchor.relative?.targetId ?? null
              const pt = resolveAnchor(anchor, boxForTarget(doc.base, targetId))
              addLandmark(callout.labelText || 'Landmark', pt, targetId)
            }}
          >
            + Save as landmark
          </button>
        </>
      )}

      <button className="danger block" onClick={() => deleteCallout(callout.id)}>
        Delete callout
      </button>
    </CollapsiblePanel>
  )
}
