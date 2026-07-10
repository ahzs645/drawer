import { useRef, useState } from 'react'
import { parseLandmarkCatalog, serializeLandmarkCatalog } from '../export/landmarkCatalog'
import { downloadText } from '../export/projectIo'
import { useStore } from '../store'
import type { Landmark } from '../types'
import { CollapsiblePanel } from './CollapsiblePanel'

function LandmarkGroup({
  name,
  landmarks,
  used,
  index,
  count,
}: {
  name: string
  landmarks: Landmark[]
  used: Set<string>
  index: number
  count: number
}) {
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const doc = useStore((s) => s.doc)!
  const addCalloutAtLandmark = useStore((s) => s.addCalloutAtLandmark)
  const removeLandmark = useStore((s) => s.removeLandmark)
  const selectLandmark = useStore((s) => s.selectLandmark)
  const renameGroup = useStore((s) => s.renameLandmarkGroup)
  const deleteGroup = useStore((s) => s.deleteLandmarkGroup)
  const moveGroup = useStore((s) => s.moveLandmarkGroup)
  const setGroupVisible = useStore((s) => s.setLandmarkGroupVisible)
  const setHoverLandmark = useStore((s) => s.setHoverLandmark)
  const placed = landmarks.filter((lm) => used.has(lm.name)).length
  const visible = !doc.hiddenLandmarkGroups.includes(name)
  const commitRename = () => {
    const next = draftName.trim()
    if (next && next !== name) renameGroup(name, next)
    setRenaming(false)
  }

  return (
    <div className="lm-group">
      <div className="lm-group-head-row">
        {renaming ? (
          <div className="lm-group-rename">
            <input
              autoFocus
              aria-label={`Rename ${name}`}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
            <button className="link" onClick={commitRename} disabled={!draftName.trim()}>Save</button>
            <button className="link" onClick={() => setRenaming(false)}>Cancel</button>
          </div>
        ) : (
          <button className="lm-group-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span className="chev">{open ? '▾' : '▸'}</span>
            <span className="lm-group-title">{name}</span>
            <span className="lm-group-count">{placed}/{landmarks.length}</span>
          </button>
        )}
        <label className="lm-group-visible" title="Show this group's markers on the figure">
          <input type="checkbox" checked={visible} onChange={(e) => setGroupVisible(name, e.target.checked)} />
        </label>
        <button className="icon-button" disabled={index === 0} title="Move group up" onClick={() => moveGroup(name, -1)}>↑</button>
        <button className="icon-button" disabled={index === count - 1} title="Move group down" onClick={() => moveGroup(name, 1)}>↓</button>
        <button
          className="icon-button"
          title="Rename group"
          onClick={() => {
            setDraftName(name)
            setRenaming(true)
          }}
        >✎</button>
        <button
          className="icon-button danger"
          title="Delete group (landmarks move to Custom)"
          onClick={() => setConfirmDelete(true)}
        >✕</button>
      </div>
      {confirmDelete && (
        <div className="lm-confirm-delete" role="group" aria-label={`Delete ${name}`}>
          <span>Delete “{name}”? Its landmarks move to Custom.</span>
          <button
            className="danger"
            onClick={() => {
              deleteGroup(name)
              setConfirmDelete(false)
            }}
          >Delete</button>
          <button onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      )}
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
                <button
                  className="link"
                  title="Edit landmark"
                  onClick={(e) => {
                    e.stopPropagation()
                    selectLandmark(lm.id)
                  }}
                >Edit</button>
                <button
                  className="link"
                  title="Remove landmark"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeLandmark(lm.id)
                  }}
                >✕</button>
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
  const addGroup = useStore((s) => s.addLandmarkGroup)
  const importCatalog = useStore((s) => s.importLandmarkCatalog)
  const importRef = useRef<HTMLInputElement>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [catalogError, setCatalogError] = useState('')

  if (!doc) return null
  const used = new Set(doc.callouts.map((c) => c.labelText))
  const groups: Record<string, Landmark[]> = {}
  for (const group of doc.landmarkGroupOrder) groups[group] = []
  for (const lm of doc.landmarks) (groups[lm.group || 'Other'] ??= []).push(lm)
  const order = [...doc.landmarkGroupOrder]
  for (const group of Object.keys(groups)) if (!order.includes(group)) order.push(group)

  const showToggle = (
    <label className="field checkbox" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={showLandmarks} onChange={(e) => setShowLandmarks(e.target.checked)} />
      Show on body
    </label>
  )

  return (
    <CollapsiblePanel title={`Landmarks (${doc.landmarks.length})`} right={showToggle} className="landmark-panel">
      {doc.landmarks.length === 0 ? (
        <p className="hint">Choose <b>Add landmark</b> and click the figure, or import a reusable catalog.</p>
      ) : (
        <p className="hint">Click a name to place a callout; use Edit to rename, regroup, or reposition it.</p>
      )}
      <div className="lm-actions">
        <button onClick={() => setAddingGroup((value) => !value)}>+ Group</button>
        <button onClick={() => importRef.current?.click()}>Import catalog</button>
        <button
          disabled={doc.landmarks.length === 0}
          onClick={() => downloadText(
            `${doc.name || 'diagram'}.landmarks.json`,
            serializeLandmarkCatalog(doc.name, doc.landmarks, doc.landmarkGroupOrder),
            'application/json',
          )}
        >Export catalog</button>
      </div>
      {addingGroup && (
        <div className="lm-add-group">
          <input
            autoFocus
            aria-label="New group name"
            value={newGroup}
            placeholder="e.g. Anterior"
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newGroup.trim()) {
                addGroup(newGroup)
                setNewGroup('')
                setAddingGroup(false)
              }
              if (e.key === 'Escape') setAddingGroup(false)
            }}
          />
          <button
            disabled={!newGroup.trim()}
            onClick={() => {
              addGroup(newGroup)
              setNewGroup('')
              setAddingGroup(false)
            }}
          >Add</button>
          <button onClick={() => setAddingGroup(false)}>Cancel</button>
        </div>
      )}
      {catalogError && <div className="status error">{catalogError}</div>}
      {order.map((group, index) => (
        <LandmarkGroup
          key={group}
          name={group}
          landmarks={groups[group] ?? []}
          used={used}
          index={index}
          count={order.length}
        />
      ))}
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            const catalog = parseLandmarkCatalog(await file.text())
            importCatalog(catalog.landmarks, catalog.groupOrder)
            setCatalogError('')
          } catch (error) {
            setCatalogError(`Could not import catalog: ${(error as Error).message}`)
          }
        }}
      />
    </CollapsiblePanel>
  )
}
