import { useRef, useState } from 'react'
import { exportSvg } from '../export/exportSvg'
import { svgToPng } from '../export/exportPng'
import { svgToPdf, svgsToPdf } from '../export/exportPdf'
import {
  downloadBlob,
  downloadText,
  parseProject,
  serializeProject,
} from '../export/projectIo'
import { SAMPLES, useStore } from '../store'

export function Toolbar() {
  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const loadSampleKey = useStore((s) => s.loadSampleKey)
  const importSvgText = useStore((s) => s.importSvgText)
  const loadDoc = useStore((s) => s.loadDoc)
  const setDocName = useStore((s) => s.setDocName)
  const record = useStore((s) => s.record)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)

  const svgInput = useRef<HTMLInputElement>(null)
  const projInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onImportSvg = async (file: File) => {
    const text = await file.text()
    importSvgText(file.name, text)
  }
  const onOpenProject = async (file: File) => {
    try {
      loadDoc(parseProject(await file.text()))
    } catch (e) {
      alert(`Could not open project: ${(e as Error).message}`)
    }
  }

  const doExportSvg = () => {
    if (!doc) return
    downloadText(`${doc.name || 'diagram'}.svg`, exportSvg(doc), 'image/svg+xml')
  }
  const doExportPng = async () => {
    if (!doc) return
    setBusy(true)
    try {
      const blob = await svgToPng(exportSvg(doc), 2)
      downloadBlob(`${doc.name || 'diagram'}.png`, blob)
    } catch (e) {
      alert(`PNG export failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const doExportPdf = async () => {
    if (!doc) return
    setBusy(true)
    try {
      await svgToPdf(exportSvg(doc), `${doc.name || 'diagram'}.pdf`)
    } catch (e) {
      alert(`PDF export failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const doExportPdfAll = async () => {
    if (!doc) return
    setBusy(true)
    try {
      const pages = doc.views.map((v) => exportSvg(doc, { viewId: v.id }))
      await svgsToPdf(pages, `${doc.name || 'diagram'}-all-views.pdf`)
    } catch (e) {
      alert(`PDF export failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const doSaveProject = () => {
    if (!doc) return
    downloadText(`${doc.name || 'project'}.drawer.json`, serializeProject(doc), 'application/json')
  }

  return (
    <header className="toolbar">
      <div className="brand">Drawer</div>

      <div className="group">
        <button
          className={tool === 'anchor' ? 'active' : ''}
          onClick={() => setTool('anchor')}
          title="Click the body to drop an anchored callout"
        >
          ✛ Add callout
        </button>
        <button
          className={tool === 'select' ? 'active' : ''}
          onClick={() => setTool('select')}
          title="Select / drag / pan"
        >
          ↖ Select
        </button>
      </div>

      <div className="group">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
          ↺
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
          ↻
        </button>
      </div>

      <div className="group">
        <label className="field">
          Body
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) loadSampleKey(e.target.value, e.target.value === 'divider')
              e.target.value = ''
            }}
          >
            <option value="">Load sample…</option>
            {SAMPLES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => svgInput.current?.click()}>Import SVG</button>
        <button onClick={() => projInput.current?.click()}>Open project</button>
      </div>

      <label className="field name-field">
        Name
        <input
          type="text"
          value={doc?.name ?? ''}
          placeholder="diagram"
          onFocus={record}
          onChange={(e) => setDocName(e.target.value)}
        />
      </label>

      <div className="group right">
        <button onClick={doSaveProject} disabled={!doc}>
          Save project
        </button>
        <button onClick={doExportSvg} disabled={!doc}>
          Export SVG
        </button>
        <button onClick={doExportPng} disabled={!doc || busy}>
          {busy ? 'Rendering…' : 'Export PNG'}
        </button>
        <button onClick={doExportPdf} disabled={!doc || busy}>
          Export PDF
        </button>
        {doc && doc.views.length > 1 && (
          <button
            onClick={doExportPdfAll}
            disabled={busy}
            title="One vector PDF with a page per view"
          >
            PDF · all views
          </button>
        )}
        <a
          className="source-link"
          href="https://github.com/ahzs645/drawer"
          target="_blank"
          rel="noopener noreferrer"
          title="Drawer is free software (AGPL-3.0). View the source."
        >
          Source ↗
        </a>
      </div>

      <input
        ref={svgInput}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImportSvg(f)
          e.target.value = ''
        }}
      />
      <input
        ref={projInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onOpenProject(f)
          e.target.value = ''
        }}
      />
    </header>
  )
}
