// Pure-model tests for multi-image pages and the shared site table.
// Run with `pnpm test` (Node 22+, no browser needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  addImage,
  addSite,
  addSitePlacement,
  coverageWarnings,
  deleteImage,
  deleteSite,
  duplicateImage,
  linkCalloutToSite,
  normalizeDoc,
  pageDrawing,
  reattachAnchor,
  reorderImage,
  setImagePlacement,
  sitePlacements,
  sitesCsv,
  updateSite,
} from '../src/docModel.ts'
import { anchorPagePoint, imageAtPoint, imageToPage, landmarkPoint, pageToImage } from '../src/geometry.ts'
import { buildLegend, resolveCallouts } from '../src/resolve.ts'
import { sceneToDoc } from '../src/sceneImport.ts'
import type { BaseDrawing, DrawerDoc, ImageInstance } from '../src/types.ts'

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)
const nearPoint = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) => {
  near(a.x, b.x, eps)
  near(a.y, b.y, eps)
}

function drawing(w: number, h: number, x = 0, y = 0): BaseDrawing {
  return {
    inner: '<path d="M0 0"/>',
    viewBox: { x, y, w, h },
    // a content box smaller than the frame, so normalization is exercised
    contentBox: { x: x + w * 0.1, y: y + h * 0.05, w: w * 0.8, h: h * 0.9 },
    targetBoxes: { part: { x: x + 10, y: y + 20, w: 30, h: 40 } },
  }
}

/** A legacy single-drawing document: artwork in base, anchors without imageId. */
function legacyDoc(): DrawerDoc {
  const base = drawing(400, 600, -20, 15)
  return {
    id: 'doc',
    name: 'Legacy',
    base,
    images: undefined as unknown as ImageInstance[],
    anchors: [
      { id: 'a1', mode: 'relative-bbox', relative: { targetId: null, nx: 0.25, ny: 0.75 } },
      { id: 'a2', mode: 'relative-bbox', relative: { targetId: 'part', nx: 0.5, ny: 0.5 } },
      { id: 'a3', mode: 'absolute', absolute: { x: 100, y: 120 } },
    ],
    callouts: ['a1', 'a2', 'a3'].map((a, i) => ({
      id: `c${i + 1}`, anchorId: a, labelText: `Point ${i + 1}`, balloonShape: 'none' as const, balloonText: String(i + 1),
      leaderStyle: 'straight' as const, labelPos: { x: 500, y: 100 + i * 50 }, elbow: null, color: '#111111',
    })),
    views: [{ id: 'v', name: 'Names', labelMode: 'names', overrides: {} }],
    activeViewId: 'v',
    landmarks: [{ id: 'l1', name: 'Knee', nx: 0.4, ny: 0.6, targetId: null }],
    textAnnotations: [],
    drawingElements: [],
    landmarkGroupOrder: [],
    hiddenLandmarkGroups: [],
  }
}

function pointsOf(doc: DrawerDoc) {
  return resolveCallouts(doc).map((r) => r.anchorPoint)
}

test('drawing <-> page transforms round-trip with offset, scale, rotation and mirror', () => {
  const image: ImageInstance = { id: 'i', name: 'I', drawing: drawing(200, 100, -50, 30), x: 300, y: -40, width: 90, height: 45, rotation: 37, flipX: true }
  for (const p of [{ x: -50, y: 30 }, { x: 150, y: 130 }, { x: 12.5, y: 77 }]) {
    nearPoint(pageToImage(image, imageToPage(image, p)), p)
  }
  // the drawing's center lands on the placed box's center
  nearPoint(imageToPage(image, { x: 50, y: 80 }), { x: 345, y: -17.5 })
})

