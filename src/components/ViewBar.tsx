import { useStore } from '../store'
import type { LabelMode } from '../types'

const MODES: { value: LabelMode; label: string }[] = [
  { value: 'names', label: 'Names' },
  { value: 'numbers', label: 'Numbered' },
  { value: 'blank', label: 'Blank quiz' },
]

export function ViewBar() {
  const doc = useStore((s) => s.doc)
  const setActiveView = useStore((s) => s.setActiveView)
  const addView = useStore((s) => s.addView)
  const updateViewMeta = useStore((s) => s.updateViewMeta)
  const setViewStyle = useStore((s) => s.setViewStyle)
  const deleteView = useStore((s) => s.deleteView)
  const record = useStore((s) => s.record)
  const presets = useStore((s) => s.presets)

  if (!doc) return null
  const active = doc.views.find((v) => v.id === doc.activeViewId) ?? doc.views[0]
  // which preset (if any) matches this view's imposed style format
  const activeFormatId = active.style
    ? presets.find((p) => JSON.stringify(p.style) === JSON.stringify(active.style))?.id ?? '__custom'
    : ''

  return (
    <section className="panel views-panel">
      <div className="panel-title">Views (label sets)</div>

      <div className="view-tabs">
        {doc.views.map((v) => (
          <button
            key={v.id}
            className={`view-tab ${v.id === doc.activeViewId ? 'active' : ''}`}
            onClick={() => setActiveView(v.id)}
          >
            {v.name}
            <span className="view-mode-chip">{v.labelMode}</span>
          </button>
        ))}
      </div>

      <div className="view-controls">
        <label className="field">
          Name
          <input
            type="text"
            value={active.name}
            onFocus={record}
            onChange={(e) => updateViewMeta(active.id, { name: e.target.value })}
          />
        </label>
        <label className="field">
          Mode
          <select
            value={active.labelMode}
            onChange={(e) => {
              record()
              updateViewMeta(active.id, { labelMode: e.target.value as LabelMode })
            }}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Format
          <select
            value={activeFormatId}
            onChange={(e) => {
              const v = e.target.value
              if (v === '') return setViewStyle(active.id, null)
              const preset = presets.find((p) => p.id === v)
              if (preset) setViewStyle(active.id, preset.style)
            }}
            title="Render every marker in this view using one style format"
          >
            <option value="">Per-callout (own style)</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {activeFormatId === '__custom' && <option value="__custom">Custom</option>}
          </select>
        </label>
        <button
          className="danger"
          disabled={doc.views.length <= 1}
          onClick={() => deleteView(active.id)}
        >
          Delete view
        </button>
      </div>

      <div className="view-add">
        <button onClick={() => addView('Numbered', 'numbers', true)}>+ Numbered view</button>
        <button onClick={() => addView('Blank quiz', 'blank', true)}>+ Blank quiz</button>
        <button
          onClick={() => addView('Translation', 'names', true)}
          title="A names view that starts from the current labels — override each per-callout in the inspector"
        >
          + Translation
        </button>
        <button onClick={() => addView(`${active.name} copy`, active.labelMode, true)}>
          Duplicate
        </button>
      </div>
    </section>
  )
}
