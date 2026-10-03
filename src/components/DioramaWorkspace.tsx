import { useEffect, useRef, useState } from 'react'
import { createDioramaEditor } from '../diorama/editor.js'
import type { DioramaController } from '../diorama/editor.js'
import { parseProject } from '../export/projectIo'
import { SAMPLES, sampleUrl } from '../samples'
import { useStore } from '../store'

/** Separate source scene + explicit native Drawer snapshot. Opening this workspace
 * never overwrites the active Drawer document. Publishing asks for confirmation.
 * The source scene keeps image instances; the legacy Drawer document is a snapshot.
 */
export function DioramaWorkspace() {
  const [open, setOpen] = useState(false)
  const [libraryVariant, setLibraryVariant] = useState(false)
  const [error, setError] = useState('')
  const mount = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !mount.current) return
    const abort = new AbortController()
    let controller: DioramaController | undefined
    setError('')
    const template = libraryVariant ? 'skin-assessment-library' : 'skin-assessment'
    fetch(sampleUrl(`diorama/${template}.scene.json`), { signal: abort.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Could not load the scene template (${response.status}).`)
        return response.json() as Promise<unknown>
      })
      .then(scene => {
        if (abort.signal.aborted || !mount.current) return
        controller = createDioramaEditor(mount.current, {
          scene,
          // Keep the two variants' saved layouts separate. The old key is retained.
          storageKey: libraryVariant ? 'drawer:diorama:body-library:v1' : 'drawer:diorama:v1',
          library: SAMPLES.map(sample => ({name: sample.label, url: sampleUrl(sample.file)})),
          onPublish: project => {
            // Use the real existing project parser: sanitization, geometry remeasurement,
            // existing mappings, anchor validation and field-value handling are retained.
            const doc = parseProject(JSON.stringify(project))
            useStore.getState().loadDoc(doc)
            useStore.setState({ status: 'Opened diorama snapshot. Reopen the composer to continue editing the separate movable scene.' })
            setOpen(false)
          },
        })
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not open the diorama.')
      })
    return () => { abort.abort(); controller?.destroy() }
  }, [open, libraryVariant])

  return (
    <section aria-label="Multi-image composition" style={{ padding: '6px 14px', borderBottom: '1px solid #d7dee7', display: 'flex', alignItems: 'center', gap: 10 }}>
      <button type="button" onClick={() => { setLibraryVariant(false); setOpen(true) }}>Open diorama composer</button>
      <button type="button" onClick={() => { setLibraryVariant(true); setOpen(true) }}>Open library-body variant</button>
      <span style={{ fontSize: 12 }}>Arrange multiple SVGs and connect them through a shared site table.</span>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Diorama composer" data-drawer-scene
          onKeyDown={event => event.stopPropagation()}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#f4f6f8', overflow: 'auto' }}>
          <div style={{ padding: '7px 14px', display: 'flex', justifyContent: 'space-between', background: 'white', borderBottom: '1px solid #d7dee7' }}>
            <span>Drawer / Diorama · source scene is saved separately from the standard editor</span>
            <button type="button" autoFocus onClick={() => setOpen(false)}>Close composer</button>
          </div>
          {error && <p role="alert" style={{ padding: 18 }}>{error}</p>}
          <div ref={mount} />
        </div>
      )}
    </section>
  )
}
