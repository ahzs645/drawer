// Pure-model tests for areas and counter groups (the editor side of the
// selection surface). Run with `pnpm test` (Node 22+, no browser needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addArea,
  addGroup,
  addPartAreas,
  closePolygon,
  deleteArea,
  deleteGroup,
  ellipseFromCorners,
  groupsContaining,
  namedParts,
  rectFromCorners,
  sanitizeSurface,
  setGroupMember,
  updateArea,
  updateGroup,
} from '../src/areaModel.ts'
import { missingTargets } from '../src/diagramMappings.ts'
import { addSite, deleteImage, deleteSite, duplicateImage, setImagePlacement } from '../src/docModel.ts'
import { serializeProject } from '../src/export/projectIo.ts'
import { imageToPage } from '../src/geometry.ts'
import { areaCenter, areasAtPoint, groupSelection } from '../src/surface.ts'
import type { Area, BaseDrawing, DrawerDoc } from '../src/types.ts'

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

function drawing(): BaseDrawing {
  const viewBox = { x: 0, y: 0, w: 200, h: 400 }
  return {
    inner: '<path id="heart" d="M0 0"/><path data-drawer-el="el1" d="M1 1"/><path id="lung_left" d="M2 2"/>',
    viewBox,
    contentBox: { ...viewBox },
    targetBoxes: { heart: { x: 80, y: 100, w: 40, h: 40 }, el1: { x: 0, y: 0, w: 10, h: 10 }, lung_left: { x: 20, y: 80, w: 50, h: 90 } },
  }
}

function baseDoc(): DrawerDoc {
  const d = drawing()
  return {
    id: 'doc',
    name: 'Areas',
    base: { inner: '', viewBox: { x: 0, y: 0, w: 1000, h: 800 }, contentBox: { x: 0, y: 0, w: 1000, h: 800 }, targetBoxes: {} },
    images: [{ id: 'body', name: 'Body', drawing: d, x: 100, y: 50, width: 200, height: 400, rotation: 0 }],
    anchors: [],
    callouts: [],
    views: [{ id: 'v', name: 'Names', labelMode: 'names', overrides: {} }],
    activeViewId: 'v',
    landmarks: [],
    textAnnotations: [],
    drawingElements: [],
    landmarkGroupOrder: [],
    hiddenLandmarkGroups: [],
  }
}

test('named parts skip auto-assigned element handles', () => {
  assert.deepEqual(namedParts(baseDoc().images[0]), ['heart', 'lung_left'])
})

test('drag corners make positive rects and ellipses; polygons close cleanly', () => {
  assert.deepEqual(rectFromCorners({ x: 50, y: 40 }, { x: 10, y: 60 }), { kind: 'rect', x: 10, y: 40, w: 40, h: 20 })
  assert.deepEqual(ellipseFromCorners({ x: 0, y: 0 }, { x: 20, y: -10 }), { kind: 'ellipse', cx: 10, cy: -5, rx: 10, ry: 5 })
  // a double-click lands twice: the repeat is dropped
  const closed = closePolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 10.2, y: 10.1 }], 1)
  assert.deepEqual(closed, { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] })
  // clicking back on the first point closes without repeating it
  assert.equal((closePolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0.3, y: 0.2 }], 1) as { points: unknown[] }).points.length, 3)
  assert.equal(closePolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0.5 }], 1), null)
})

