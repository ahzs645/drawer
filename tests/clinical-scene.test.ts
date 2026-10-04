import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anchorPagePoint, landmarkPoint } from '../src/geometry.ts'
import { setImagePlacement } from '../src/docModel.ts'
import { resolveCallouts } from '../src/resolve.ts'
import { sceneToDoc } from '../src/sceneImport.ts'
import type { BaseDrawing, Vec2 } from '../src/types.ts'

// The artwork and the named part are deliberately smaller than the SVG frame.
// Frame fractions cannot be reused as content/target fractions without moving
// the clinical location.
function parseDrawing(inner: string, w: number, h: number): BaseDrawing {
  return {
    inner,
    viewBox: { x: 0, y: 0, w, h },
    contentBox: { x: 20, y: 40, w: 160, h: 320 },
    targetBoxes: { forearm: { x: 60, y: 100, w: 40, h: 80 } },
  }
}

function fixture() {
  return {
    format: 'drawer-scene', version: 1, id: 'clinical-test', name: 'Clinical chart',
    width: 1200, height: 1200, pageRule: false,
    assets: [{
      id: 'body', name: 'Body', width: 200, height: 400,
      inner: '<path id="forearm" d="M60 100H100V180H60Z"/>',
      source: 'Reconstructed vector reference',
      landmarks: [
        { id: 'arm-point', label: 'Forearm', x: 70, y: 120, targetId: 'forearm' as string | null },
        { id: 'whole-point', label: 'Shoulder', x: 40, y: 80, targetId: null as string | null },
      ],
    }],
    images: [{ id: 'front', assetId: 'body', name: 'Anterior', x: 300, y: 50, width: 400, height: 800, rotation: 0 }],
    sites: [{ id: 'site-arm', number: 1, label: 'Forearm', fieldKey: 'skin.arm' }],
    links: [{ id: 'link-arm', imageId: 'front', siteId: 'site-arm', u: 0.35, v: 0.3, targetId: 'forearm' as string | null }],
    texts: [{ id: 'caption', text: 'Anterior', x: 500, y: 30, fontSize: 20, bold: true, align: 'middle' }],
    legend: { x: 900, y: 30, heading: 'Sites', fontSize: 16, rowHeight: 24, visible: false },
  }
}

