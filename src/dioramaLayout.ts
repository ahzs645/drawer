import { setImagePlacement, siteLegendBox } from './docModel'
import { diagramContentBounds, fontSizeFor, imagePageBounds, textAnnotationBounds } from './geometry'
import { resolveCallouts } from './resolve'
import type { Box, DrawerDoc } from './types'

export interface DioramaGridOptions {
  columns?: number
  gap?: number
  padding?: number
}

const overlaps = (a: Box, b: Box, gap: number): boolean =>
  a.x < b.x + b.w + gap - 1e-8 && a.x + a.w + gap > b.x + 1e-8 &&
  a.y < b.y + b.h + gap - 1e-8 && a.y + a.h + gap > b.y + 1e-8

/**
 * Put visible, unlocked images into a grid without changing their size or
 * rotation. Using the standard placement operation carries attached labels,
 * text, shapes and per-view overrides with each image. Every saved view's
 * labels are included in its occupied footprint, including captions outside
 * the SVG frame. Fixed images, the legend and page annotations stay in place.
 * The page can grow to contain the result, but is never cropped or shrunk.
 */
export function arrangeDioramaImages(doc: DrawerDoc, options: DioramaGridOptions = {}): DrawerDoc {
  const { columns = 4, gap = 32, padding = 32 } = options
  if (!Number.isInteger(columns) || columns < 1 || columns > 12) throw new Error('Choose between 1 and 12 columns.')
  if (!Number.isFinite(gap) || gap < 0 || gap > 1000) throw new Error('Spacing must be between 0 and 1000.')
  if (!Number.isFinite(padding) || padding < 0 || padding > 1000) throw new Error('Page padding must be between 0 and 1000.')

  const moving = doc.images.filter((image) => image.visible !== false && !image.locked)
  if (!moving.length) return doc
  // An automatic callout font can grow when the page grows. Reserve its
  // maximum size without changing the callout itself, so one arrangement
  // remains safe and stable after expanding the page or switching views.
  const automaticFont = fontSizeFor({ x: 0, y: 0, w: 1e5, h: 1e5 })
  const calloutById = new Map(doc.callouts.map((callout) => [callout.id, callout]))
  const allViews = doc.views.flatMap((view) => resolveCallouts(doc, view.id).map((callout) => ({
    ...callout, fontSize: view.style?.fontSize ?? calloutById.get(callout.id)?.fontSize ?? automaticFont,
  })))
  const footprints = new Map(doc.images.map((image) => [image.id, diagramContentBounds(
    imagePageBounds(image),
    allViews.filter((callout) => callout.imageId === image.id),
    automaticFont,
    doc.textAnnotations.filter((text) => text.imageId === image.id),
    doc.drawingElements.filter((drawing) => drawing.imageId === image.id),
  )]))
  const frames = moving.map((image) => footprints.get(image.id)!)
  const cellWidth = Math.max(...frames.map((box) => box.w)) + gap
  const cellHeight = Math.max(...frames.map((box) => box.h)) + gap
  const page = doc.base.viewBox
  const origin = { x: page.x + padding, y: page.y + padding }
  const obstacles = [
    ...doc.images.filter((image) => image.visible !== false && image.locked).map((image) => footprints.get(image.id)!),
    ...doc.textAnnotations.filter((text) => !text.imageId).map(textAnnotationBounds),
    ...doc.drawingElements.filter((drawing) => !drawing.imageId).map((drawing) => diagramContentBounds(
      { ...drawing.start, w: 0, h: 0 }, [], automaticFont, [], [drawing],
    )),
    ...allViews.filter((callout) => !callout.imageId && callout.visible).map((callout) => diagramContentBounds(
      { ...callout.anchorPoint, w: 0, h: 0 }, [callout], automaticFont,
    )),
  ]
  const legend = siteLegendBox(doc)
  if (legend) obstacles.push(legend)

  let next = doc
  let slot = 0
  let right = page.x + page.w
  let bottom = page.y + page.h
  moving.forEach((image, index) => {
    const old = frames[index]
    let target: Box
    let attempts = 0
    do {
      // A very large fixed object need not make us scan thousands of cells.
      if (attempts === 512) {
        const obstacleBottom = Math.max(origin.y, ...obstacles.map((box) => box.y + box.h + gap))
        slot = Math.max(slot, Math.ceil((obstacleBottom - origin.y) / cellHeight) * columns)
      }
      target = {
        x: origin.x + (slot % columns) * cellWidth,
        y: origin.y + Math.floor(slot / columns) * cellHeight,
        w: old.w,
        h: old.h,
      }
      slot += 1
      attempts += 1
    } while (obstacles.some((box) => overlaps(target, box, gap)))

    const x = image.x + target.x - old.x
    const y = image.y + target.y - old.y
    if (Math.abs(x - image.x) > 1e-9 || Math.abs(y - image.y) > 1e-9) {
      next = setImagePlacement(next, image.id, { x, y })
    }
    right = Math.max(right, target.x + target.w + padding)
    bottom = Math.max(bottom, target.y + target.h + padding)
  })

  if (right - page.x > 1e5 || bottom - page.y > 1e5) throw new Error('The arranged page would be too large. Reduce the image sizes first.')
  if (right - (page.x + page.w) > 1e-8 || bottom - (page.y + page.h) > 1e-8) {
    const viewBox = { ...page, w: right - page.x, h: bottom - page.y }
    next = {
      ...next,
      base: { ...next.base, viewBox, contentBox: next.base.inner.trim() ? next.base.contentBox : viewBox },
    }
  }
  return next
}
