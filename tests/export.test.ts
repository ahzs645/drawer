import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { sceneToDoc } from '../src/sceneImport.ts'
import { exportSvg } from '../src/export/exportSvg.ts'
import type { BaseDrawing } from '../src/types.ts'

// Scene artwork parsed without a DOM: the frame is the content box, which is
// how points placed by fractions of the asset frame resolve anyway.
const parseWithoutDom = (inner: string, w: number, h: number): BaseDrawing => {
  const viewBox = { x: 0, y: 0, w, h }
  return { inner, viewBox, contentBox: { ...viewBox }, targetBoxes: {} }
}
const scene = (name: string) => sceneToDoc(JSON.parse(readFileSync(new URL(`../public/samples/diorama/${name}`, import.meta.url), 'utf8')), parseWithoutDom)
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// Golden hashes of Drawer's static export. A form-state option must never
// change what Drawer itself exports when it is not used.
const GOLDEN: Record<string, string> = {
  'skin-assessment-library.scene.json|site-numbers': '3a8e9cf40c156e48',
  'skin-assessment-library.scene.json|site-names': '827f112f8cdea28c',
  'skin-assessment-library.scene.json|field-values': '7f4cc55e8551307e',
  'skin-assessment-library.scene.json|blank-markers': '80a86e64db907374',
  'skin-assessment.scene.json|site-numbers': '93387a9f479821d4',
  'skin-assessment.scene.json|site-names': '43148c86fcdf18cc',
  'skin-assessment.scene.json|field-values': '7f934174f94d0178',
  'skin-assessment.scene.json|blank-markers': '7cdd949c458c98c8',
}

test('exportSvg output is stable for every view of the skin-assessment templates', () => {
  for (const file of ['skin-assessment-library.scene.json', 'skin-assessment.scene.json']) {
    const doc = scene(file)
    for (const view of doc.views) {
      const key = `${file}|${view.id}`
      const out = hash(exportSvg(doc, { viewId: view.id }))
      if (process.env.DRAWER_PRINT_GOLDEN) console.log(JSON.stringify(key), JSON.stringify(out))
      else assert.equal(out, GOLDEN[key], key)
    }
  }
})
