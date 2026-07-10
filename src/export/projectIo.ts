import { sanitizeMarkup } from '../svgParse'
import type { DrawerDoc } from '../types'

const FORMAT = 'drawer-project'
const VERSION = 1

interface ProjectFile {
  format: typeof FORMAT
  version: number
  doc: DrawerDoc
}

/** Serialize the editable project (body + anchors + callouts + views). */
export function serializeProject(doc: DrawerDoc): string {
  const file: ProjectFile = { format: FORMAT, version: VERSION, doc }
  return JSON.stringify(file, null, 2)
}

/** Parse a project file back into a document. Throws on malformed input. */
export function parseProject(text: string): DrawerDoc {
  const parsed = JSON.parse(text) as Partial<ProjectFile>
  if (parsed.format !== FORMAT || !parsed.doc) {
    throw new Error('Not a valid Drawer project file.')
  }
  const doc = parsed.doc
  if (
    !doc.base ||
    typeof doc.base.inner !== 'string' ||
    !Array.isArray(doc.anchors) ||
    !Array.isArray(doc.callouts) ||
    !Array.isArray(doc.views) ||
    doc.views.length < 1
  ) {
    throw new Error('Project file is missing or has invalid required fields.')
  }
  // body markup from a project file is also injected via innerHTML — sanitize it
  doc.base.inner = sanitizeMarkup(doc.base.inner)
  if (!doc.base.targetBoxes) doc.base.targetBoxes = {}
  // landmarks were added later; default for older project files
  if (!Array.isArray(doc.landmarks)) doc.landmarks = []
  // standalone text was added later; default for older project files
  if (!Array.isArray(doc.textAnnotations)) doc.textAnnotations = []
  if (!doc.activeViewId || !doc.views.some((v) => v.id === doc.activeViewId)) {
    doc.activeViewId = doc.views[0].id
  }
  return doc
}

/** Trigger a browser download of arbitrary text content. */
export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
