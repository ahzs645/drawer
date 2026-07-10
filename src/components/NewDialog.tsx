import { useState } from 'react'
import { useStore } from '../store'
import { parseSvg } from '../svgParse'

type Source = 'file' | 'paste' | 'url'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image data.'))
    reader.readAsDataURL(blob)
  })
}

async function rasterToSvg(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob)
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.onerror = () => reject(new Error('The raster image could not be decoded.'))
    image.src = dataUrl
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}"><image href="${dataUrl}" x="0" y="0" width="${size.width}" height="${size.height}"/></svg>`
}

/**
 * "New diagram" flow: start a fresh document from an SVG brought in three ways —
 * a local file, pasted markup, or a URL. The SVG is validated before it replaces
 * the current document so a bad paste/URL surfaces an error instead of wiping work.
 */
export function NewDialog({ onClose }: { onClose: () => void }) {
  const importSvgText = useStore((s) => s.importSvgText)
  const hasWork = useStore((s) => (s.doc?.callouts.length ?? 0) > 0)

  const [source, setSource] = useState<Source>('file')
  const [paste, setPaste] = useState('')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadRaw = (docName: string, raw: string) => {
    try {
      parseSvg(raw) // validate first; throws on bad SVG
    } catch (e) {
      setError(`That doesn't look like a valid SVG: ${(e as Error).message}`)
      return
    }
    importSvgText(docName.trim() || 'Untitled', raw)
    onClose()
  }

  const onFile = async (file: File) => {
    setError(null)
    try {
      const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
      const raw = isSvg ? await file.text() : await rasterToSvg(file)
      loadRaw(name || file.name.replace(/\.(svg|png|jpe?g|webp)$/i, ''), raw)
    } catch (e) {
      setError(`Could not read the file: ${(e as Error).message}`)
    }
  }

  const submitPaste = () => {
    if (!paste.trim()) return setError('Paste some SVG markup first.')
    loadRaw(name || 'Pasted diagram', paste)
  }

  const submitUrl = async () => {
    if (!url.trim()) return setError('Enter a URL first.')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url.trim())
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const type = res.headers.get('content-type') || ''
      const isRaster = /^image\/(png|jpeg|webp)/i.test(type)
      const raw = isRaster ? await rasterToSvg(await res.blob()) : await res.text()
      const fromUrl = url.split('/').pop()?.replace(/\.(svg|png|jpe?g|webp).*$/i, '') || 'Diagram'
      loadRaw(name || fromUrl, raw)
    } catch (e) {
      setError(
        `Couldn't fetch that URL (${(e as Error).message}). The site may block cross-origin ` +
          `requests — download the SVG and use “Upload file” instead.`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New diagram"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title">New diagram</div>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="hint">
          Bring in an SVG, PNG, JPEG, or WebP body/diagram to annotate, then drop points and name them.
          {hasWork && <> This replaces the diagram you have open.</>}
        </p>

        <div className="seg">
          <button className={source === 'file' ? 'active' : ''} onClick={() => setSource('file')}>
            Upload file
          </button>
          <button className={source === 'paste' ? 'active' : ''} onClick={() => setSource('paste')}>
            Paste SVG
          </button>
          <button className={source === 'url' ? 'active' : ''} onClick={() => setSource('url')}>
            From URL
          </button>
        </div>

        <label className="field">
          Name (optional)
          <input
            type="text"
            value={name}
            placeholder="Diagram name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {source === 'file' && (
          <label className="field">
            Diagram file
            <input
              type="file"
              accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ''
              }}
            />
          </label>
        )}

        {source === 'paste' && (
          <label className="field">
            SVG markup
            <textarea
              className="svg-paste"
              value={paste}
              placeholder="<svg viewBox=&quot;0 0 100 100&quot;>…</svg>"
              onChange={(e) => setPaste(e.target.value)}
              rows={7}
            />
          </label>
        )}

        {source === 'url' && (
          <label className="field">
            SVG URL
            <input
              type="url"
              value={url}
              placeholder="https://example.com/body.svg"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitUrl()
              }}
            />
          </label>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          {source === 'paste' && (
            <button className="primary" onClick={submitPaste}>
              Create
            </button>
          )}
          {source === 'url' && (
            <button className="primary" onClick={submitUrl} disabled={busy}>
              {busy ? 'Loading…' : 'Fetch & create'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