test('legacy documents migrate to one image without moving anything', () => {
  const legacy = legacyDoc()
  const before = [
    { x: legacy.base.contentBox.x + 0.25 * legacy.base.contentBox.w, y: legacy.base.contentBox.y + 0.75 * legacy.base.contentBox.h },
    { x: -20 + 10 + 15, y: 15 + 20 + 20 },
    { x: 100, y: 120 },
  ]
  const doc = normalizeDoc(legacy)
  assert.equal(doc.images.length, 1)
  assert.equal(doc.base.inner, '')
  assert.deepEqual(doc.base.viewBox, legacy.base.viewBox)
  assert.ok(doc.anchors.every((a) => a.imageId === doc.images[0].id))
  assert.equal(doc.landmarks[0].imageId, doc.images[0].id)
  pointsOf(doc).forEach((p, i) => nearPoint(p, before[i]))
  nearPoint(landmarkPoint(doc, doc.landmarks[0]), { x: 20 + 0.4 * 320, y: 45 + 0.6 * 540 })
  // already-migrated documents are left alone
  assert.equal(normalizeDoc(doc).images, doc.images)
})

test('moving, resizing and rotating an image carries its points, labels, text and shapes', () => {
  let doc = normalizeDoc(legacyDoc())
  const id = doc.images[0].id
  doc = {
    ...doc,
    views: [{ ...doc.views[0], overrides: { c1: { labelPos: { x: 520, y: 90 } } } }],
    textAnnotations: [{ id: 't', text: 'A', pos: { x: 10, y: 20 }, style: 'plain', fontSize: 12, fontWeight: 400, align: 'start', color: '#000', ruleWidth: 0, imageId: id }],
    drawingElements: [{ id: 'd', kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, stroke: '#000', strokeWidth: 1, dashed: false, fill: null, imageId: id }],
  }
  const points = pointsOf(doc)
  const moved = setImagePlacement(doc, id, { x: doc.images[0].x + 100, y: doc.images[0].y - 7 })
  pointsOf(moved).forEach((p, i) => nearPoint(p, { x: points[i].x + 100, y: points[i].y - 7 }))
  nearPoint(moved.callouts[1].labelPos, { x: 600, y: 143 })
  nearPoint(moved.views[0].overrides.c1.labelPos!, { x: 620, y: 83 })
  nearPoint(moved.textAnnotations[0].pos, { x: 110, y: 13 })
  nearPoint(moved.drawingElements[0].end, { x: 110, y: -7 })

  // anchors are stored in drawing space, so they are untouched by placement edits
  const turned = setImagePlacement(doc, id, { rotation: 90, width: 800, height: 1200 })
  assert.deepEqual(turned.anchors, doc.anchors)
  const image = turned.images[0]
  doc.anchors.forEach((a, i) => {
    const local = pageToImage(doc.images[0], points[i])
    nearPoint(anchorPagePoint(turned, a), imageToPage(image, local))
  })
  assert.throws(() => setImagePlacement(doc, id, { width: 0 }), /positive/)
})

test('adding, duplicating, mirroring, reordering and deleting images', () => {
  let doc = normalizeDoc(legacyDoc())
  const first = doc.images[0].id
  const added = addImage(doc, drawing(100, 300), 'Second', [{ id: 'lx', name: 'Heel', nx: 0.5, ny: 0.9, group: 'Posterior' }])
  doc = added.doc
  assert.equal(doc.images.length, 2)
  // placed to the right of the existing artwork, at a matching height
  assert.ok(doc.images[1].x > doc.images[0].x + doc.images[0].width - 1)
  assert.equal(doc.landmarks.at(-1)!.imageId, added.imageId)
  assert.equal(doc.landmarks.at(-1)!.group, 'Second · Posterior')
  assert.ok(doc.landmarkGroupOrder.includes('Second · Posterior'))

  const site = addSite(doc, 'Sacrum')
  doc = addSitePlacement(site.doc, site.siteId, first, { x: 50, y: 300 }).doc
  const dup = duplicateImage(doc, first, true)
  const copy = dup.doc.images.find((i) => i.id === dup.imageId)!
  assert.equal(copy.flipX, true)
  assert.equal(dup.doc.images[1].id, dup.imageId, 'copy sits just above the original')
  assert.equal(dup.doc.callouts.length, doc.callouts.length + 4, 'every callout on the image is copied')
  assert.equal(sitePlacements(dup.doc, site.siteId).length, 2, 'site markers become extra placements of the same site')
  // mirrored copy: points land mirrored within the copy's frame
  const original = dup.doc.callouts.find((c) => c.id === 'c3')!
  const copied = dup.doc.callouts.find((c) => c.labelText === 'Point 3' && c.id !== 'c3')!
  const pa = anchorPagePoint(dup.doc, dup.doc.anchors.find((a) => a.id === original.anchorId)!)
  const pb = anchorPagePoint(dup.doc, dup.doc.anchors.find((a) => a.id === copied.anchorId)!)
  near(pb.y, pa.y)
  near(pb.x - copy.x, copy.width - (pa.x - doc.images[0].x))

  assert.deepEqual(reorderImage(dup.doc, first, 1).images.map((i) => i.id), [dup.imageId, first, added.imageId])
  assert.equal(reorderImage(dup.doc, first, -1), dup.doc)

  const removed = deleteImage(dup.doc, dup.imageId)
  assert.deepEqual(removed.callouts.map((c) => c.id), doc.callouts.map((c) => c.id))
  assert.equal(removed.anchors.length, doc.anchors.length)
  assert.equal(removed.landmarks.length, doc.landmarks.length)
  assert.equal(removed.sites!.length, 1, 'site rows survive image deletion')
})

