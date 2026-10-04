import { useEffect, useMemo, useRef, useState } from 'react'
import { CLINICAL_ASSETS, CLINICAL_TEMPLATES } from '../clinicalCatalog'
import { arrangeDioramaImages } from '../dioramaLayout'
import { calloutShown, siteById, sortedSites } from '../docModel'
import { round } from '../geometry'
import { getView } from '../resolve'
import { sampleUrl } from '../samples'
import { useStore } from '../store'
import type { Callout, ImageInstance } from '../types'
import './clinicalLibrary.css'

type Tab = 'library' | 'layout' | 'connections'
type Region = 'All' | 'Body' | 'Hands' | 'Feet'
type PlacementKey = 'x' | 'y' | 'width' | 'rotation'
const TABS: { id: Tab; label: string }[] = [
  { id: 'library', label: 'View library' },
  { id: 'layout', label: 'Layout table' },
  { id: 'connections', label: 'Connections' },
]
const FIELD_NAMES: Record<PlacementKey, string> = { x: 'X position', y: 'Y position', width: 'Width', rotation: 'Rotation' }

/** A completed field edit is one undo step, including an aspect-ratio resize. */
function PlacementField({ image, field, documentId, report }: {
  image: ImageInstance
  field: PlacementKey
  documentId: string
  report: (message: string) => void
}) {
  const [draft, setDraft] = useState(String(round(image[field])))
  const dirty = useRef(false)
  const cancel = useRef(false)
  useEffect(() => {
    setDraft(String(round(image[field])))
    dirty.current = false
  }, [image.id, image[field], field])

  return <input
    type="number"
    aria-label={`${image.name}: ${FIELD_NAMES[field]}`}
    disabled={!!image.locked}
    min={field === 'width' ? 0.01 : undefined}
    step={field === 'rotation' ? 0.5 : 1}
    value={draft}
    onChange={(event) => { dirty.current = true; setDraft(event.target.value) }}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        event.currentTarget.blur()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancel.current = true
        event.currentTarget.blur()
      }
    }}
    onBlur={() => {
      const state = useStore.getState()
      const current = state.doc?.id === documentId ? state.doc.images.find((item) => item.id === image.id) : undefined
      const reset = () => setDraft(String(round(current?.[field] ?? image[field])))
      if (cancel.current || !dirty.current || !current || current.locked) {
        cancel.current = false
        dirty.current = false
        reset()
        return
      }
      dirty.current = false
      const value = draft.trim() ? Number(draft) : Number.NaN
      if (!Number.isFinite(value) || Math.abs(value) > 1e6 || (field === 'width' && value <= 0)) {
        reset()
        report(field === 'width' ? 'Enter a width greater than zero.' : `Enter a valid ${FIELD_NAMES[field].toLowerCase()}.`)
        return
      }
      if (value === current[field]) return
      const height = value * current.height / current.width
      if (field === 'width' && (!Number.isFinite(height) || height <= 0 || height > 1e6)) {
        reset()
        report('Choose a smaller width for this view.')
        return
      }
      state.record()
      state.setImagePlacement(image.id, field === 'width' ? { width: value, height } : { [field]: value })
      report(`${current.name}: ${FIELD_NAMES[field].toLowerCase()} updated.`)
    }}
  />
}

