import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { TextAnnotationAlign, TextAnnotationStyle } from '../types'
import { CollapsiblePanel } from './CollapsiblePanel'

export function TextInspector() {
  const doc = useStore((s) => s.doc)
  const selectedTextId = useStore((s) => s.selectedTextId)
  const updateText = useStore((s) => s.updateText)
  const deleteText = useStore((s) => s.deleteText)
  const record = useStore((s) => s.record)
  const textFocusRequest = useStore((s) => s.textFocusRequest)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (textFocusRequest > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [textFocusRequest])

  if (!doc) return null
  const item = doc.textAnnotations.find((t) => t.id === selectedTextId)
  if (!item) return null

  return (
    <CollapsiblePanel title="Text" className="text-inspector">
      <p className="hint">
        Drag this text directly on the figure. Use a section heading for labels such as
        “Anterior” and “Posterior”; its horizontal rule exports with the text.
      </p>

      <label className="field">
        Text
        <input
          ref={inputRef}
          type="text"
          value={item.text}
          onFocus={record}
          onChange={(e) => updateText(item.id, { text: e.target.value })}
        />
      </label>

      <div className="row">
        <label className="field">
          Style
          <select
            value={item.style}
            onChange={(e) => {
              record()
              updateText(item.id, { style: e.target.value as TextAnnotationStyle })
            }}
          >
            <option value="plain">Plain text</option>
            <option value="heading">Section heading + rule</option>
          </select>
        </label>
        <label className="field">
          Alignment
          <select
            value={item.align}
            onChange={(e) => {
              record()
              updateText(item.id, { align: e.target.value as TextAnnotationAlign })
            }}
          >
            <option value="start">Left</option>
            <option value="middle">Center</option>
            <option value="end">Right</option>
          </select>
        </label>
      </div>

      <div className="row">
        <label className="field">
          Font size
          <input
            type="number"
            min="6"
            step="1"
            value={item.fontSize}
            onFocus={record}
            onChange={(e) =>
              updateText(item.id, { fontSize: Math.max(6, Number(e.target.value) || 6) })
            }
          />
        </label>
        <label className="field">
          Weight
          <select
            value={String(item.fontWeight)}
            onChange={(e) => {
              record()
              updateText(item.id, { fontWeight: Number(e.target.value) as 400 | 600 | 700 })
            }}
          >
            <option value="400">Regular</option>
            <option value="600">Semibold</option>
            <option value="700">Bold</option>
          </select>
        </label>
      </div>

      {item.style === 'heading' && (
        <label className="field">
          Rule width
          <input
            type="number"
            min="20"
            step="5"
            value={item.ruleWidth}
            onFocus={record}
            onChange={(e) =>
              updateText(item.id, { ruleWidth: Math.max(20, Number(e.target.value) || 20) })
            }
          />
        </label>
      )}

      <label className="field">
        Color
        <input
          type="color"
          value={item.color}
          onFocus={record}
          onChange={(e) => updateText(item.id, { color: e.target.value })}
        />
      </label>

      <button className="danger block" onClick={() => deleteText(item.id)}>
        Delete text
      </button>
    </CollapsiblePanel>
  )
}
