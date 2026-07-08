import { useState } from 'react'
import { useStore } from '../store'
import { parseSvg } from '../svgParse'

type Source = 'file' | 'paste' | 'url'

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
      loadRaw(name || file.name.replace(/\.svg$/i, ''), await file.text())
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
      const text = await res.text()
      const fromUrl = url.split('/').pop()?.replace(/\.svg.*$/i, '') || 'Diagram'
      loadRaw(name || fromUrl, text)
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
          Bring in a body or diagram SVG to annotate, then drop points and name them.
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
            SVG file
            <input
              type="file"
              accept=".svg,image/svg+xml"
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
