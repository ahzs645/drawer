import { useRef, useState } from 'react'
import { calloutsOnImage } from '../docModel'
import { rasterMime } from '../diagramMappings'
import { findImage, round } from '../geometry'
import { SAMPLES, useStore } from '../store'
import { CollapsiblePanel } from './CollapsiblePanel'
import { NewDialog } from './NewDialog'

const MAX_REFERENCE_BYTES = 8 * 1024 * 1024

/** Read a local PNG/JPEG/WebP for the tracing overlay (kept in memory only). */
async function readOverlay(file: File): Promise<string> {
  if (file.size === 0 || file.size > MAX_REFERENCE_BYTES) throw new Error('Use a PNG, JPEG or WebP image up to 8 MB.')
  const mime = rasterMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
  if (!mime) throw new Error('The file is not a PNG, JPEG or WebP image.')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`))
    reader.readAsDataURL(file)
  })
}

/** Every drawing on the page, plus page and reference-overlay settings. */
export function ImagesPanel() {
  const doc = useStore((s) => s.doc)
  const selectedImageId = useStore((s) => s.selectedImageId)
  const selectImage = useStore((s) => s.selectImage)
  const updateImageMeta = useStore((s) => s.updateImageMeta)
  const addSampleImage = useStore((s) => s.addSampleImage)
  const setPageSize = useStore((s) => s.setPageSize)
  const setExportFrame = useStore((s) => s.setExportFrame)
  const reference = useStore((s) => s.reference)
  const setReference = useStore((s) => s.setReference)
  const record = useStore((s) => s.record)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const overlayInput = useRef<HTMLInputElement>(null)

  if (!doc) return null
  const page = doc.base.viewBox

  return (
    <CollapsiblePanel title={`Images (${doc.images.length})`} className="images-panel">
      <p className="hint">
        Each image moves on its own; its points, labels and attached text move with it. Use the{' '}
        <b>Select</b> tool to drag, or the handles to resize and rotate.
      </p>
      <ul className="image-list">
        {[...doc.images].reverse().map((image) => (
          <li
            key={image.id}
            className={image.id === selectedImageId ? 'selected' : ''}
            onClick={() => selectImage(image.id)}
          >
            <span className="cl-name">{image.name || 'Untitled image'}</span>
            <button
              className="icon"
              title={image.locked ? 'Unlock' : 'Lock (prevents moving and deleting)'}
              aria-label={`${image.locked ? 'Unlock' : 'Lock'} ${image.name}`}
              aria-pressed={!!image.locked}
              onClick={(e) => {
                e.stopPropagation()
                record()
                updateImageMeta(image.id, { locked: !image.locked })
              }}
            >
              {image.locked ? '🔒' : '🔓'}
            </button>
            <input
              type="checkbox"
              checked={image.visible !== false}
              title="Visible"
              aria-label={`Show ${image.name}`}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                record()
                updateImageMeta(image.id, { visible: e.target.checked })
              }}
            />
          </li>
        ))}
      </ul>
      <div className="row">
        <select
          value=""
          aria-label="Add a bundled body drawing"
          onChange={(e) => {
            if (e.target.value) void addSampleImage(e.target.value)
            e.target.value = ''
          }}
        >
          <option value="">+ Add sample…</option>
          {SAMPLES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button onClick={() => setAdding(true)} title="Add an SVG or raster image from a file, pasted markup, or a URL">
          + Add image…
        </button>
      </div>

      <details className="subsection">
        <summary>Page &amp; export frame</summary>
        <div className="row">
          <label className="field">
            Page width
            <input type="number" min="1" step="1" value={round(page.w)} onFocus={record} onChange={(e) => setPageSize(Number(e.target.value), page.h)} />
          </label>
          <label className="field">
            Page height
            <input type="number" min="1" step="1" value={round(page.h)} onFocus={record} onChange={(e) => setPageSize(page.w, Number(e.target.value))} />
          </label>
        </div>
        <label className="field checkbox" title="Export exactly the page rectangle instead of fitting the content">
          <input
            type="checkbox"
            checked={doc.exportFrame === 'page'}
            onChange={(e) => setExportFrame(e.target.checked ? 'page' : 'content')}
          />
          Export the page frame (show it on the canvas)
        </label>
      </details>

      <details className="subsection">
        <summary>Reference overlay</summary>
        <p className="hint">
          A PNG/JPEG/WebP drawn over the page to trace or check placement. Kept for this session only;
          never saved or exported.
        </p>
        {reference ? (
          <>
            <label className="field checkbox">
              <input type="checkbox" checked={reference.visible} onChange={(e) => setReference({ ...reference, visible: e.target.checked })} />
              Show {reference.name}
            </label>
            <label className="field">
              Opacity
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={reference.opacity}
                onChange={(e) => setReference({ ...reference, opacity: Number(e.target.value) })}
              />
            </label>
            <button onClick={() => setReference(null)}>Remove overlay</button>
          </>
        ) : (
          <button onClick={() => overlayInput.current?.click()}>Load overlay image…</button>
        )}
        <input
          ref={overlayInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              setError('')
              setReference({ dataUrl: await readOverlay(file), name: file.name, opacity: 0.35, visible: true })
            } catch (err) {
              setError((err as Error).message)
            }
          }}
        />
      </details>
      {error && <p className="hint error" role="alert">{error}</p>}
      {adding && <NewDialog mode="add" onClose={() => setAdding(false)} />}
    </CollapsiblePanel>
  )
}

/** Position, size, rotation and actions for the selected image. */
export function ImageInspector() {
  const doc = useStore((s) => s.doc)
  const selectedImageId = useStore((s) => s.selectedImageId)
  const setImagePlacement = useStore((s) => s.setImagePlacement)
  const updateImageMeta = useStore((s) => s.updateImageMeta)
  const duplicateImage = useStore((s) => s.duplicateImage)
  const deleteImage = useStore((s) => s.deleteImage)
  const reorderImage = useStore((s) => s.reorderImage)
  const record = useStore((s) => s.record)
  if (!doc) return null
  const image = findImage(doc, selectedImageId)
  if (!image) return null
  const index = doc.images.findIndex((i) => i.id === image.id)
  const attached = calloutsOnImage(doc, image.id).size
  const locked = !!image.locked

  const num = (label: string, key: 'x' | 'y' | 'width' | 'height' | 'rotation', step = '1') => (
    <label className="field">
      {label}
      <input
        type="number"
        step={step}
        disabled={locked}
        value={round(image[key])}
        onFocus={record}
        onChange={(e) => {
          const value = Number(e.target.value)
          if (!Number.isFinite(value)) return
          if (key === 'width' || key === 'height') {
            if (value <= 0) return
            // keep the drawing's aspect ratio: width and height move together
            const ratio = image.height / image.width
            setImagePlacement(image.id, key === 'width' ? { width: value, height: value * ratio } : { height: value, width: value / ratio })
          } else {
            setImagePlacement(image.id, { [key]: value })
          }
        }}
      />
    </label>
  )

  return (
    <CollapsiblePanel title="Image" className="inspector image-inspector">
      <label className="field">
        Name
        <input type="text" value={image.name} onFocus={record} onChange={(e) => updateImageMeta(image.id, { name: e.target.value })} />
      </label>
      <div className="row">
        {num('X', 'x')}
        {num('Y', 'y')}
      </div>
      <div className="row">
        {num('Width', 'width')}
        {num('Height', 'height')}
        {num('Rotation°', 'rotation', '0.5')}
      </div>
      <div className="row">
        <label className="field checkbox">
          <input
            type="checkbox"
            disabled={locked}
            checked={!!image.flipX}
            onChange={(e) => {
              record()
              setImagePlacement(image.id, { flipX: e.target.checked })
            }}
          />
          Mirror
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => {
              record()
              updateImageMeta(image.id, { locked: e.target.checked })
            }}
          />
          Locked
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={image.visible !== false}
            onChange={(e) => {
              record()
              updateImageMeta(image.id, { visible: e.target.checked })
            }}
          />
          Visible
        </label>
      </div>
      <p className="hint">
        {attached} callout{attached === 1 ? '' : 's'} attached. Arrow keys nudge (Shift ×10).
        {image.source ? <> Source: {image.source}</> : null}
      </p>
      <div className="row wrap">
        <button onClick={() => duplicateImage(image.id)} title="Copy the image with its points, labels and site markers">Duplicate</button>
        <button onClick={() => duplicateImage(image.id, true)} title="Mirrored copy to the right">Mirror copy</button>
        <button disabled={index <= 0} onClick={() => reorderImage(image.id, -1)}>Layer down</button>
        <button disabled={index >= doc.images.length - 1} onClick={() => reorderImage(image.id, 1)}>Layer up</button>
      </div>
      <button
        className="danger block"
        disabled={locked}
        onClick={() => {
          if (attached && !window.confirm(`Delete ${image.name} and its ${attached} attached callout(s)? Site rows are kept.`)) return
          deleteImage(image.id)
        }}
      >
        Delete image
      </button>
    </CollapsiblePanel>
  )
}

/** "Moves with image" picker for page items (text, lines, shapes). */
export function AttachToImage({ value, onChange }: { value: string | undefined; onChange: (imageId: string | undefined) => void }) {
  const doc = useStore((s) => s.doc)
  const record = useStore((s) => s.record)
  if (!doc || (!doc.images.length && !value)) return null
  return (
    <label className="field" title="Attached items move, scale and rotate with their image">
      Moves with image
      <select
        value={value ?? ''}
        onChange={(e) => {
          record()
          onChange(e.target.value || undefined)
        }}
      >
        <option value="">Nothing (stays on the page)</option>
        {doc.images.map((image) => (
          <option key={image.id} value={image.id}>
            {image.name || 'Untitled image'}
          </option>
        ))}
      </select>
    </label>
  )
}
