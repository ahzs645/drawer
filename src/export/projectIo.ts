import { sanitizeSurface } from '../areaModel'
import { sanitizeMarkup, measureGeometry } from '../svgParse'
import { validateDiagramExtensions } from '../diagramMappings'
import { normalizeDoc } from '../docModel'
import { isSceneFile, sceneToDoc } from '../sceneImport'
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

const MAX_PROJECT_CHARS = 32_000_000

/**
 * Parse a project file back into a document. Throws on malformed input.
 * Also accepts `drawer-scene` files (multi-image scenes from the former
 * standalone composer), converted into a regular document.
 */
export function parseProject(text: string): DrawerDoc {
  if (text.length > MAX_PROJECT_CHARS) throw new Error('Project file is too large.')
  const parsed = JSON.parse(text) as Partial<ProjectFile>
  if (isSceneFile(parsed)) {
    const scene = sanitizeSurface(sceneToDoc(parsed))
    validateDiagramExtensions(scene)
    return scene
  }
  if (parsed.format !== FORMAT || !parsed.doc) {
    throw new Error('Not a valid Drawer project file.')
  }
  if (parsed.version !== VERSION) throw new Error('Unsupported Drawer project version.')
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
  if (!Array.isArray(doc.drawingElements)) doc.drawingElements = []
  if (!Array.isArray(doc.landmarkGroupOrder)) {
    doc.landmarkGroupOrder = Array.from(
      new Set(doc.landmarks.map((l) => l.group || 'Other')),
    )
  }
  if (!Array.isArray(doc.hiddenLandmarkGroups)) doc.hiddenLandmarkGroups = []
  if (!doc.activeViewId || !doc.views.some((v) => v.id === doc.activeViewId)) {
    doc.activeViewId = doc.views[0].id
  }
  if (doc.images !== undefined && !Array.isArray(doc.images)) throw new Error('Project images must be a list.')
  for (const image of doc.images ?? []) {
    if (!image?.drawing || typeof image.drawing.inner !== 'string') throw new Error('Project image is missing its drawing.')
    image.drawing.inner = sanitizeMarkup(image.drawing.inner)
    if (!image.drawing.targetBoxes) image.drawing.targetBoxes = {}
  }
  // older single-drawing files: the drawing becomes images[0], positions unchanged
  // areas and groups: malformed entries and dangling references are dropped, not fatal
  const normalized = sanitizeSurface(normalizeDoc(doc))
  validateDiagramExtensions(normalized)
  // Geometry is derived from sanitized artwork, not trusted from imported JSON.
  // Re-measure named targets, but preserve contentBox for legacy normalized anchors.
  if (typeof document !== 'undefined') {
    for (const image of normalized.images) {
      image.drawing.targetBoxes = measureGeometry(image.drawing.inner, image.drawing.viewBox).targetBoxes
    }
    if (normalized.base.inner.trim()) {
      normalized.base.targetBoxes = measureGeometry(normalized.base.inner, normalized.base.viewBox).targetBoxes
    }
  }
  return normalized
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