test('add, update and delete areas with unique ids', () => {
  let doc = baseDoc()
  const a = addArea(doc, { imageId: 'body', shape: { kind: 'rect', x: 10, y: 10, w: 50, h: 30 } })
  doc = a.doc
  const b = addArea(doc, { imageId: 'body', shape: { kind: 'ellipse', cx: 100, cy: 300, rx: 20, ry: 10 }, label: '  Knee  ', fieldKey: ' joint.knee ' })
  doc = b.doc
  assert.notEqual(a.areaId, b.areaId)
  assert.equal(doc.areas![0].label, 'Area 1')
  assert.equal(doc.areas![1].label, 'Knee')
  assert.equal(doc.areas![1].fieldKey, 'joint.knee')
  assert.throws(() => addArea(doc, { shape: { kind: 'rect', x: 0, y: 0, w: 0, h: 5 } }), /positive size/)
  assert.throws(() => addArea(doc, { imageId: 'nope', shape: { kind: 'rect', x: 0, y: 0, w: 5, h: 5 } }), /Image not found/)
  assert.throws(() => addArea(doc, { shape: { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }))

  doc = updateArea(doc, b.areaId, { label: 'Left knee', fieldKey: '' })
  assert.equal(doc.areas![1].label, 'Left knee')
  assert.equal('fieldKey' in doc.areas![1], false)
  assert.throws(() => updateArea(doc, b.areaId, { fieldKey: '__proto__' }), /valid field key/)

  const g = addGroup(doc, 'Joints')
  doc = setGroupMember(g.doc, g.groupId, 'area', b.areaId, true)
  doc = setGroupMember(doc, g.groupId, 'area', a.areaId, true)
  // members follow document order, not click order
  assert.deepEqual(doc.groups![0].areaIds, [a.areaId, b.areaId])
  doc = deleteArea(doc, b.areaId)
  assert.deepEqual(doc.areas!.map((x) => x.id), [a.areaId])
  assert.deepEqual(doc.groups![0].areaIds, [a.areaId])
})

test('named parts become part areas once each', () => {
  let doc = baseDoc()
  const first = addPartAreas(doc, 'body', ['heart', 'lung_left', 'el1_missing'])
  doc = first.doc
  assert.equal(first.areaIds.length, 2)
  assert.deepEqual(doc.areas!.map((a) => [a.label, a.shape]), [
    ['Heart', { kind: 'part', targetId: 'heart' }],
    ['Lung left', { kind: 'part', targetId: 'lung_left' }],
  ])
  // asking again adds nothing
  assert.equal(addPartAreas(doc, 'body', ['heart']).areaIds.length, 0)
  // a part area is hit-tested on its measured box and centred on it
  const heart = doc.areas![0]
  const c = areaCenter(doc, heart)
  near(c.x, 100 + 100)
  near(c.y, 50 + 120)
  assert.deepEqual(areasAtPoint(doc, c).map((a) => a.id), [heart.id])
  // replacing the artwork must not silently lose a part an area names
  assert.deepEqual(missingTargets(doc, 'body', { ...drawing(), targetBoxes: { heart: { x: 0, y: 0, w: 1, h: 1 } } }), ['lung_left'])
})

test('groups: add, rename, count toggle, membership, delete', () => {
  let doc = baseDoc()
  doc = addPartAreas(doc, 'body', ['heart', 'lung_left']).doc
  const site = addSite(doc, 'Sacrum')
  doc = site.doc
  const g = addGroup(doc, 'Organs')
  doc = g.doc
  assert.throws(() => addGroup(doc, '  '), /label/)
  doc = updateGroup(doc, g.groupId, { label: 'Chest', showCount: false })
  assert.equal(doc.groups![0].label, 'Chest')
  assert.equal(doc.groups![0].showCount, false)
  const [heart, lung] = doc.areas!
  doc = setGroupMember(doc, g.groupId, 'area', heart.id, true)
  doc = setGroupMember(doc, g.groupId, 'area', heart.id, true) // idempotent
  doc = setGroupMember(doc, g.groupId, 'site', site.siteId, true)
  assert.throws(() => setGroupMember(doc, g.groupId, 'site', 'missing', true), /Site not found/)
  assert.deepEqual(doc.groups![0].areaIds, [heart.id])
  assert.deepEqual(groupsContaining(doc, 'site', site.siteId).map((x) => x.id), [g.groupId])
  assert.deepEqual(groupSelection(doc, [heart.id, lung.id], [site.siteId]).countsByGroup, { [g.groupId]: 2 })
  doc = setGroupMember(doc, g.groupId, 'area', heart.id, false)
  assert.deepEqual(doc.groups![0].areaIds, [])
  // deleting a site removes it from groups
  doc = deleteSite(doc, site.siteId)
  assert.deepEqual(doc.groups![0].siteIds, [])
  doc = deleteGroup(doc, g.groupId)
  assert.deepEqual(doc.groups, [])
})

test('areas follow image moves, and image delete / duplicate cascade to them', () => {
  let doc = baseDoc()
  doc = addArea(doc, { imageId: 'body', shape: { kind: 'rect', x: 0, y: 0, w: 100, h: 100 }, fieldKey: 'zone.a' }).doc
  doc = addPartAreas(doc, 'body', ['heart']).doc
  doc = addArea(doc, { shape: { kind: 'rect', x: 900, y: 700, w: 10, h: 10 }, label: 'Page box' }).doc
  const [zone, heart, pageBox] = doc.areas!
  const g = addGroup(doc, 'All')
  doc = setGroupMember(g.doc, g.groupId, 'area', zone.id, true)
  doc = setGroupMember(doc, g.groupId, 'area', heart.id, true)
  doc = setGroupMember(doc, g.groupId, 'area', pageBox.id, true)

  // stored in drawing space: a rotation moves the area on the page without touching it
  const before = areaCenter(doc, zone)
  const rotated = setImagePlacement(doc, 'body', { rotation: 90, x: 300 })
  assert.deepEqual(rotated.areas, doc.areas)
  const after = areaCenter(rotated, zone)
  const expected = imageToPage(rotated.images[0], { x: 50, y: 50 })
  near(after.x, expected.x)
  near(after.y, expected.y)
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 10)

  const dup = duplicateImage(doc, 'body', true)
  const copies = dup.doc.areas!.filter((a) => a.imageId === dup.imageId)
  assert.equal(copies.length, 2)
  assert.ok(copies.every((c) => !doc.areas!.some((a) => a.id === c.id)))
  assert.deepEqual(copies.map((c) => c.shape), [zone.shape, heart.shape])
  assert.equal(copies[0].fieldKey, undefined)
  assert.deepEqual(dup.doc.groups![0].areaIds, [zone.id, heart.id, pageBox.id])

  const gone = deleteImage(dup.doc, 'body')
  assert.deepEqual(gone.areas!.map((a) => a.id), [pageBox.id, ...copies.map((c) => c.id)])
  assert.deepEqual(gone.groups![0].areaIds, [pageBox.id])
})