test('site markers share number, label and key; views choose what they show', () => {
  let doc = normalizeDoc(legacyDoc())
  const image = doc.images[0].id
  const s1 = addSite(doc, 'Occiput')
  const s2 = addSite(s1.doc, 'Sacrum')
  doc = s2.doc
  doc = addSitePlacement(doc, s1.siteId, image, { x: 60, y: 80 }).doc
  doc = addSitePlacement(doc, s2.siteId, image, { x: 70, y: 300 }).doc
  doc = addSitePlacement(doc, s2.siteId, null, { x: 900, y: 300 }).doc // a page-level marker
  doc = { ...doc, mappingValues: { [doc.sites![1].fieldKey]: 'Stage 2' } }
  doc = updateSite(doc, s2.siteId, { number: 6, label: 'Sacrum / coccyx' })

  const sites = (view: DrawerDoc['views'][number]) => resolveCallouts({ ...doc, views: [view], activeViewId: view.id }).filter((r) => r.siteId)
  const base = doc.views[0]
  const numbers = sites({ ...base, labelMode: 'names' })
  assert.deepEqual(numbers.map((r) => [r.balloonText, r.labelText]), [['1', ''], ['6', ''], ['6', '']])
  // a badge marker sits on its point
  nearPoint(numbers[0].labelPos, numbers[0].anchorPoint)
  assert.deepEqual(sites({ ...base, siteDisplay: 'names' }).map((r) => r.labelText), ['Occiput', 'Sacrum / coccyx', 'Sacrum / coccyx'])
  assert.deepEqual(sites({ ...base, siteDisplay: 'values' }).map((r) => r.labelText), ['—', 'Stage 2', 'Stage 2'])
  assert.deepEqual(sites({ ...base, labelMode: 'blank' }).map((r) => r.balloonText), ['', '', ''])

  // other callouts number after the highest site number, and the generic legend skips sites
  const numbered = resolveCallouts({ ...doc, views: [{ ...base, labelMode: 'numbers' }] })
  assert.deepEqual(numbered.filter((r) => !r.siteId).map((r) => r.balloonText), ['7', '8', '9'])
  assert.deepEqual(buildLegend({ ...doc, views: [{ ...base, labelMode: 'numbers' }] }).map((l) => l.index), [7, 8, 9])

  // hidden images hide their markers and show up in the coverage check
  const hidden = { ...doc, images: [{ ...doc.images[0], visible: false }] }
  assert.deepEqual(resolveCallouts(hidden).filter((r) => r.siteId).map((r) => r.visible), [false, false, true])
  assert.deepEqual(coverageWarnings(hidden, hidden.views[0]), ['Site 1 (Occiput) has no visible marker in this view.'])
})

