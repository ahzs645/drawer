import { useEffect, useState } from 'react'
import { AREA_KIND_LABELS, areaById, groupById, groupsContaining, namedParts, updateArea as checkAreaEdit } from '../areaModel'
import { sortedSites } from '../docModel'
import { findImage, round } from '../geometry'
import { prettyName } from '../text'
import { useStore, type AreaMode } from '../store'
import type { Area, DrawerDoc, ImageInstance, SurfaceGroup } from '../types'
import { CollapsiblePanel } from './CollapsiblePanel'

const KIND_ICONS: Record<Area['shape']['kind'], string> = { part: '◈', rect: '▭', ellipse: '◯', polygon: '⬠' }

const DRAW_MODES: [AreaMode, string][] = [
  ['rect', '▭ Rectangle'],
  ['ellipse', '◯ Ellipse'],
  ['polygon', '⬠ Polygon'],
]

/** Area count and site count of a group, in words. */
function memberSummary(group: SurfaceGroup): string {
  const a = group.areaIds.length
  const s = group.siteIds.length
  return `${a} area${a === 1 ? '' : 's'} · ${s} site${s === 1 ? '' : 's'}`
}

/** A short description of an area's shape for the list and inspector. */
function shapeSummary(area: Area): string {
  const s = area.shape
  switch (s.kind) {
    case 'part':
      return `part “${s.targetId}”`
    case 'rect':
      return `${round(s.w)} × ${round(s.h)}`
    case 'ellipse':
      return `${round(s.rx * 2)} × ${round(s.ry * 2)}`
    case 'polygon':
      return `${s.points.length} points`
  }
}

/**
 * The selection surface's regions: areas grouped by image, the named-part
 * picker, and the counter groups (sets of areas and sites counted together).
 */