test('loading drops malformed areas and dangling group references', () => {
  let doc = baseDoc()
  doc = addSite(doc, 'Sacrum').doc
  const siteId = doc.sites![0].id
  const good: Area = { id: 'a1', label: 'Zone', imageId: 'body', shape: { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }, fieldKey: 'zone' }
  const raw = {
    ...doc,
    areas: [
      good,
      { ...good }, // duplicate id
      { id: 'a2', label: 'Lost', imageId: 'gone', shape: { kind: 'rect', x: 0, y: 0, w: 1, h: 1 } },
      { id: 'a3', label: 'Empty part', imageId: 'body', shape: { kind: 'part', targetId: '' } },
      { id: 'a4', label: 'Flat', shape: { kind: 'ellipse', cx: 0, cy: 0, rx: 0, ry: 2 } },
      { id: 'a5', label: 7, shape: { kind: 'part', targetId: 'heart' }, imageId: 'body', fieldKey: '__proto__' },
      'junk',
    ],
    groups: [
      { id: 'g1', label: 'Count', areaIds: ['a1', 'a2', 'a1', 'a5'], siteIds: [siteId, 'nope'], showCount: false },
      { id: 'g1', label: 'Duplicate', areaIds: [], siteIds: [] },
      { id: 'g2', label: 'Loose', areaIds: 'a1' },
    ],
  } as unknown as DrawerDoc
  const clean = sanitizeSurface(raw)
  assert.deepEqual(clean.areas!.map((a) => a.id), ['a1', 'a5'])
  assert.equal(clean.areas![1].label, 'a5')
  assert.equal(clean.areas![1].fieldKey, undefined)
  assert.deepEqual(clean.groups, [
    { id: 'g1', label: 'Count', areaIds: ['a1', 'a5'], siteIds: [siteId], showCount: false },
    { id: 'g2', label: 'Loose', areaIds: [], siteIds: [] },
  ])
  // a non-list is dropped instead of failing the whole project
  const odd = sanitizeSurface({ ...doc, areas: 'x', groups: 3 } as unknown as DrawerDoc)
  assert.equal('areas' in odd, false)
  assert.equal('groups' in odd, false)
  // a clean document survives save -> reopen unchanged
  const saved = JSON.parse(serializeProject(clean)).doc as DrawerDoc
  assert.deepEqual(sanitizeSurface(saved).areas, clean.areas)
  assert.deepEqual(sanitizeSurface(saved).groups, clean.groups)
})