test('site edits keep numbers and keys unique and carry values to a renamed key', () => {
  const s1 = addSite(normalizeDoc(legacyDoc()), 'Heel')
  const s2 = addSite(s1.doc, 'Heel')
  let doc = s2.doc
  assert.deepEqual(doc.sites!.map((s) => s.fieldKey), ['site.heel', 'site.heel_2'])
  assert.throws(() => updateSite(doc, s2.siteId, { number: 1 }), /already used/)
  assert.throws(() => updateSite(doc, s2.siteId, { fieldKey: 'site.heel' }), /already used/)
  assert.throws(() => updateSite(doc, s2.siteId, { fieldKey: '__proto__' }), /valid field key/)
  assert.throws(() => updateSite(doc, s2.siteId, { number: 1.5 }), /whole numbers/)
  doc = { ...doc, mappingValues: { 'site.heel_2': 'intact' } }
  doc = updateSite(doc, s2.siteId, { fieldKey: 'skin.heel.left' })
  assert.deepEqual(doc.mappingValues, { 'skin.heel.left': 'intact' })

  // linking an ordinary callout makes it a placement; deleting the site removes its markers
  doc = linkCalloutToSite(doc, 'c1', s1.siteId)
  assert.equal(doc.callouts.find((c) => c.id === 'c1')!.labelText, 'Heel')
  assert.equal(sitePlacements(doc, s1.siteId).length, 1)
  doc = linkCalloutToSite(doc, 'c1', null)
  assert.equal(doc.callouts.find((c) => c.id === 'c1')!.siteId, undefined)
  doc = linkCalloutToSite(doc, 'c2', s1.siteId)
  const after = deleteSite(doc, s1.siteId)
  assert.equal(after.callouts.some((c) => c.id === 'c2'), false)
  assert.equal(after.anchors.some((a) => a.id === 'a2'), false)
})

test('re-homing a point onto another image keeps it in place', () => {
  let doc = normalizeDoc(legacyDoc())
  const added = addImage(doc, drawing(100, 300), 'Second')
  doc = setImagePlacement(added.doc, added.imageId, { rotation: 20 })
  const target = doc.images[1]
  const p = imageToPage(target, { x: 40, y: 150 })
  assert.equal(imageAtPoint(doc, p)?.id, target.id)
  const moved = reattachAnchor(doc, 'a1', target.id, p)
  const anchor = moved.anchors.find((a) => a.id === 'a1')!
  assert.equal(anchor.imageId, target.id)
  nearPoint(anchorPagePoint(moved, anchor), p)
  const onPage = reattachAnchor(doc, 'a1', null, { x: -500, y: 3 })
  assert.deepEqual(onPage.anchors.find((a) => a.id === 'a1'), { id: 'a1', mode: 'absolute', absolute: { x: -500, y: 3 }, mapping: undefined, attachments: undefined })
})

test('sites CSV has one row per marker, neutralizes formulas and omits values unless asked', () => {
  const s = addSite(normalizeDoc(legacyDoc()), '=HYPERLINK("x")')
  let doc = addSitePlacement(s.doc, s.siteId, s.doc.images[0].id, { x: 10, y: 10 }).doc
  doc = addSitePlacement(addSite(doc, 'Unmarked').doc, s.siteId, null, { x: 1, y: 2 }).doc
  doc = { ...doc, mappingValues: { [doc.sites![0].fieldKey]: 'secret' } }
  const rows = sitesCsv(doc).trim().split('\r\n')
  assert.equal(rows.length, 1 + 2 + 1)
  assert.ok(rows[1].includes(`"'=HYPERLINK(""x"")"`))
  assert.ok(!sitesCsv(doc).includes('secret'))
  assert.ok(sitesCsv(doc, { includeValues: true }).includes('"secret"'))
})

/** Stand-in for the DOM SVG parser: a frame-sized drawing with a smaller content box. */
const stubParse = (inner: string, w: number, h: number) => drawing(w, h)