function nearPoint(actual: Vec2, expected: Vec2) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-8, `${actual.x} ≈ ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) < 1e-8, `${actual.y} ≈ ${expected.y}`)
}

test('scene catalog normalizes raw SVG coordinates into measured content and named target boxes', () => {
  const doc = sceneToDoc(fixture(), parseDrawing)
  const [forearm, shoulder] = doc.landmarks
  assert.equal(forearm.name, 'Forearm')
  assert.equal(forearm.targetId, 'forearm')
  assert.equal(forearm.nx, 0.25)
  assert.equal(forearm.ny, 0.25)
  assert.equal(shoulder.targetId, null)
  assert.equal(shoulder.nx, 0.125)
  assert.equal(shoulder.ny, 0.125)
  nearPoint(landmarkPoint(doc, forearm), { x: 440, y: 290 })
  nearPoint(landmarkPoint(doc, shoulder), { x: 380, y: 210 })
  assert.deepEqual(doc.landmarkGroupOrder, ['Anterior'])
  assert.ok(doc.landmarks.every((l) => l.imageId === 'front' && l.group === 'Anterior'))
})

test('scene catalog creates stable independent landmark instances for each placed copy', () => {
  const scene = fixture()
  scene.images.push({ ...scene.images[0], id: 'back', name: 'Posterior', x: 750 })
  const before = structuredClone(scene)
  const doc = sceneToDoc(scene, parseDrawing)
  const again = sceneToDoc(scene, parseDrawing)
  assert.equal(doc.landmarks.length, 4)
  assert.equal(new Set(doc.landmarks.map((l) => l.id)).size, 4)
  assert.deepEqual(doc.landmarks.map((l) => l.id), again.landmarks.map((l) => l.id))
  assert.deepEqual(doc.landmarkGroupOrder, ['Anterior', 'Posterior'])
  assert.deepEqual(doc.landmarks.map((l) => l.imageId), ['front', 'front', 'back', 'back'])
  doc.landmarks[0].name = 'Changed'
  doc.images[0].drawing.targetBoxes.forearm.x = 0
  assert.equal(doc.landmarks[2].name, 'Forearm')
  assert.equal(doc.images[1].drawing.targetBoxes.forearm.x, 60)
  assert.deepEqual(scene, before, 'import does not alter the source evidence')
})

test('landmark instance IDs cannot collide through hyphens in image and catalog IDs', () => {
  const scene = fixture()
  scene.assets[0].landmarks[0].id = 'b-c'
  scene.assets[0].landmarks[1].id = 'c'
  scene.images[0].id = 'a'
  scene.images.push({ ...scene.images[0], id: 'a-b' })
  scene.links = []
  const doc = sceneToDoc(scene, parseDrawing)
  assert.equal(new Set(doc.landmarks.map((l) => l.id)).size, 4)
})

test('named scene links retain their frame location when attached to a smaller SVG part', () => {
  const scene = fixture()
  const doc = sceneToDoc(scene, parseDrawing)
  const anchor = doc.anchors[0]
  assert.deepEqual(anchor.relative, { targetId: 'forearm', nx: 0.25, ny: 0.25 })
  nearPoint(anchorPagePoint(doc, anchor), { x: 440, y: 290 })
  nearPoint(doc.callouts[0].labelPos, { x: 440, y: 290 })

  // Keep the authored location even if it lies outside the selected target box.
  // Clamping a normalized point would silently move the anatomical connection.
  scene.links[0].u = 0.1
  const outside = sceneToDoc(scene, parseDrawing)
  assert.equal(outside.anchors[0].relative!.nx, -1)
  nearPoint(anchorPagePoint(outside, outside.anchors[0]), { x: 340, y: 290 })
})

test('imported horizontal mirror and rotation carry the artwork, landmarks and site links together', () => {
  const scene = fixture()
  const mirrored = { ...scene, images: [{ ...scene.images[0], flipX: true, rotation: 90 }] }
  const doc = sceneToDoc(mirrored, parseDrawing)
  assert.equal(doc.images[0].flipX, true)
  // Center (500,450); mirrored/scaled offset (60,-160); rotate 90 => (160,60).
  nearPoint(landmarkPoint(doc, doc.landmarks[0]), { x: 660, y: 510 })
  nearPoint(anchorPagePoint(doc, doc.anchors[0]), { x: 660, y: 510 })
  nearPoint(doc.callouts[0].labelPos, { x: 660, y: 510 })
  const moved = setImagePlacement(doc, 'front', { x: 325, y: 70 })
  nearPoint(landmarkPoint(moved, moved.landmarks[0]), { x: 685, y: 530 })
  nearPoint(anchorPagePoint(moved, moved.anchors[0]), { x: 685, y: 530 })
  assert.deepEqual(moved.landmarks, doc.landmarks)

  const unmirrored = sceneToDoc({ ...scene, images: [{ ...scene.images[0], flipX: false }] }, parseDrawing)
  assert.equal(unmirrored.images[0].flipX, false)
  nearPoint(landmarkPoint(unmirrored, unmirrored.landmarks[0]), { x: 440, y: 290 })
})

test('unknown or empty target boxes are rejected for catalogs and links without fallback', () => {
  for (const where of ['landmark', 'link']) {
    for (const target of ['missing-part', 'toString']) {
      const scene = fixture()
      if (where === 'landmark') scene.assets[0].landmarks[0].targetId = target
      else scene.links[0].targetId = target
      assert.throws(() => sceneToDoc(scene, parseDrawing), /Missing SVG target/)
    }
    for (const dimensions of [{ w: 0, h: 80 }, { w: 40, h: 0 }, { w: -1, h: 80 }, { w: 40, h: Infinity }]) {
      const scene = fixture()
      if (where === 'link') scene.assets[0].landmarks = []
      assert.throws(() => sceneToDoc(scene, (inner, w, h) => ({
        ...parseDrawing(inner, w, h),
        targetBoxes: { forearm: { x: 60, y: 100, ...dimensions } },
      })), /bounding box must have finite coordinates and positive width and height/)
    }
  }
})

test('scene catalogs reject duplicate IDs, missing labels and malformed local coordinates', () => {
  const scene = fixture()
  const asset = scene.assets[0]
  const landmark = asset.landmarks[0]
  const withLandmarks = (landmarks: unknown) => ({ ...scene, assets: [{ ...asset, landmarks }] })
  assert.throws(() => sceneToDoc(withLandmarks([landmark, landmark]), parseDrawing), /Duplicate asset landmark IDs/)
  for (const x of ['70', null, undefined, NaN, Infinity, -1, 201]) {
    assert.throws(() => sceneToDoc(withLandmarks([{ ...landmark, x }]), parseDrawing), /Landmark x/)
  }
  for (const y of ['120', null, undefined, NaN, Infinity, -1, 401]) {
    assert.throws(() => sceneToDoc(withLandmarks([{ ...landmark, y }]), parseDrawing), /Landmark y/)
  }
  assert.throws(() => sceneToDoc(withLandmarks([{ ...landmark, label: ' ' }]), parseDrawing), /landmark needs a label/)
  assert.throws(() => sceneToDoc(withLandmarks([{ ...landmark, targetId: '' }]), parseDrawing), /target ID/)
  assert.throws(() => sceneToDoc(withLandmarks('not a catalog'), parseDrawing), /asset landmarks/)
  assert.throws(() => sceneToDoc(scene, (inner, w, h) => ({
    ...parseDrawing(inner, w, h), contentBox: { x: 0, y: 0, w: 0, h: 400 },
  })), /Content bounding box/)
})

test('page rule is optional, and all text alignments preserve legacy font/baseline semantics', () => {
  const scene = fixture()
  const doc = sceneToDoc(scene, parseDrawing)
  assert.deepEqual(doc.drawingElements, [])
  assert.equal(doc.textAnnotations[0].align, 'middle')
  assert.equal(doc.textAnnotations[0].fontSize, 20)
  assert.equal(doc.textAnnotations[0].fontWeight, 700)
  assert.deepEqual(doc.textAnnotations[0].pos, { x: 500, y: 23 })
  for (const align of ['start', 'middle', 'end']) {
    const aligned = sceneToDoc({ ...scene, texts: [{ ...scene.texts[0], align }] }, parseDrawing)
    assert.equal(aligned.textAnnotations[0].align, align)
    assert.deepEqual(aligned.textAnnotations[0].pos, doc.textAnnotations[0].pos)
  }
  const captionRule = sceneToDoc({ ...scene, texts: [{ ...scene.texts[0], ruleWidth: 120 }] }, parseDrawing)
  assert.deepEqual(captionRule.drawingElements.map((d) => d.id), ['rule-caption'])
  assert.throws(() => sceneToDoc({ ...scene, texts: [{ ...scene.texts[0], align: 'center' }] }, parseDrawing), /Text alignment/)
  assert.throws(() => sceneToDoc({ ...scene, pageRule: 'false' }, parseDrawing), /Page rule must be true or false/)
  assert.throws(() => sceneToDoc({ ...scene, images: [{ ...scene.images[0], flipX: 'false' }] }, parseDrawing), /Image flipX must be true or false/)
})

test('legacy scenes keep their top rule, content anchors, unmirrored images and default text alignment', () => {
  const scene = fixture()
  const doc = sceneToDoc({
    ...scene,
    pageRule: undefined,
    assets: [{ ...scene.assets[0], landmarks: undefined }],
    links: [{ ...scene.links[0], targetId: undefined }],
    texts: [{ ...scene.texts[0], align: undefined, bold: false }],
  }, parseDrawing)
  assert.deepEqual(doc.landmarks, [])
  assert.deepEqual(doc.landmarkGroupOrder, [])
  assert.equal(doc.images[0].flipX, undefined)
  assert.equal(doc.images[0].source, 'Reconstructed vector reference')
  assert.deepEqual(doc.drawingElements[0], {
    id: 'page-rule', kind: 'line', start: { x: 30, y: 6 }, end: { x: 1507, y: 6 },
    stroke: '#222222', strokeWidth: 2, dashed: false, fill: null,
  })
  assert.equal(doc.textAnnotations[0].align, 'start')
  assert.equal(doc.textAnnotations[0].fontWeight, 400)
  assert.equal(doc.anchors[0].relative!.targetId, null)
  nearPoint(anchorPagePoint(doc, doc.anchors[0]), { x: 440, y: 290 })
})

test('duplicate connection and text IDs cannot silently merge independent scene objects', () => {
  const scene = fixture()
  assert.throws(() => sceneToDoc({ ...scene, links: [...scene.links, scene.links[0]] }, parseDrawing), /Duplicate anchor IDs/)
  assert.throws(() => sceneToDoc({ ...scene, texts: [...scene.texts, scene.texts[0]] }, parseDrawing), /Duplicate text IDs/)
})

test('scene provenance survives import as independent bounded text metadata', () => {
  const scene = fixture()
  const provenance = { source: 'User chart', review: 'Visual draft', artwork: 'Reconstructed Bézier paths', baseCommit: 'abc123' }
  const doc = sceneToDoc({ ...scene, provenance }, parseDrawing)
  assert.deepEqual(doc.provenance, provenance)
  doc.provenance!.review = 'Changed'
  assert.equal(provenance.review, 'Visual draft')
  assert.equal(sceneToDoc(scene, parseDrawing).provenance, undefined)
  for (const invalid of [null, [], 'source', { source: 123 }, { source: {} }, { source: 'x'.repeat(4001) }]) {
    assert.throws(() => sceneToDoc({ ...scene, provenance: invalid }, parseDrawing), /provenance/)
  }
  for (const key of ['__proto__', 'prototype', 'constructor', ' ']) {
    assert.throws(() => sceneToDoc({ ...scene, provenance: Object.fromEntries([[key, 'invalid']]) }, parseDrawing), /provenance key/)
  }
  const tooMany = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`source${i}`, 'source']))
  assert.throws(() => sceneToDoc({ ...scene, provenance: tooMany }, parseDrawing), /at most 40 entries/)
})

test('optional clean artwork view hides callouts while keeping authored site visibility in the other views', () => {
  const scene = fixture()
  const doc = sceneToDoc({
    ...scene,
    cleanView: true,
    links: [scene.links[0], { ...scene.links[0], id: 'hidden-arm', visible: false }],
  }, parseDrawing)
  assert.equal(doc.activeViewId, 'artwork')
  assert.deepEqual(doc.views.map((v) => v.id), ['artwork', 'site-numbers', 'site-names', 'field-values', 'blank-markers'])
  assert.equal(doc.views[0].name, 'Clean artwork')
  assert.deepEqual(resolveCallouts(doc).map((c) => c.visible), [false, false])
  for (const id of ['site-numbers', 'site-names', 'field-values', 'blank-markers']) {
    assert.deepEqual(resolveCallouts({ ...doc, activeViewId: id }).map((c) => c.visible), [true, false])
  }
  assert.equal(doc.landmarks.length, 2, 'the named catalog remains available in a clean view')
  const legacy = sceneToDoc(scene, parseDrawing)
  assert.equal(legacy.activeViewId, 'site-numbers')
  assert.equal(legacy.views.length, 4)
  assert.throws(() => sceneToDoc({ ...scene, cleanView: 'true' }, parseDrawing), /Clean view must be true or false/)
})
