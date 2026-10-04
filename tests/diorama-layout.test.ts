import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arrangeDioramaImages } from '../src/dioramaLayout.ts'
import { addSite, addSitePlacement, pageDrawing } from '../src/docModel.ts'
import { anchorPagePoint, diagramContentBounds, imagePageBounds, textAnnotationBounds } from '../src/geometry.ts'
import { resolveCallouts } from '../src/resolve.ts'
import type { DrawerDoc, ImageInstance } from '../src/types.ts'

function image(id: string, overrides: Partial<ImageInstance> = {}): ImageInstance {
  return { id, name: id, drawing: pageDrawing({ x: 0, y: 0, w: 100, h: 200 }), x: 900, y: 500, width: 100, height: 200, rotation: 0, ...overrides }
}

function document(images: ImageInstance[]): DrawerDoc {
  return {
    id: 'layout', name: 'Layout', base: pageDrawing({ x: 0, y: 0, w: 300, h: 300 }), images,
    anchors: [], callouts: [], sites: [], views: [{ id: 'v', name: 'Names', labelMode: 'names', overrides: {} }],
    activeViewId: 'v', landmarks: [], textAnnotations: [], drawingElements: [], landmarkGroupOrder: [], hiddenLandmarkGroups: [],
  }
}

test('grid preserves image geometry and carries attached markers, labels and text', () => {
  let doc = document([image('front'), image('side', { rotation: 35, width: 80, height: 160, flipX: true }), image('back')])
  const added = addSite(doc, 'Heel')
  doc = addSitePlacement(added.doc, added.siteId, 'side', { x: 940, y: 620 }).doc
  doc = {
    ...doc, siteLegend: { ...doc.siteLegend!, visible: false },
    textAnnotations: [{ id: 'caption', imageId: 'side', text: 'Side', pos: { x: 950, y: 680 }, style: 'plain', fontSize: 14, fontWeight: 400, align: 'start', color: '#111', ruleWidth: 0 }],
  }
  const beforePoint = anchorPagePoint(doc, doc.anchors[0])
  const next = arrangeDioramaImages(doc, { columns: 2, gap: 20, padding: 10 })
  const moved = next.images[1]
  const dx = moved.x - doc.images[1].x
  const dy = moved.y - doc.images[1].y
  const afterPoint = anchorPagePoint(next, next.anchors[0])
  assert.ok(Math.abs(afterPoint.x - beforePoint.x - dx) < 1e-6)
  assert.ok(Math.abs(afterPoint.y - beforePoint.y - dy) < 1e-6)
  assert.equal(next.textAnnotations[0].pos.x, doc.textAnnotations[0].pos.x + dx)
  assert.equal(next.textAnnotations[0].pos.y, doc.textAnnotations[0].pos.y + dy)
  assert.deepEqual(next.anchors, doc.anchors)
  next.images.forEach((placed, index) => {
    assert.deepEqual([placed.width, placed.height, placed.rotation, placed.flipX], [doc.images[index].width, doc.images[index].height, doc.images[index].rotation, doc.images[index].flipX])
    const box = imagePageBounds(placed)
    assert.ok(box.x + box.w <= next.base.viewBox.w)
    assert.ok(box.y + box.h <= next.base.viewBox.h)
  })
  const [first, second, third] = next.images.map((placed) => imagePageBounds(placed))
  assert.ok(first.x + first.w + 20 <= second.x + 1e-6)
  assert.ok(first.y + first.h + 20 <= third.y + 1e-6)
  assert.equal(doc.images[0].x, 900, 'the input document is not mutated')
  assert.equal(arrangeDioramaImages(next, { columns: 2, gap: 20, padding: 10 }), next, 'repeating the same layout is a no-op')
})

test('grid skips occupied cells and leaves locked and hidden views untouched', () => {
  const locked = image('locked', { x: 10, y: 10, locked: true })
  const hidden = image('hidden', { x: 30, y: 50, visible: false })
  const doc = document([locked, hidden, image('moving')])
  const next = arrangeDioramaImages(doc, { columns: 2, gap: 20, padding: 10 })
  assert.equal(next.images[0], locked)
  assert.equal(next.images[1], hidden)
  assert.equal(next.images[2].x, 130)
  assert.equal(next.images[2].y, 10)
})

test('grid validates controls and leaves a document with no movable views unchanged', () => {
  const doc = document([image('locked', { locked: true }), image('hidden', { visible: false })])
  assert.equal(arrangeDioramaImages(doc), doc)
  assert.throws(() => arrangeDioramaImages(doc, { columns: 0 }), /columns/)
  assert.throws(() => arrangeDioramaImages(doc, { gap: Number.NaN }), /Spacing/)
})

test('grid contains captions above hand frames, outside guides and labels from other saved views', () => {
  let doc = document([image('left-hand', { x: 100, y: 107 }), image('right-hand', { x: 500, y: 107 })])
  doc = {
    ...doc,
    textAnnotations: doc.images.map((hand) => ({
      id: `${hand.id}-heading`, imageId: hand.id, text: `${hand.name} palm`, pos: { x: hand.x + 50, y: 77 },
      style: 'heading', fontSize: 24, fontWeight: 600, align: 'middle', color: '#111', ruleWidth: 190,
    })),
    drawingElements: doc.images.map((hand) => ({
      id: `${hand.id}-guide`, imageId: hand.id, kind: 'line', start: { x: hand.x - 30, y: 325 },
      end: { x: hand.x + 130, y: 325 }, stroke: '#111', strokeWidth: 2, dashed: false, fill: null,
    })),
    anchors: [{ id: 'a', imageId: 'left-hand', mode: 'relative-bbox', relative: { targetId: null, nx: 0.5, ny: 0.5 } }],
    callouts: [{ id: 'c', anchorId: 'a', labelText: 'Outside label', labelPos: { x: -120, y: -40 }, elbow: null, balloonShape: 'none', balloonText: '', leaderStyle: 'straight', color: '#111', fontSize: 20 }],
    views: [
      { id: 'clean', name: 'Clean artwork', labelMode: 'names', overrides: { c: { visible: false } } },
      { id: 'labels', name: 'Labels', labelMode: 'names', overrides: {} },
    ],
    activeViewId: 'clean',
  }
  const next = arrangeDioramaImages(doc, { columns: 2, gap: 24, padding: 32 })
  const resolved = resolveCallouts(next, 'labels')
  const occupied = next.images.map((hand) => diagramContentBounds(
    imagePageBounds(hand), resolved.filter((callout) => callout.imageId === hand.id), 20,
    next.textAnnotations.filter((text) => text.imageId === hand.id), next.drawingElements.filter((drawing) => drawing.imageId === hand.id),
  ))
  for (const box of occupied) {
    assert.ok(box.x >= 32 - 1e-6 && box.y >= 32 - 1e-6, 'the entire carried footprint has page padding')
    assert.ok(box.x + box.w + 32 <= next.base.viewBox.w + 1e-6)
    assert.ok(box.y + box.h + 32 <= next.base.viewBox.h + 1e-6)
  }
  assert.ok(textAnnotationBounds(next.textAnnotations[0]).y >= 32, 'the heading above the SVG is not cropped')
  assert.ok(occupied[0].x + occupied[0].w + 24 <= occupied[1].x + 1e-6, 'adjacent labels and captions have a full gutter')
  assert.deepEqual(next.views, doc.views, 'arranging preserves clean artwork and label overrides')
  assert.equal(arrangeDioramaImages(next, { columns: 2, gap: 24, padding: 32 }), next, 'the full-footprint layout is idempotent')
})