export function AreasPanel() {
  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  const areaMode = useStore((s) => s.areaMode)
  const setAreaMode = useStore((s) => s.setAreaMode)
  const selectedAreaId = useStore((s) => s.selectedAreaId)
  const selectArea = useStore((s) => s.selectArea)
  const showAreas = useStore((s) => s.showAreas)
  const setShowAreas = useStore((s) => s.setShowAreas)
  const [pickerOpen, setPickerOpen] = useState(false)

  if (!doc) return null
  const areas = doc.areas ?? []
  // areas listed under their image (document order), page areas last
  const sections: { image: ImageInstance | null; areas: Area[] }[] = [
    ...doc.images.map((image) => ({ image, areas: areas.filter((a) => a.imageId === image.id) })),
    { image: null, areas: areas.filter((a) => !a.imageId) },
  ].filter((s) => s.areas.length)

  return (
    <CollapsiblePanel title={`Areas (${areas.length})`} className="areas-panel">
      <p className="hint">
        Regions a form can select: a named part of the artwork, or a shape drawn over an image. Areas
        move with their image.
      </p>
      <div className="row wrap" role="group" aria-label="Draw an area">
        {DRAW_MODES.map(([mode, label]) => (
          <button
            key={mode}
            className={tool === 'area' && areaMode === mode ? 'active' : ''}
            title={mode === 'polygon' ? 'Click each corner on an image; double-click or Enter to finish' : 'Drag on an image'}
            onClick={() => setAreaMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="row wrap">
        <button className={pickerOpen ? 'active' : ''} onClick={() => setPickerOpen((o) => !o)}>
          + From named parts…
        </button>
        <label className="field checkbox" title="Outline and label areas on the canvas">
          <input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />
          Show on canvas
        </label>
      </div>
      {pickerOpen && <PartPicker doc={doc} onClose={() => setPickerOpen(false)} />}

      {areas.length === 0 && <p className="hint">No areas yet.</p>}
      {sections.map(({ image, areas: list }) => (
        <div key={image?.id ?? 'page'}>
          <div className="area-image-head">{image?.name ?? 'Page'}</div>
          <ul className="site-list area-list">
            {list.map((area) => (
              <li key={area.id} className={area.id === selectedAreaId ? 'selected' : ''} onClick={() => selectArea(area.id)}>
                <span className="area-kind" title={AREA_KIND_LABELS[area.shape.kind]}>{KIND_ICONS[area.shape.kind]}</span>
                <span className="cl-name">{area.label || <span className="cl-unnamed">Unnamed</span>}</span>
                <span className="site-chips">
                  {area.fieldKey && <span className="chip" title="Application field key">{area.fieldKey}</span>}
                  {groupsContaining(doc, 'area', area.id).map((g) => (
                    <span key={g.id} className="chip" title="Counted in this group">{g.label}</span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <GroupsSection />
    </CollapsiblePanel>
  )
}

/** Turn an image's named parts into 'part' areas, a checkbox per part. */
function PartPicker({ doc, onClose }: { doc: DrawerDoc; onClose: () => void }) {
  const selectedImageId = useStore((s) => s.selectedImageId)
  const selectedAreaId = useStore((s) => s.selectedAreaId)
  const addPartAreas = useStore((s) => s.addPartAreas)
  const setHoverPart = useStore((s) => s.setHoverPart)
  const candidates = doc.images.filter((i) => namedParts(i).length > 0)
  const preferred = selectedImageId ?? areaById(doc, selectedAreaId)?.imageId
  const [imageId, setImageId] = useState(() => (candidates.find((i) => i.id === preferred) ?? candidates[0])?.id ?? '')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // leave no highlight behind when the picker closes
  useEffect(() => () => setHoverPart(null), [setHoverPart])

  const image = findImage(doc, imageId)
  if (!image) {
    return (
      <div className="part-picker">
        <p className="hint">
          No image on this page has named parts. Add an SVG whose elements have ids (for example the
          “Torso organs” sample), or draw areas instead.
        </p>
        <button onClick={onClose}>Close</button>
      </div>
    )
  }
  const parts = namedParts(image)
  const taken = new Set(
    (doc.areas ?? []).filter((a) => a.imageId === image.id && a.shape.kind === 'part').map((a) => (a.shape as { targetId: string }).targetId),
  )
  const free = parts.filter((p) => !taken.has(p))
  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked)
    if (on) next.add(id)
    else next.delete(id)
    setPicked(next)
  }

  return (
    <div className="part-picker">
      {candidates.length > 1 && (
        <label className="field">
          Image
          <select
            value={image.id}
            onChange={(e) => {
              setImageId(e.target.value)
              setPicked(new Set())
            }}
          >
            {candidates.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
      )}
      <p className="hint">Named parts of {image.name}. Hover to locate one on the drawing.</p>
      <ul className="site-list part-list member-list" onMouseLeave={() => setHoverPart(null)}>
        {parts.map((id) => (
          <li key={id} className={taken.has(id) ? 'taken' : ''} onMouseEnter={() => setHoverPart({ imageId: image.id, targetId: id })}>
            <label>
              <input
                type="checkbox"
                checked={taken.has(id) || picked.has(id)}
                disabled={taken.has(id)}
                onChange={(e) => toggle(id, e.target.checked)}
              />
              <span className="cl-name">{prettyName(id)}</span>
            </label>
            {taken.has(id) && <span className="group-count">added</span>}
          </li>
        ))}
      </ul>
      <div className="row wrap">
        <button className="link" disabled={!free.length} onClick={() => setPicked(new Set(free))}>All</button>
        <button className="link" disabled={!picked.size} onClick={() => setPicked(new Set())}>None</button>
        <button
          disabled={!picked.size}
          onClick={() => {
            addPartAreas(image.id, parts.filter((p) => picked.has(p)))
            setPicked(new Set())
            onClose()
          }}
        >
          Create {picked.size || ''} area{picked.size === 1 ? '' : 's'}
        </button>
        <button className="link" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

/** Counter groups: named sets of areas and sites that are counted together. */
function GroupsSection() {
  const doc = useStore((s) => s.doc)
  const selectedGroupId = useStore((s) => s.selectedGroupId)
  const selectGroup = useStore((s) => s.selectGroup)
  const addGroup = useStore((s) => s.addGroup)
  const [newLabel, setNewLabel] = useState('')
  if (!doc) return null
  const groups = doc.groups ?? []
  const selected = groupById(doc, selectedGroupId)
  return (
    <>
      <div className="panel-subhead">Groups ({groups.length})</div>
      <p className="hint">A group counts its selected areas and sites together, like a 28-joint count.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!newLabel.trim()) return
          addGroup(newLabel)
          setNewLabel('')
        }}
      >
        <input type="text" value={newLabel} placeholder="New group label…" aria-label="New group label" onChange={(e) => setNewLabel(e.target.value)} />
        <button type="submit" disabled={!newLabel.trim()}>+ Group</button>
      </form>
      {groups.length > 0 && (
        <ul className="site-list group-list">
          {groups.map((g) => (
            <li key={g.id} className={g.id === selectedGroupId ? 'selected' : ''} onClick={() => selectGroup(g.id === selectedGroupId ? null : g.id)}>
              <span className="area-kind" title={g.showCount === false ? 'Count hidden' : 'Shows a running count'}>{g.showCount === false ? '◌' : 'Σ'}</span>
              <span className="cl-name">{g.label || <span className="cl-unnamed">Unnamed</span>}</span>
              <span className="group-count">{memberSummary(g)}</span>
            </li>
          ))}
        </ul>
      )}
      {selected && <GroupEditor group={selected} />}
    </>
  )
}

/** Rename, count toggle, membership and delete for the selected group. */
function GroupEditor({ group }: { group: SurfaceGroup }) {
  const doc = useStore((s) => s.doc)
  const updateGroup = useStore((s) => s.updateGroup)
  const deleteGroup = useStore((s) => s.deleteGroup)
  const setGroupMember = useStore((s) => s.setGroupMember)
  const record = useStore((s) => s.record)
  if (!doc) return null
  const areas = doc.areas ?? []
  const sites = sortedSites(doc)
  const imageName = (a: Area) => findImage(doc, a.imageId)?.name ?? 'Page'
  return (
    <div className="group-editor">
      <label className="field">
        Group label
        <input type="text" value={group.label} onFocus={record} onChange={(e) => updateGroup(group.id, { label: e.target.value })} />
      </label>
      <label className="field checkbox">
        <input
          type="checkbox"
          checked={group.showCount !== false}
          onChange={(e) => {
            record()
            updateGroup(group.id, { showCount: e.target.checked })
          }}
        />
        Show the running count
      </label>
      <div className="panel-subhead">Areas ({group.areaIds.length} of {areas.length})</div>
      {areas.length === 0 && <p className="hint">No areas yet.</p>}
      {areas.length > 0 && (
        <ul className="site-list member-list">
          {areas.map((a) => (
            <li key={a.id}>
              <label>
                <input type="checkbox" checked={group.areaIds.includes(a.id)} onChange={(e) => setGroupMember(group.id, 'area', a.id, e.target.checked)} />
                <span className="cl-name">{a.label || a.id}</span>
              </label>
              <span className="group-count">{imageName(a)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="panel-subhead">Sites ({group.siteIds.length} of {sites.length})</div>
      {sites.length === 0 && <p className="hint">No sites yet (add them in the Sites panel).</p>}
      {sites.length > 0 && (
        <ul className="site-list member-list">
          {sites.map((s) => (
            <li key={s.id}>
              <label>
                <input type="checkbox" checked={group.siteIds.includes(s.id)} onChange={(e) => setGroupMember(group.id, 'site', s.id, e.target.checked)} />
                <span className="site-num">{s.number}</span>
                <span className="cl-name">{s.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <button
        className="danger block"
        onClick={() => {
          if (!window.confirm(`Delete the group “${group.label}”? Its areas and sites stay.`)) return
          deleteGroup(group.id)
        }}
      >
        Delete group
      </button>
    </div>
  )
}

/** Edit one area: label, field key, group membership; image and shape are shown read-only. */
export function AreaInspector() {
  const doc = useStore((s) => s.doc)
  const selectedAreaId = useStore((s) => s.selectedAreaId)
  const updateArea = useStore((s) => s.updateArea)
  const deleteArea = useStore((s) => s.deleteArea)
  const setGroupMember = useStore((s) => s.setGroupMember)
  const record = useStore((s) => s.record)
  const area = doc ? areaById(doc, selectedAreaId) : undefined
  const [fieldKey, setFieldKey] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setFieldKey(area?.fieldKey ?? '')
    setError('')
  }, [area?.id, area?.fieldKey])

  if (!doc || !area) return null
  const image = findImage(doc, area.imageId)
  const groups = doc.groups ?? []
  const key = area.fieldKey
  const sharedWith = key
    ? [
        ...(doc.areas ?? []).filter((a) => a.id !== area.id && a.fieldKey === key).map((a) => a.label || a.id),
        ...(doc.sites ?? []).filter((s) => s.fieldKey === key).map((s) => `site ${s.number}`),
      ]
    : []

  // the key is checked first so a rejected edit leaves no undo step
  const commitKey = () => {
    if (fieldKey.trim() === (area.fieldKey ?? '')) return
    try {
      checkAreaEdit(doc, area.id, { fieldKey })
    } catch (e) {
      setError((e as Error).message)
      setFieldKey(area.fieldKey ?? '')
      return
    }
    record()
    updateArea(area.id, { fieldKey })
    setError('')
  }

  return (
    <CollapsiblePanel title="Area" className="inspector area-inspector">
      <label className="field">
        Label
        <input type="text" value={area.label} onFocus={record} onChange={(e) => updateArea(area.id, { label: e.target.value })} />
      </label>
      <label className="field">
        Application field key (optional)
        <input
          type="text"
          value={fieldKey}
          placeholder="e.g. joint.knee_left"
          onChange={(e) => setFieldKey(e.target.value)}
          onBlur={commitKey}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      {sharedWith.length > 0 && <p className="hint">This key is also used by {sharedWith.join(', ')}.</p>}
      {error && <p className="hint error" role="alert">{error}</p>}
      <div className="row">
        <label className="field">
          Image
          <input type="text" value={image?.name ?? 'Page'} readOnly />
        </label>
        <label className="field">
          Shape
          <input type="text" value={AREA_KIND_LABELS[area.shape.kind]} readOnly />
        </label>
      </div>
      <p className="hint">
        {shapeSummary(area)}
        {area.shape.kind === 'part'
          ? ' — the artwork element itself is the target.'
          : ', in the image’s own units. It follows the image when moved, resized or rotated.'}
      </p>

      <div className="panel-subhead">Counted in groups</div>
      {groups.length === 0 && <p className="hint">No groups yet. Add one in the Areas panel.</p>}
      {groups.length > 0 && (
        <ul className="site-list member-list">
          {groups.map((g) => (
            <li key={g.id}>
              <label>
                <input type="checkbox" checked={g.areaIds.includes(area.id)} onChange={(e) => setGroupMember(g.id, 'area', area.id, e.target.checked)} />
                <span className="cl-name">{g.label || g.id}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <button className="danger block" onClick={() => deleteArea(area.id)}>Delete area</button>
    </CollapsiblePanel>
  )
}