/** Browse the authored views, arrange the diorama, and inspect shared sites. */
export function ClinicalLibraryPanel() {
  const doc = useStore((state) => state.doc)
  const selectedImageId = useStore((state) => state.selectedImageId)
  const selectedSiteId = useStore((state) => state.selectedSiteId)
  const pendingSiteId = useStore((state) => state.pendingSiteId)
  const pendingImageId = useStore((state) => state.pendingSiteImageId)
  const showConnections = useStore((state) => state.showSiteConnections)
  const status = useStore((state) => state.status)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('library')
  const [region, setRegion] = useState<Region>('All')
  const [side, setSide] = useState('all')
  const [search, setSearch] = useState('')
  const [layoutSearch, setLayoutSearch] = useState('')
  const [siteSearch, setSiteSearch] = useState('')
  const [imageSearch, setImageSearch] = useState('')
  const [columns, setColumns] = useState(4)
  const [gap, setGap] = useState('32')
  const [newSite, setNewSite] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [expandedCell, setExpandedCell] = useState<{ siteId: string; imageId: string | null } | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const loading = !!busy || status.startsWith('Loading')

  useEffect(() => {
    if (open) tabRefs.current[TABS.findIndex((item) => item.id === tab)]?.focus()
    // Opening focuses the active tab; switching tabs manages its own focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => { setExpandedCell(null) }, [doc?.id])

  const close = () => { setOpen(false); toggleRef.current?.focus() }
  const pendingSite = doc ? siteById(doc, pendingSiteId) : undefined
  const pendingImage = doc?.images.find((image) => image.id === pendingImageId)
  const query = search.trim().toLowerCase()
  const assets = CLINICAL_ASSETS.filter((asset) =>
    (region === 'All' || asset.region === region) && (side === 'all' || asset.side === side) &&
    `${asset.label} ${asset.view} ${asset.side}`.toLowerCase().includes(query),
  )
  const shownImages = doc?.images.filter((image) => image.name.toLowerCase().includes(layoutSearch.trim().toLowerCase())) ?? []
  const movableCount = doc?.images.filter((image) => image.visible !== false && !image.locked).length ?? 0
  const sites = doc ? sortedSites(doc).filter((site) =>
    `${site.number} ${site.label} ${site.fieldKey}`.toLowerCase().includes(siteSearch.trim().toLowerCase()),
  ) : []
  const placements = useMemo(() => {
    const rows = new Map<string, Map<string | null, Callout[]>>()
    if (!doc) return rows
    const anchorImages = new Map(doc.anchors.map((anchor) => [anchor.id, anchor.imageId ?? null]))
    for (const callout of doc.callouts) {
      if (!callout.siteId) continue
      const row = rows.get(callout.siteId) ?? new Map<string | null, Callout[]>()
      const imageId = anchorImages.get(callout.anchorId) ?? null
      row.set(imageId, [...(row.get(imageId) ?? []), callout])
      rows.set(callout.siteId, row)
    }
    return rows
  }, [doc])
  const hasPageMarkers = [...placements.values()].some((row) => row.has(null))
  const matrixImages: { id: string | null; name: string; hidden: boolean }[] = [
    ...(doc?.images ?? []).map((image) => ({ id: image.id, name: image.name, hidden: image.visible === false })),
    ...(hasPageMarkers ? [{ id: null, name: 'Page', hidden: false }] : []),
  ].filter((image) => image.name.toLowerCase().includes(imageSearch.trim().toLowerCase()))
  const view = doc ? getView(doc) : undefined
  const expandedSite = doc && expandedCell ? siteById(doc, expandedCell.siteId) : undefined
  const expandedImage = expandedCell?.imageId ? doc?.images.find((image) => image.id === expandedCell.imageId) : undefined
  const expandedMarkers = expandedCell ? placements.get(expandedCell.siteId)?.get(expandedCell.imageId) ?? [] : []

  const addView = async (key: string, label: string) => {
    if (loading) return
    setBusy(key)
    try {
      const added = await useStore.getState().addSampleImage(key)
      const state = useStore.getState()
      setNotice(added ? `${label} added. Arrange it in the Layout table or on the canvas.` : state.status || 'The view could not be added.')
    } finally { setBusy(null) }
  }

  const openChart = async (key: string, label: string) => {
    if (loading) return
    setBusy(key)
    try {
      const loaded = await useStore.getState().loadTemplate(key)
      const state = useStore.getState()
      if (loaded) {
        setNotice(`${label} opened.`)
        close()
      } else setNotice(state.status || 'The chart could not be opened.')
    } finally { setBusy(null) }
  }

  /** Switch presentation views, preserving the clean view's visibility overrides. */
  const revealMarkers = (markers: Callout[], placing = false): boolean => {
    const state = useStore.getState()
    const currentDoc = state.doc
    if (!currentDoc) return false
    const imageForMarker = (marker: Callout) => {
      const anchor = currentDoc.anchors.find((item) => item.id === marker.anchorId)
      return currentDoc.images.find((image) => image.id === anchor?.imageId)
    }
    const available = markers.filter((marker) => imageForMarker(marker)?.visible !== false)
    const hiddenNames = [...new Set(markers.filter((marker) => imageForMarker(marker)?.visible === false).map((marker) => imageForMarker(marker)!.name))]
    const hiddenNotice = hiddenNames.length ? `Show ${hiddenNames.map((name) => `“${name}”`).join(', ')} in the Layout table to see ${hiddenNames.length === 1 ? 'its' : 'their'} markers.` : ''
    if (!placing && !available.length) {
      setNotice(hiddenNotice || 'This site has no markers yet. Use + on an image column to place one.')
      return false
    }
    const current = getView(currentDoc)
    const isClean = current.id === 'artwork' || current.name.toLowerCase() === 'clean artwork'
    if ((placing && !isClean) || (!placing && available.every((marker) => calloutShown(currentDoc, marker, current)))) {
      if (hiddenNotice) setNotice(hiddenNotice)
      return placing || !hiddenNotice
    }
    const candidates = [
      ...currentDoc.views.filter((candidate) => candidate.id === 'site-numbers'),
      ...currentDoc.views.filter((candidate) => candidate.id !== 'site-numbers' && candidate.id !== 'artwork' && candidate.name.toLowerCase() !== 'clean artwork'),
    ]
    const target = placing ? candidates[0]
      : candidates.find((candidate) => available.every((marker) => calloutShown(currentDoc, marker, candidate)))
        ?? candidates.find((candidate) => available.some((marker) => calloutShown(currentDoc, marker, candidate)))
    if (!target) {
      setNotice(placing ? 'Add or select a marker view before placing this site.' : 'These markers are hidden in every saved view. Select their site in the sidebar to change marker visibility.')
      return false
    }
    state.setActiveView(target.id)
    setNotice(`Showing ${target.name}.${hiddenNotice ? ` ${hiddenNotice}` : ''}`)
    return placing || !hiddenNotice
  }

  const selectMarker = (calloutId: string) => {
    const state = useStore.getState()
    const marker = state.doc?.callouts.find((callout) => callout.id === calloutId)
    if (!marker) return
    state.startSitePlacement(null)
    state.setTool('select')
    state.select(calloutId)
    state.setShowSiteConnections(true)
    if (revealMarkers([marker])) close()
  }

  const selectSiteForReview = (siteId: string, returnToCanvas = true, markers?: Callout[]) => {
    const state = useStore.getState()
    state.startSitePlacement(null)
    state.setTool('select')
    state.selectSite(siteId)
    state.setShowSiteConnections(true)
    const visible = revealMarkers(markers ?? state.doc?.callouts.filter((callout) => callout.siteId === siteId) ?? [])
    if (visible && returnToCanvas) close()
  }

  const placeMarker = (siteId: string, imageId: string) => {
    const state = useStore.getState()
    const image = state.doc?.images.find((item) => item.id === imageId)
    if (!image) return
    if (image.visible === false) {
      setNotice(`Show “${image.name}” in the Layout table before placing a marker.`)
      return
    }
    if (!revealMarkers(state.doc?.callouts.filter((callout) => callout.siteId === siteId) ?? [], true)) return
    state.startSitePlacement(siteId, imageId)
    close()
  }

  const arrange = () => {
    const state = useStore.getState()
    if (!state.doc) return
    try {
      const next = arrangeDioramaImages(state.doc, { columns, gap: gap.trim() ? Number(gap) : Number.NaN })
      if (next === state.doc) { setNotice('The visible views are already arranged.'); return }
      state.record()
      useStore.setState({ doc: next, future: [], fitRequest: state.fitRequest + 1 })
      setNotice(`${movableCount} views arranged. Image sizes, angles and attached markers stay together.`)
    } catch (error) { setNotice((error as Error).message) }
  }

  return <section className="clinical-bar" aria-label="Clinical chart tools">
    <button
      ref={toggleRef}
      type="button"
      className={`clinical-toggle${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-controls="clinical-library-panel"
      onClick={() => setOpen(!open)}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="2" width="6" height="7" rx="1"/><rect x="12" y="2" width="6" height="7" rx="1"/><rect x="2" y="13" width="6" height="5" rx="1"/><rect x="12" y="13" width="6" height="5" rx="1"/></svg>
      Clinical charts &amp; dioramas
    </button>
    {pendingSite && pendingImage ? <div className="clinical-placement" role="status">
      <span>Click <strong>{pendingImage.name}</strong> to place <strong>{pendingSite.label}</strong>.</span>
      <button type="button" onClick={() => useStore.getState().startSitePlacement(null)}>Cancel placement</button>
    </div> : <span className="clinical-summary">{CLINICAL_ASSETS.length} views · Body, hands and feet{doc ? ` · ${doc.images.length} on this page` : ''}</span>}

    {open && <div
      id="clinical-library-panel"
      className="clinical-panel"
      role="region"
      aria-label="Clinical charts and dioramas"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
    >
      <header className="clinical-heading">
        <div><h2>Clinical charts &amp; dioramas</h2><p>Choose views, position each image, and connect the same site across views.</p></div>
        <button type="button" onClick={close} aria-label="Close clinical charts panel">Return to canvas <span aria-hidden="true">×</span></button>
      </header>
      <div className="clinical-tabs" role="tablist" aria-label="Clinical chart tools">
        {TABS.map((item, index) => <button
          key={item.id}
          ref={(element) => { tabRefs.current[index] = element }}
          type="button"
          role="tab"
          id={`clinical-tab-${item.id}`}
          aria-selected={tab === item.id}
          aria-controls={`clinical-pane-${item.id}`}
          tabIndex={tab === item.id ? 0 : -1}
          onClick={() => setTab(item.id)}
          onKeyDown={(event) => {
            let next = index
            if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
            else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = TABS.length - 1
            else return
            event.preventDefault()
            event.stopPropagation()
            setTab(TABS[next].id)
            tabRefs.current[next]?.focus()
          }}
        >{item.label}{item.id === 'layout' && doc ? <span>{doc.images.length}</span> : null}</button>)}
      </div>

      {tab === 'library' && <div id="clinical-pane-library" className="clinical-pane" role="tabpanel" aria-labelledby="clinical-tab-library">
        <div className="clinical-section-label"><h3>Complete charts</h3><span>Open a ready-to-edit composition</span></div>
        <div className="clinical-templates">
          {CLINICAL_TEMPLATES.map((template) => <button
            key={template.key}
            type="button"
            disabled={loading}
            className="clinical-template"
            onClick={() => void openChart(template.key, template.label)}
          >
            <span className="clinical-template-symbol" aria-hidden="true">{template.region === 'All' ? '20' : template.region === 'Feet' ? '12' : '4'}</span>
            <span><strong>{template.label}</strong><small>{busy === template.key ? 'Opening…' : 'Open chart →'}</small></span>
          </button>)}
        </div>
        <div className="clinical-section-label"><h3>Individual views</h3><span>Add to the current page</span></div>
        <div className="clinical-filters">
          <div className="clinical-regions" role="group" aria-label="Filter anatomy region">
            {(['All', 'Body', 'Hands', 'Feet'] as const).map((item) => <button
              type="button"
              key={item}
              aria-pressed={region === item}
              onClick={() => setRegion(item)}
            >{item}<span>{item === 'All' ? CLINICAL_ASSETS.length : CLINICAL_ASSETS.filter((asset) => asset.region === item).length}</span></button>)}
          </div>
          <label className="clinical-field clinical-search">Find a view<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Front, palm, sole…"/></label>
          <label className="clinical-field">Side<select aria-label="Filter view side" value={side} onChange={(event) => setSide(event.target.value)}><option value="all">Any side</option><option value="left">Left</option><option value="right">Right</option></select></label>
        </div>
        <div className="clinical-assets">
          {assets.map((asset) => <article className="clinical-asset" key={asset.key}>
            <div className="clinical-thumbnail"><img src={sampleUrl(asset.file)} alt="" loading="lazy"/></div>
            <div className="clinical-asset-info"><h4>{asset.label}</h4><p>{asset.region} · {asset.view}{asset.side !== 'unspecified' ? ` · ${asset.side}` : ''}</p></div>
            <button type="button" disabled={!doc || loading} aria-label={`Add ${asset.label} to page`} onClick={() => void addView(asset.key, asset.label)}>{busy === asset.key ? 'Adding…' : '+ Add view'}</button>
          </article>)}
        </div>
        {!assets.length && <p className="clinical-empty">No views match these filters.</p>}
        {!doc && <p className="clinical-note">Open one of the complete charts to start a page.</p>}
      </div>}

      {tab === 'layout' && <div id="clinical-pane-layout" className="clinical-pane" role="tabpanel" aria-labelledby="clinical-tab-layout">
        <p className="clinical-note">Edit a position, width or angle, then press Enter. Width keeps the image’s proportions; attached points and labels move with it.</p>
        <div className="clinical-filters">
          <label className="clinical-field clinical-search">Find an image<input type="search" value={layoutSearch} onChange={(event) => setLayoutSearch(event.target.value)} placeholder="Search this page…"/></label>
          <label className="clinical-field">Grid columns<select value={columns} onChange={(event) => setColumns(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 8, 12].map((count) => <option key={count}>{count}</option>)}</select></label>
          <label className="clinical-field clinical-gap">Spacing<input type="number" min="0" max="1000" value={gap} onChange={(event) => setGap(event.target.value)}/></label>
          <button type="button" disabled={loading || !movableCount} onClick={arrange} title="Arrange all visible, unlocked images; keep their sizes and grow the page if needed">Arrange visible views</button>
        </div>
        {doc && shownImages.length > 0 ? <div className="clinical-table-scroll" tabIndex={0} role="region" aria-label="Image placement table">
          <table className="clinical-layout-table">
            <thead><tr><th scope="col">Image</th><th scope="col">X</th><th scope="col">Y</th><th scope="col">Width</th><th scope="col">Height</th><th scope="col">Angle °</th><th scope="col">Show</th><th scope="col">Lock</th></tr></thead>
            <tbody>{shownImages.map((image) => <tr key={image.id} className={selectedImageId === image.id ? 'clinical-selected-row' : ''}>
              <th scope="row"><button type="button" className="clinical-image-name" aria-label={`Select ${image.name} on canvas`} onClick={() => { const state = useStore.getState(); state.setTool('select'); state.selectImage(image.id); close() }}>{image.name}</button></th>
              {(['x', 'y', 'width'] as const).map((field) => <td key={field}><PlacementField image={image} field={field} documentId={doc.id} report={setNotice}/></td>)}
              <td className="clinical-derived-number" title="Height follows width to preserve proportions">{round(image.height)}</td>
              <td><PlacementField image={image} field="rotation" documentId={doc.id} report={setNotice}/></td>
              <td><input type="checkbox" aria-label={`Show ${image.name} in chart`} checked={image.visible !== false} onChange={(event) => { const state = useStore.getState(); state.record(); state.updateImageMeta(image.id, { visible: event.target.checked }) }}/></td>
              <td><input type="checkbox" aria-label={`Lock ${image.name} placement`} checked={!!image.locked} onChange={(event) => { const state = useStore.getState(); state.record(); state.updateImageMeta(image.id, { locked: event.target.checked }) }}/></td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="clinical-empty">{doc?.images.length ? 'No images match this search.' : 'Add a view or open a complete chart to arrange images.'}</p>}
        {doc && <div className="clinical-table-foot"><span>{shownImages.length} of {doc.images.length} images · {movableCount} visible and unlocked</span><button type="button" onClick={() => { useStore.setState((state) => ({ fitRequest: state.fitRequest + 1 })); close() }}>Fit page on canvas</button></div>}
      </div>}

      {tab === 'connections' && <div id="clinical-pane-connections" className="clinical-pane" role="tabpanel" aria-labelledby="clinical-tab-connections">
        <p className="clinical-note">Each row is one shared site. A number selects its markers; + adds a marker on that image. Labels and field keys stay linked across views.</p>
        <div className="clinical-filters">
          <label className="clinical-field clinical-search">Find a site<input type="search" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} placeholder="Site name, number or field key…"/></label>
          <label className="clinical-field clinical-search">Find an image<input type="search" value={imageSearch} onChange={(event) => setImageSearch(event.target.value)} placeholder="Filter the columns…"/></label>
          <label className="clinical-check"><input type="checkbox" checked={showConnections} onChange={(event) => useStore.getState().setShowSiteConnections(event.target.checked)}/> Show selected connections</label>
        </div>
        <form className="clinical-new-site" onSubmit={(event) => { event.preventDefault(); if (!newSite.trim()) return; useStore.getState().addSite(newSite.trim()); setNewSite('') }}>
          <label className="clinical-field">New shared site<input value={newSite} onChange={(event) => setNewSite(event.target.value)} placeholder="e.g. Left heel" maxLength={256}/></label>
          <button type="submit" disabled={!doc || !newSite.trim()}>+ Add site</button>
        </form>
        {expandedSite && expandedCell && expandedMarkers.length > 1 && <div className="clinical-marker-detail" aria-label="Choose a marker">
          <strong>{expandedSite.number}. {expandedSite.label} · {expandedImage?.name ?? 'Page'}</strong>
          <div>{expandedMarkers.map((marker, index) => <button type="button" key={marker.id} onClick={() => selectMarker(marker.id)}>Select marker {index + 1}{doc && view && !calloutShown(doc, marker, view) ? ' (hidden)' : ''}</button>)}</div>
          {expandedImage && <button type="button" disabled={expandedImage.visible === false} onClick={() => placeMarker(expandedSite.id, expandedImage.id)}>+ Another marker on this view</button>}
        </div>}
        {doc && sites.length > 0 && matrixImages.length > 0 ? <div className="clinical-table-scroll clinical-matrix-scroll" tabIndex={0} role="region" aria-label="Site and image connection matrix">
          <table className="clinical-matrix">
            <thead><tr><th scope="col">Shared site / field key</th>{matrixImages.map((image) => <th scope="col" key={image.id ?? 'page'}>{image.name}{image.hidden && <small>Hidden</small>}</th>)}</tr></thead>
            <tbody>{sites.map((site) => <tr key={site.id} className={selectedSiteId === site.id ? 'clinical-selected-row' : ''}>
              <th scope="row"><button type="button" onClick={() => selectSiteForReview(site.id)}><span className="clinical-site-number">{site.number}</span>{site.label}</button><code>{site.fieldKey}</code></th>
              {matrixImages.map((image) => {
                const markers = placements.get(site.id)?.get(image.id) ?? []
                const hiddenCount = markers.filter((marker) => view && !calloutShown(doc, marker, view)).length
                return <td key={image.id ?? 'page'}>
                  {markers.length ? <>
                    <span className="clinical-cell-actions">
                      <button type="button" className="clinical-marker-count" aria-label={`${site.label} on ${image.name}: ${markers.length} marker${markers.length === 1 ? '' : 's'}${hiddenCount ? `, ${hiddenCount} hidden` : ''}`} onClick={() => {
                        if (markers.length === 1) selectMarker(markers[0].id)
                        else { setExpandedCell({ siteId: site.id, imageId: image.id }); selectSiteForReview(site.id, false, markers) }
                      }}>{markers.length}</button>
                      {image.id && !image.hidden && <button type="button" className="clinical-add-marker" aria-label={`Add another ${site.label} marker on ${image.name}`} title={`Add another marker for this site on ${image.name}`} onClick={() => placeMarker(site.id, image.id!)}>+</button>}
                    </span>
                    {hiddenCount > 0 && <small>{hiddenCount} hidden</small>}
                  </> : image.id ? <button type="button" className="clinical-add-marker" disabled={image.hidden} title={image.hidden ? 'Show this image in the Layout table to place a marker.' : `Click ${image.name} on the canvas to place this site.`} aria-label={`Place ${site.label} on ${image.name}`} onClick={() => placeMarker(site.id, image.id!)}>+</button> : <span className="clinical-no-marker">—</span>}
                </td>
              })}
            </tr>)}</tbody>
          </table>
        </div> : <p className="clinical-empty">{!doc ? 'Open a chart to connect sites.' : !(doc.sites ?? []).length ? 'Add a shared site, then use + to place it on each relevant view.' : !sites.length ? 'No sites match this search.' : 'No images match this search.'}</p>}
        {doc && (doc.sites ?? []).length > 0 && <p className="clinical-note">{sites.length} site rows · {matrixImages.length} image columns. Scroll sideways to see every view. Select a site to edit its label and field key in the sidebar.</p>}
      </div>}
      <footer className="clinical-notice" role="status" aria-live="polite">{notice || 'Changes are saved with the project. Use Undo to restore an earlier layout.'}</footer>
    </div>}
  </section>
}
