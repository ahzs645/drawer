import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { addReferenceImage, attachAnchorToTarget, missingTargets, readReferenceImage, replaceImageArtwork, setAnchorMapping, validateDiagramExtensions } from '../diagramMappings'
import { calloutFieldKey, calloutName, siteById } from '../docModel'
import { drawingFor, findImage } from '../geometry'
import { parseSvg } from '../svgParse'
import { getView } from '../resolve'
import { downloadText } from '../export/projectIo'
import { createFootArteriesDoc } from '../templates/footArteries'
import type { AnchorMapping, DrawerDoc, MappingMode, MappingValue, TextAnnotationAlign } from '../types'
import './diagramMappings.css'

/** All changes use the existing history/autosave pipeline, not component-only state. */
function commitDiagram(change: (doc: DrawerDoc) => DrawerDoc): void {
  const state = useStore.getState()
  if (!state.doc) throw new Error('Open a drawing first.')
  const next = change(state.doc)
  validateDiagramExtensions(next)
  state.record()
  useStore.setState({ doc: next, future: [], fitRequest: state.fitRequest + 1 })
}

export function DiagramMappingsPanel() {
  const doc = useStore((s) => s.doc)
  const status = useStore((s) => s.status)
  const selectedId = useStore((s) => s.selectedCalloutId)
  const selectedImageId = useStore((s) => s.selectedImageId)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<AnchorMapping>({ fieldKey: '' })
  const [label, setLabel] = useState('')
  const [values, setValues] = useState('{}')
  const callout = doc?.callouts.find((c) => c.id === selectedId)
  const anchor = doc?.anchors.find((a) => a.id === callout?.anchorId)
  const view = doc ? getView(doc) : undefined
  const missing = doc ? missingTargets(doc) : []
  // targets are the named parts of the drawing this point is on
  const targetKeys = doc ? Object.keys(drawingFor(doc, anchor?.imageId).targetBoxes).sort((a, b) => Number(b.startsWith('site-')) - Number(a.startsWith('site-')) || a.localeCompare(b)) : []
  // artwork replacement applies to the selected image, else the selected point's image, else a lone image
  const artworkImage = doc ? findImage(doc, selectedImageId) ?? findImage(doc, anchor?.imageId) ?? (doc.images.length === 1 ? doc.images[0] : undefined) : undefined

  useEffect(() => { setDraft(anchor?.mapping ?? { fieldKey: '' }) }, [doc?.id, anchor?.id, anchor?.mapping])
  useEffect(() => { setLabel(callout?.labelText ?? '') }, [callout?.id, callout?.labelText])
  useEffect(() => { setValues(JSON.stringify(doc?.mappingValues ?? {}, null, 2)) }, [doc?.id, doc?.mappingValues])

  const run = (action: () => void, success = 'Saved in this project.') => {
    try { action(); setMessage(success) } catch (e) { setMessage((e as Error).message) }
  }

  const replaceSvg = async (file: File) => {
    const snapshot = useStore.getState().doc
    if (!snapshot) return
    setBusy(true)
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Use an SVG up to 2 MiB.')
      if (!artworkImage) throw new Error('Select the image whose artwork you want to replace.')
      const imageId = artworkImage.id
      const before = artworkImage.drawing
      const drawing = parseSvg(await file.text())
      commitDiagram((current) => {
        if (current.id !== snapshot.id || findImage(current, imageId)?.drawing !== before) throw new Error('The drawing changed while reading the SVG; select the file again.')
        return replaceImageArtwork(current, imageId, drawing)
      })
      setMessage(`Artwork of ${artworkImage.name} replaced; anchors, mappings, views and reference images retained.`)
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }

  const attachFile = async (file: File) => {
    if (!doc || !anchor) return
    const documentId = doc.id
    const anchorId = anchor.id
    setBusy(true)
    try {
      const attachment = await readReferenceImage(file)
      commitDiagram((current) => {
        if (current.id !== documentId) throw new Error('The drawing changed while reading the image; select the file again.')
        return addReferenceImage(current, anchorId, attachment)
      })
      setMessage(`Attached ${attachment.name}. Reference images are saved in project JSON, not SVG exports.`)
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <section className="dm-bar" aria-label="Diagram tools">
      <button type="button" disabled={busy || status.startsWith('Loading')} onClick={() => run(() => {
        if (doc && !window.confirm('Replace the current drawing with the foot-artery template? Export your current project first.')) return
        useStore.getState().loadDoc(createFootArteriesDoc())
        useStore.setState({ tool: 'select', showLandmarks: false })
        setOpen(true)
      }, 'Foot-artery template opened. No external clinical codes have been assigned.')}>Foot-artery template</button>
      <button type="button" aria-expanded={open} aria-controls="diagram-mappings-panel" onClick={() => setOpen(!open)}>Mappings &amp; attachments</button>
      <span className="dm-summary">{doc ? `${doc.callouts.filter((c) => calloutFieldKey(doc, c)).length} / ${doc.callouts.length} points mapped` : 'Open a drawing to assign mappings'}</span>
      {open && <div className="dm-panel" id="diagram-mappings-panel" role="region" aria-label="Mappings and attachments">
        <div className="dm-heading"><h2>Mappings &amp; attachments</h2><button type="button" aria-label="Close mappings panel" onClick={() => setOpen(false)}>Close</button></div>
        <p className="dm-note">The template reproduces the supplied schematic. Positions and clinical codes require review. Use non-patient test data here.</p>
        {missing.length > 0 && <p className="dm-warning" role="alert">Missing SVG targets: {missing.join(', ')}. Reattach these points before relying on the rendering.</p>}
        <label className="dm-field">Point / callout
          <select value={callout?.id ?? ''} disabled={!doc} onChange={(e) => useStore.getState().select(e.target.value || null)}>
            <option value="">Select a point on the drawing or here</option>
            {doc?.callouts.map((c) => <option key={c.id} value={c.id}>{calloutName(doc, c).replace(/\n/g, ' ')}</option>)}
          </select>
        </label>
        {anchor && callout && <>
          <small className="dm-id">{anchor.id}</small>
          <label className="dm-field">Attach point to SVG element{anchor.imageId ? ` of ${findImage(doc!, anchor.imageId)?.name ?? 'its image'}` : ''}
            <select value={anchor.relative?.targetId ?? ''} onChange={(e) => run(() => commitDiagram((d) => attachAnchorToTarget(d, anchor.id, e.target.value || null)))}>
              <option value="">Whole drawing</option>
              {anchor.relative?.targetId && !targetKeys.includes(anchor.relative.targetId) && <option value={anchor.relative.targetId}>Missing: {anchor.relative.targetId}</option>}
              {targetKeys.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => run(() => commitDiagram((d) => attachAnchorToTarget(d, anchor.id, anchor.relative?.targetId ?? null, true)))}>Center point on attached element</button>
          <p className="dm-note">Changing the attachment preserves the point's position. Centering moves it explicitly. Stable SVG IDs keep it attached when the artwork is replaced.</p>
          {callout.siteId && siteById(doc!, callout.siteId) ? <fieldset><legend>External mapping</legend>
            <p className="dm-note">This is a marker of site {siteById(doc!, callout.siteId)!.number} ({siteById(doc!, callout.siteId)!.label}). It uses the site’s field key <code>{siteById(doc!, callout.siteId)!.fieldKey}</code>; edit it in the Sites panel.</p>
            <button type="button" onClick={() => useStore.getState().selectSite(callout.siteId!)}>Edit the site</button>
          </fieldset> : <fieldset><legend>External mapping</legend>
            <label className="dm-field">Field key<input maxLength={512} value={draft.fieldKey} placeholder="Your application's exact field key" onChange={(e) => setDraft({ ...draft, fieldKey: e.target.value })}/></label>
            <label className="dm-field">Mapped display name<input maxLength={512} value={draft.display ?? ''} onChange={(e) => setDraft({ ...draft, display: e.target.value })}/></label>
            <label className="dm-field">Code system (optional)<input maxLength={512} value={draft.system ?? ''} onChange={(e) => setDraft({ ...draft, system: e.target.value })}/></label>
            <label className="dm-field">Code (optional)<input maxLength={512} value={draft.code ?? ''} onChange={(e) => setDraft({ ...draft, code: e.target.value })}/></label>
            <div className="dm-row"><button type="button" onClick={() => run(() => commitDiagram((d) => setAnchorMapping(d, anchor.id, { ...draft, fieldKey: draft.fieldKey.trim() })))}>Save mapping</button><button type="button" onClick={() => run(() => commitDiagram((d) => setAnchorMapping(d, anchor.id, undefined)))}>Clear mapping</button></div>
          </fieldset>}
          {!callout.siteId && <fieldset><legend>Editable label</legend>
            <label className="dm-field">Label text — Enter adds a line<textarea rows={3} value={label} onChange={(e) => setLabel(e.target.value)}/></label>
            <button type="button" onClick={() => run(() => commitDiagram((d) => ({ ...d, callouts: d.callouts.map((c) => c.id === callout.id ? { ...c, labelText: label } : c) })))}>Apply label</button>
            <label className="dm-field"><span><input type="checkbox" checked={!!callout.labelOffset} onChange={(e) => run(() => commitDiagram((d) => ({ ...d, callouts: d.callouts.map((c) => c.id === callout.id ? { ...c, labelOffset: e.target.checked ? { x: 0, y: -40 } : undefined } : c) })))}/> Place text independently of leader endpoint</span></label>
            {callout.labelOffset && <>
              <div className="dm-row">{(['x', 'y'] as const).map((axis) => <label className="dm-field" key={axis}>Text offset {axis}<input type="number" value={callout.labelOffset![axis]} onChange={(e) => { const number = Number(e.target.value); if (Number.isFinite(number)) run(() => commitDiagram((d) => ({ ...d, callouts: d.callouts.map((c) => c.id === callout.id ? { ...c, labelOffset: { ...c.labelOffset!, [axis]: number } } : c) }))) }}/></label>)}</div>
              <label className="dm-field">Text alignment<select value={callout.labelAlign ?? 'start'} onChange={(e) => run(() => commitDiagram((d) => ({ ...d, callouts: d.callouts.map((c) => c.id === callout.id ? { ...c, labelAlign: e.target.value as TextAnnotationAlign } : c) })))}><option value="start">Start</option><option value="middle">Center</option><option value="end">End</option></select></label>
            </>}
            <p className="dm-note">Per-view text overrides still take precedence. Dragging a label keeps its text offset attached to the leader endpoint.</p>
          </fieldset>}
          <fieldset><legend>Reference images for this point</legend>
            <label className="dm-field">Attach a PNG, JPEG or WebP<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void attachFile(file) }}/></label>
            <p className="dm-note">1 MiB per image; 2 MiB total per project. Embedded in downloaded projects and browser autosave. Not printed or embedded in SVG exports.</p>
            {(anchor.attachments ?? []).map((a) => <figure className="dm-reference" key={a.id}><img src={a.dataUrl} alt={a.name}/><figcaption>{a.name} <button type="button" onClick={() => run(() => commitDiagram((d) => ({ ...d, anchors: d.anchors.map((point) => point.id === anchor.id ? { ...point, attachments: point.attachments?.filter((file) => file.id !== a.id) } : point) })))}>Remove reference</button></figcaption></figure>)}
          </fieldset>
        </>}
        {doc && <>
          <fieldset><legend>Rendering in the current view</legend>
            <label className="dm-field">Label source<select value={view?.mappingMode ?? 'label'} onChange={(e) => run(() => commitDiagram((d) => ({ ...d, views: d.views.map((v) => v.id === d.activeViewId ? { ...v, mappingMode: e.target.value as MappingMode } : v) })))}><option value="label">Original label</option><option value="mapped-label">Mapped display name</option><option value="value">Mapped value</option><option value="label-value">Mapped name + value</option></select></label>
            {view?.labelMode !== 'names' && <p className="dm-warning">This is a numbered or blank view. Switch to a names view to see mapped text.</p>}
            <label className="dm-field">Flat field-value JSON<textarea rows={5} spellCheck={false} value={values} onChange={(e) => setValues(e.target.value)}/></label>
            <button type="button" onClick={() => run(() => { const next: unknown = JSON.parse(values); commitDiagram((d) => ({ ...d, mappingValues: next as Record<string, MappingValue> })) })}>Apply values</button>
            <p className="dm-note">Keys match exactly, including dots. Missing or null values render as an em dash. No formulas are evaluated.</p>
          </fieldset>
          <fieldset><legend>Artwork and integration</legend>
            <label className="dm-field">Replace artwork of {artworkImage ? `“${artworkImage.name}”` : 'the selected image'} while keeping mappings<input type="file" accept="image/svg+xml,.svg" disabled={busy || !artworkImage} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void replaceSvg(file) }}/></label>
            <p className="dm-note">Missing referenced IDs cancel replacement. Supported SVG is self-contained vector markup; active content, embedded stylesheets and external resources are removed.</p>
            <button type="button" onClick={() => downloadText('drawer-mappings.json', JSON.stringify({ format: 'drawer-anchor-mappings', version: 1, documentId: doc.id, anchors: doc.anchors.map((a) => ({ id: a.id, mode: a.mode, imageId: a.imageId ?? null, relative: a.relative, absolute: a.absolute, mapping: a.mapping ?? null })), sites: doc.sites ?? [] }, null, 2), 'application/json')}>Export mapping manifest</button>
            <p className="dm-note">Use Drawer’s existing project export to retain the full editable drawing, mappings, values and reference images. SVG/PNG use the same resolved callouts.</p>
          </fieldset>
        </>}
        <p role="status" className="dm-message">{busy ? 'Reading attachment…' : message}</p>
      </div>}
    </section>
  )
}
