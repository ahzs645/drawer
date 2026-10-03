import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sceneToDoc } from '../src/sceneImport.ts'
import { exportSvg, renderSvg } from '../src/export/exportSvg.ts'
import { areaCenter, areasAtPoint, groupSelection, pointInArea, tagPartElements } from '../src/surface.ts'
import { imageToPage } from '../src/geometry.ts'
import type { Area, BaseDrawing, DrawerDoc } from '../src/types.ts'

const parseWithoutDom = (inner: string, w: number, h: number): BaseDrawing => {
  const viewBox = { x: 0, y: 0, w, h }
  return { inner, viewBox, contentBox: { ...viewBox }, targetBoxes: {} }
}
const skin = (): DrawerDoc =>
  sceneToDoc(JSON.parse(readFileSync(new URL('../public/samples/diorama/skin-assessment-library.scene.json', import.meta.url), 'utf8')), parseWithoutDom)

function withAreas(doc: DrawerDoc): DrawerDoc {
  const standing = doc.images.find((i) => i.id === 'standing')!
  const vb = standing.drawing.viewBox
  standing.drawing.inner += '<path id="left_hand" d="M10 10 L20 10 L20 20 Z"/>'
  standing.drawing.targetBoxes = { left_hand: { x: 10, y: 10, w: 10, h: 10 } }
  const areas: Area[] = [
    { id: 'torso', label: 'Torso', imageId: 'standing', shape: { kind: 'rect', x: vb.w * 0.3, y: vb.h * 0.2, w: vb.w * 0.4, h: vb.h * 0.3 } },
    { id: 'sacrum_zone', label: 'Sacrum zone', imageId: 'standing', shape: { kind: 'ellipse', cx: vb.w * 0.5, cy: vb.h * 0.48, rx: vb.w * 0.06, ry: vb.h * 0.03 } },
    { id: 'head', label: 'Head', imageId: 'standing', shape: { kind: 'polygon', points: [{ x: vb.w * 0.4, y: 0 }, { x: vb.w * 0.6, y: 0 }, { x: vb.w * 0.5, y: vb.h * 0.15 }] } },
    { id: 'left_hand', label: 'Left hand', imageId: 'standing', shape: { kind: 'part', targetId: 'left_hand' } },
  ]
  return { ...doc, areas, groups: [{ id: 'trunk', label: 'Trunk', areaIds: ['torso', 'sacrum_zone'], siteIds: ['site-06'] }] }
}

test('areas hit-test through their image placement, smallest first', () => {
  const doc = withAreas(skin())
  const standing = doc.images.find((i) => i.id === 'standing')!
  const vb = standing.drawing.viewBox
  const sacrum = imageToPage(standing, { x: vb.w * 0.5, y: vb.h * 0.48 })
  assert.deepEqual(areasAtPoint(doc, sacrum).map((a) => a.id), ['sacrum_zone', 'torso'])
  assert.equal(pointInArea(doc, doc.areas![2], imageToPage(standing, { x: vb.w * 0.5, y: vb.h * 0.05 })), true)
  assert.equal(pointInArea(doc, doc.areas![3], imageToPage(standing, { x: 15, y: 15 })), true)
  // a rotated, mirrored image carries its areas with it
  standing.rotation = 30
  standing.flipX = true
  const moved = imageToPage(standing, { x: vb.w * 0.5, y: vb.h * 0.48 })
  assert.deepEqual(areasAtPoint(doc, moved).map((a) => a.id), ['sacrum_zone', 'torso'])
  const c = areaCenter(doc, doc.areas![1])
  assert.ok(Math.abs(c.x - moved.x) < 1e-6 && Math.abs(c.y - moved.y) < 1e-6)
})

test('groups count areas and sites together', () => {
  const doc = withAreas(skin())
  assert.deepEqual(groupSelection(doc, ['torso', 'head'], ['site-06', 'site-09']), {
    countsByGroup: { trunk: 2 },
    labelsByGroup: { trunk: ['Torso', 'Sacrum'] },
  })
})

test('named parts are tagged in place for styling and hit-testing', () => {
  const tagged = tagPartElements('<g id="arm"><path id="left_hand" d="M0 0"/><path d="M1 1"/></g>', { left_hand: 'data-area-id="lh"' })
  assert.equal(tagged, '<g id="arm"><path id="left_hand" d="M0 0" data-area-id="lh"/><path d="M1 1"/></g>')
})

test('export draws areas, selection state and marks; plain export is unchanged by areas state', () => {
  const doc = withAreas(skin())
  const plain = exportSvg(doc)
  assert.match(plain, /class="drawer-area" data-area-id="torso"/)
  assert.doesNotMatch(plain, /data-area-id="left_hand"/)
  const standing = doc.images.find((i) => i.id === 'standing')!
  const { svg } = renderSvg(doc, {
    rootId: 'r1',
    state: {
      selectedAreaIds: ['torso', 'left_hand'],
      selectedSiteIds: ['site-06'],
      interactive: { sites: true, areas: true },
      marks: [{ id: 'm1', kind: 'symbol', symbol: 'x', imageId: 'standing', points: [{ x: 50, y: 50 }], color: '#ef4444', size: 20, areaId: 'torso' }],
    },
  })
  assert.match(svg, /data-area-id="torso" data-selected="true" role="button" tabindex="0"/)
  assert.match(svg, /<path id="left_hand" d="M10 10 L20 10 L20 20 Z" data-area-id="left_hand" data-selected="true" role="button"/)
  assert.match(svg, /<style><!\[CDATA\[#r1 \[data-area-id="left_hand"\]/)
  assert.match(svg, /class="drawer-mark" data-mark-id="m1" data-area-id="torso"/)
  assert.equal((svg.match(/class="callout site-marker"[^>]*data-site-id="site-06"[^>]*data-selected="true"/g) ?? []).length, 2)
  assert.ok(standing)
})