test('scene files import as native multi-image documents', () => {
  const raw = JSON.parse(readFileSync(new URL('../public/samples/diorama/skin-assessment-library.scene.json', import.meta.url), 'utf8'))
  const doc = sceneToDoc(raw, stubParse)
  assert.equal(doc.images.length, 4)
  assert.equal(doc.sites!.length, 22)
  assert.equal(doc.callouts.filter((c) => c.siteId).length, 27)
  assert.equal(doc.callouts.filter((c) => !c.siteId).length, 11)
  assert.equal(doc.exportFrame, 'page')
  assert.deepEqual(doc.base.viewBox, { x: 0, y: 0, w: 1651, h: 928 })
  assert.deepEqual(doc.siteLegend?.pos, { x: 1198, y: 25 })
  assert.deepEqual(doc.views.map((v) => v.siteDisplay), ['numbers', 'names', 'values', 'blank'])

  // every marker lands where the scene put it: u/v of the placed image frame
  for (const link of raw.links) {
    const image = raw.images.find((i: { id: string }) => i.id === link.imageId)
    const callout = doc.callouts.find((c) => c.id === `callout-${link.id}`)!
    const anchor = doc.anchors.find((a) => a.id === callout.anchorId)!
    nearPoint(anchorPagePoint(doc, anchor), { x: image.x + link.u * image.width, y: image.y + link.v * image.height }, 1e-6)
    near(callout.fontSize! * 0.95, link.radius, 0.01)
  }
  // text attached to an image follows it
  const anterior = doc.textAnnotations.find((t) => t.id === 'anterior')!
  assert.equal(anterior.imageId, 'overview')
  assert.ok(doc.drawingElements.some((d) => d.id === 'rule-anterior' && d.imageId === 'overview'))
})

test('scene import rejects malformed files', () => {
  const raw = JSON.parse(readFileSync(new URL('../public/samples/diorama/skin-assessment.scene.json', import.meta.url), 'utf8'))
  const bad = (mutate: (s: typeof raw) => void, message: RegExp) => {
    const copy = structuredClone(raw)
    mutate(copy)
    assert.throws(() => sceneToDoc(copy, stubParse), message)
  }
  bad((s) => { s.version = 2 }, /version 1/)
  bad((s) => { s.images[0].assetId = 'nope' }, /missing asset/)
  bad((s) => { s.sites[1].number = 1 }, /unique/)
  bad((s) => { s.sites[1].fieldKey = s.sites[0].fieldKey }, /unique field key/)
  bad((s) => { s.links[0].siteId = 'nope' }, /missing image or site/)
  bad((s) => { s.links[0].u = 2 }, /Connection u/)
  bad((s) => { s.images[0].id = 'bad id' }, /Scene IDs/)
  bad((s) => { s.sites[0].fieldKey = '__proto__' }, /field key/)
  // a hidden placement is hidden in every view
  const copy = structuredClone(raw)
  copy.links[0].visible = false
  const doc = sceneToDoc(copy, stubParse)
  assert.ok(doc.views.every((v) => v.overrides[`callout-${copy.links[0].id}`]?.visible === false))
  assert.equal(doc.id, 'skin-assessment')
  assert.deepEqual(pageDrawing(doc.base.viewBox), doc.base)
})

test('auto-arrange places a migrated drawing\'s labels exactly as before, and per image on shared pages', async () => {
  const { computeArrangement } = await import('../src/autoLayout.ts')
  const legacy = { ...legacyDoc(), images: [] }
  const before = computeArrangement(legacy)
  const after = computeArrangement(normalizeDoc(legacyDoc()))
  assert.deepEqual(Object.keys(after), Object.keys(before))
  for (const id of Object.keys(before)) nearPoint(after[id], before[id], 1e-9)

  // a second image's labels go to columns around that image, not the whole page
  let doc = normalizeDoc(legacyDoc())
  const added = addImage(doc, drawing(100, 300), 'Second')
  doc = added.doc
  const second = doc.images[1]
  doc = {
    ...doc,
    anchors: [...doc.anchors, { id: 'b1', mode: 'relative-bbox', imageId: second.id, relative: { targetId: null, nx: 0.9, ny: 0.5 } }],
    callouts: [...doc.callouts, { ...doc.callouts[0], id: 'cb', anchorId: 'b1' }],
  }
  const placed = computeArrangement(doc).cb
  const box = { x: second.x + second.width * 0.1, w: second.width * 0.8 }
  near(placed.x, box.x + box.w + Math.max(40, box.w * 0.09), 1e-6)
})
