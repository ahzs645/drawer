import { useRef, useState } from 'react'
import { exportSvg } from '../export/exportSvg'
import { exportCalloutsJson } from '../export/exportCallouts'
import { svgToPng } from '../export/exportPng'
import { svgToPdf, svgsToPdf } from '../export/exportPdf'
import {
  downloadBlob,
  downloadText,
  parseProject,
  serializeProject,
} from '../export/projectIo'
import { sitesCsv } from '../docModel'
import { TEMPLATES } from '../samples'
import { SAMPLES, useStore, type AreaMode } from '../store'
import { NewDialog } from './NewDialog'

export function Toolbar() {
  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const areaMode = useStore((s) => s.areaMode)
  const setAreaMode = useStore((s) => s.setAreaMode)
  const loadSampleKey = useStore((s) => s.loadSampleKey)
  const loadTemplate = useStore((s) => s.loadTemplate)
  const loadDoc = useStore((s) => s.loadDoc)
  const setDocName = useStore((s) => s.setDocName)
  const record = useStore((s) => s.record)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)

  const projInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [showNew, setShowNew] = useState(false)

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
  const doExportSvgJson = () => {
    if (!doc) return
    const stem = doc.name || 'diagram'
    const svgName = `${stem}.svg`
    downloadText(svgName, exportSvg(doc), 'image/svg+xml')
    downloadText(
      `${stem}.callouts.json`,
      exportCalloutsJson(doc, { svgFilename: svgName }),
      'application/json',
    )
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
          className={tool === 'text' ? 'active' : ''}
          onClick={() => setTool('text')}
          title="Click the figure to add a heading, caption, or figure letter"
        >
          T Add text
        </button>
        <button
          className={tool === 'landmark' ? 'active' : ''}
          onClick={() => setTool('landmark')}
          title="Click the figure to create a reusable landmark directly"
        >
          ◎ Add landmark
        </button>
        <button
          className={tool === 'line' ? 'active' : ''}
          onClick={() => setTool('line')}
          title="Drag on the figure to draw a line or divider"
        >
          ╱ Line
        </button>
        <button
          className={tool === 'rect' ? 'active' : ''}
          onClick={() => setTool('rect')}
          title="Drag on the figure to draw a rectangle"
        >
          □ Rectangle
        </button>
        <button
          className={tool === 'area' ? 'active' : ''}
          onClick={() => setTool('area')}
          title="Draw a selectable area (a region a form can select) over an image"
        >
          ⬚ Area
        </button>
        {tool === 'area' && (
          <span className="area-modes" role="group" aria-label="Area shape">
            {([
              ['rect', '▭', 'Rectangle: drag on an image'],
              ['ellipse', '◯', 'Ellipse: drag on an image'],
              ['polygon', '⬠', 'Polygon: click each corner; double-click or Enter to finish'],
            ] as [AreaMode, string, string][]).map(([mode, icon, title]) => (
              <button
                key={mode}
                className={areaMode === mode ? 'active' : ''}
                aria-pressed={areaMode === mode}
                aria-label={`${mode[0].toUpperCase()}${mode.slice(1)} area`}
                title={title}
                onClick={() => setAreaMode(mode)}
              >
                {icon}
              </button>
            ))}
          </span>
        )}
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
              const value = e.target.value
              e.target.value = ''
              if (!value) return
              if (doc && doc.callouts.length > 0 && !window.confirm('Replace the open drawing? Save the project first to keep it.')) return
              if (value.startsWith('template:')) void loadTemplate(value.slice('template:'.length))
              else void loadSampleKey(value, value === 'divider')
            }}
          >
            <option value="">Load sample…</option>
            <optgroup label="Single drawings">
              {SAMPLES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Multi-image templates">
              {TEMPLATES.map((t) => (
                <option key={t.key} value={`template:${t.key}`}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button onClick={() => setShowNew(true)} title="Start a new diagram from a file, pasted SVG, or a URL">
          New…
        </button>
        <button onClick={() => projInput.current?.click()} title="Open a .drawer.json project or a .scene.json multi-image scene">
          Open project
        </button>
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

        <div className="menu">
          <button
            className="menu-trigger"
            disabled={!doc}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((o) => !o)}
          >
            {busy ? 'Rendering…' : 'Export ▾'}
          </button>
          {exportOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setExportOpen(false)} />
              <div className="menu-pop" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    doExportSvg()
                    setExportOpen(false)
                  }}
                >
                  SVG <span className="menu-note">standalone + metadata</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    doExportSvgJson()
                    setExportOpen(false)
                  }}
                >
                  SVG + JSON <span className="menu-note">callouts sidecar</span>
                </button>
                <button
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    doExportPng()
                    setExportOpen(false)
                  }}
                >
                  PNG <span className="menu-note">2× raster</span>
                </button>
                <div className="menu-sep" />
                <button
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    doExportPdf()
                    setExportOpen(false)
                  }}
                >
                  PDF <span className="menu-note">vector, this view</span>
                </button>
                {doc && (doc.sites?.length ?? 0) > 0 && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      downloadText(`${doc.name || 'diagram'}-sites.csv`, sitesCsv(doc), 'text/csv;charset=utf-8')
                      setExportOpen(false)
                    }}
                  >
                    Sites CSV <span className="menu-note">markers per site, no values</span>
                  </button>
                )}
                {doc && doc.views.length > 1 && (
                  <button
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      doExportPdfAll()
                      setExportOpen(false)
                    }}
                  >
                    PDF · all views <span className="menu-note">one page per view</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

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

      {showNew && <NewDialog onClose={() => setShowNew(false)} />}
    </header>
  )
}
