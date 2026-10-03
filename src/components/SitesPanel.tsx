import { useEffect, useState } from 'react'
import { calloutShown, coverageWarnings, siteById, sitePlacements, sitesCsv, sortedSites, updateSite as checkSiteEdit } from '../docModel'
import { downloadText } from '../export/projectIo'
import { findImage } from '../geometry'
import { getView } from '../resolve'
import { useStore } from '../store'
import type { Site } from '../types'
import { CollapsiblePanel } from './CollapsiblePanel'

/**
 * The shared site table: one row per numbered site, each with any number of
 * markers across the page's images. Rows drive the legend, the markers'
 * numbers and labels, and the field key / value mapping.
 */
export function SitesPanel() {
  const doc = useStore((s) => s.doc)
  const selectedSiteId = useStore((s) => s.selectedSiteId)
  const pendingSiteId = useStore((s) => s.pendingSiteId)
  const selectSite = useStore((s) => s.selectSite)
  const addSite = useStore((s) => s.addSite)
  const startSitePlacement = useStore((s) => s.startSitePlacement)
  const select = useStore((s) => s.select)
  const showSiteConnections = useStore((s) => s.showSiteConnections)
  const setShowSiteConnections = useStore((s) => s.setShowSiteConnections)
  const updateSiteLegend = useStore((s) => s.updateSiteLegend)
  const record = useStore((s) => s.record)
  const [filter, setFilter] = useState('')
  const [newLabel, setNewLabel] = useState('')

  if (!doc) return null
  const view = getView(doc)
  const sites = sortedSites(doc)
  const q = filter.trim().toLowerCase()
  const shown = sites.filter((site) => {
    if (!q) return true
    const images = sitePlacements(doc, site.id)
      .map((c) => findImage(doc, doc.anchors.find((a) => a.id === c.anchorId)?.imageId)?.name ?? '')
      .join(' ')
    return `${site.number} ${site.label} ${site.fieldKey} ${images}`.toLowerCase().includes(q)
  })
  const warnings = coverageWarnings(doc, view)
  const legend = doc.siteLegend

  return (
    <CollapsiblePanel title={`Sites (${sites.length})`} className="sites-panel">
      <p className="hint">
        One row per numbered site. A site can be marked on several images; every marker shares the
        row’s number, label and field key.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!newLabel.trim()) return
          addSite(newLabel)
          setNewLabel('')
        }}
      >
        <input
          type="text"
          value={newLabel}
          placeholder="New site label…"
          aria-label="New site label"
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button type="submit" disabled={!newLabel.trim()}>+ Site</button>
      </form>

      {sites.length > 0 && (
        <>
          <input
            type="search"
            className="site-filter"
            value={filter}
            placeholder="Filter sites, keys or images…"
            aria-label="Filter sites"
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className="site-list">
            {shown.map((site) => {
              const placements = sitePlacements(doc, site.id)
              const visible = placements.filter((c) => calloutShown(doc, c, view)).length
              return (
                <li
                  key={site.id}
                  className={`${site.id === selectedSiteId ? 'selected' : ''}${visible ? '' : ' unmapped'}`}
                  onClick={() => selectSite(site.id)}
                >
                  <span className="site-num">{site.number}</span>
                  <span className="cl-name">{site.label}</span>
                  <span className="site-chips">
                    {placements.map((c) => {
                      const anchor = doc.anchors.find((a) => a.id === c.anchorId)
                      const image = findImage(doc, anchor?.imageId)
                      return (
                        <button
                          key={c.id}
                          className="chip"
                          title={`Select this marker${calloutShown(doc, c, view) ? '' : ' (hidden in this view)'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            select(c.id)
                          }}
                        >
                          {image?.name ?? 'Page'}
                          {calloutShown(doc, c, view) ? '' : ' ◌'}
                        </button>
                      )
                    })}
                    {!placements.length && <span className="badge-warning">Unmarked</span>}
                  </span>
                  <button
                    className={`icon${pendingSiteId === site.id ? ' active' : ''}`}
                    title="Place a marker for this site: click an image"
                    aria-label={`Place a marker for site ${site.number}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      startSitePlacement(pendingSiteId === site.id ? null : site.id)
                    }}
                  >
                    +
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {warnings.length > 0 && (
        <details className="subsection warnings" open={warnings.length <= 3}>
          <summary>Coverage check · {warnings.length} warning{warnings.length === 1 ? '' : 's'}</summary>
          <ul className="warning-list">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </details>
      )}

      {legend && sites.length > 0 && (
        <details className="subsection">
          <summary>Legend</summary>
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={legend.visible}
              onChange={(e) => {
                record()
                updateSiteLegend({ visible: e.target.checked })
              }}
            />
            Show the site legend (drag it on the canvas)
          </label>
          <label className="field">
            Heading
            <input type="text" value={legend.heading} onFocus={record} onChange={(e) => updateSiteLegend({ heading: e.target.value })} />
          </label>
          <div className="row">
            <label className="field">
              Font size
              <input
                type="number"
                min="6"
                step="1"
                value={legend.fontSize}
                onFocus={record}
                onChange={(e) => Number(e.target.value) > 0 && updateSiteLegend({ fontSize: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Row height
              <input
                type="number"
                min="6"
                step="0.5"
                value={legend.rowHeight}
                onFocus={record}
                onChange={(e) => Number(e.target.value) > 0 && updateSiteLegend({ rowHeight: Number(e.target.value) })}
              />
            </label>
          </div>
        </details>
      )}

      {sites.length > 0 && (
        <div className="row wrap">
          <label className="field checkbox" title="Dashed lines from the selected site's markers to its legend row">
            <input type="checkbox" checked={showSiteConnections} onChange={(e) => setShowSiteConnections(e.target.checked)} />
            Show selected connections
          </label>
          <button
            title="One row per marker, with page coordinates. Entered values are left out."
            onClick={() => downloadText(`${doc.name || 'diagram'}-sites.csv`, sitesCsv(doc), 'text/csv;charset=utf-8')}
          >
            Export CSV
          </button>
        </div>
      )}
    </CollapsiblePanel>
  )
}

/** Edit one site row: number, label, field key, value, and its markers. */
export function SiteInspector() {
  const doc = useStore((s) => s.doc)
  const selectedSiteId = useStore((s) => s.selectedSiteId)
  const pendingSiteId = useStore((s) => s.pendingSiteId)
  const updateSite = useStore((s) => s.updateSite)
  const deleteSite = useStore((s) => s.deleteSite)
  const startSitePlacement = useStore((s) => s.startSitePlacement)
  const select = useStore((s) => s.select)
  const updateOverride = useStore((s) => s.updateOverride)
  const deleteCallout = useStore((s) => s.deleteCallout)
  const setMappingValue = useStore((s) => s.setMappingValue)
  const record = useStore((s) => s.record)
  const site = doc ? siteById(doc, selectedSiteId) : undefined
  const [number, setNumber] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setNumber(site ? String(site.number) : '')
    setFieldKey(site?.fieldKey ?? '')
    setError('')
  }, [site?.id, site?.number, site?.fieldKey])

  if (!doc || !site) return null
  const view = getView(doc)
  const placements = sitePlacements(doc, site.id)
  const value = doc.mappingValues?.[site.fieldKey]

  // number / key edits are checked first so a rejected edit leaves no undo step
  const commit = (patch: Partial<Omit<Site, 'id'>>) => {
    try {
      checkSiteEdit(doc, site.id, patch)
    } catch (e) {
      setError((e as Error).message)
      setNumber(String(site.number))
      setFieldKey(site.fieldKey)
      return
    }
    record()
    updateSite(site.id, patch)
    setError('')
  }

  return (
    <CollapsiblePanel title="Site" className="inspector site-inspector">
      <div className="row">
        <label className="field site-number-field">
          Number
          <input
            type="number"
            min="1"
            step="1"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            onBlur={() => Number(number) !== site.number && commit({ number: Number(number) })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <label className="field">
          Label
          <input type="text" value={site.label} onFocus={record} onChange={(e) => {
            try { updateSite(site.id, { label: e.target.value }) } catch (err) { setError((err as Error).message) }
          }} />
        </label>
      </div>
      <label className="field">
        Application field key
        <input
          type="text"
          value={fieldKey}
          onChange={(e) => setFieldKey(e.target.value)}
          onBlur={() => fieldKey !== site.fieldKey && commit({ fieldKey })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <label className="field">
        Value (optional — shown in “values” views)
        <input
          type="text"
          value={value === null || value === undefined ? '' : String(value)}
          placeholder="Not entered"
          onFocus={record}
          onChange={(e) => setMappingValue(site.fieldKey, e.target.value)}
        />
      </label>
      <p className="hint">Values are saved in the project file and browser autosave. Use test data, not patient data.</p>
      {error && <p className="hint error" role="alert">{error}</p>}

      <div className="panel-subhead">Markers ({placements.length})</div>
      {placements.length === 0 && <p className="hint">No markers yet. Use “Place marker”, then click an image.</p>}
      <ul className="placement-list">
        {placements.map((c) => {
          const anchor = doc.anchors.find((a) => a.id === c.anchorId)
          const image = findImage(doc, anchor?.imageId)
          const shownInView = view.overrides[c.id]?.visible ?? true
          return (
            <li key={c.id}>
              <button className="link" onClick={() => select(c.id)}>{image?.name ?? 'Page'}</button>
              <label className="field checkbox" title={`Visible in “${view.name}”`}>
                <input
                  type="checkbox"
                  checked={shownInView}
                  onChange={(e) => {
                    record()
                    updateOverride(c.id, { visible: e.target.checked })
                  }}
                />
                Show
              </label>
              <button className="link danger" onClick={() => deleteCallout(c.id)}>Remove</button>
            </li>
          )
        })}
      </ul>
      <button
        className={`block${pendingSiteId === site.id ? ' active' : ''}`}
        onClick={() => startSitePlacement(pendingSiteId === site.id ? null : site.id)}
      >
        {pendingSiteId === site.id ? 'Click an image… (Esc cancels)' : '+ Place marker on an image'}
      </button>
      <p className="hint">Drag a marker to move it; drop it on another image to move it there.</p>
      <button
        className="danger block"
        onClick={() => {
          if (!window.confirm(`Delete site ${site.number} (${site.label}) and its ${placements.length} marker(s)?`)) return
          deleteSite(site.id)
        }}
      >
        Delete site
      </button>
    </CollapsiblePanel>
  )
}
