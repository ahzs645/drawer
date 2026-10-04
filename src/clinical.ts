import { CLINICAL_ASSETS, type ClinicalAssetDef } from './clinicalCatalog'
import { boxForTarget, imagePageBounds, pointToNormalized } from './geometry'
import { uid } from './id'
import type { BaseDrawing, DrawerDoc, Landmark } from './types'

export function clinicalAsset(key: string | null): ClinicalAssetDef | undefined {
  return CLINICAL_ASSETS.find((asset) => asset.key === key)
}

/** Curated points are local drawing coordinates, independent of the page layout. */
export function clinicalLandmarks(asset: ClinicalAssetDef, drawing: BaseDrawing): Landmark[] {
  return asset.landmarks.map((point) => {
    if (point.targetId && !Object.prototype.hasOwnProperty.call(drawing.targetBoxes, point.targetId)) {
      throw new Error(`The ${asset.label} artwork is missing landmark target ${point.targetId}.`)
    }
    const box = boxForTarget(drawing, point.targetId ?? null)
    if (!(box.w > 0 && box.h > 0)) throw new Error(`Landmark ${point.label} has an empty target.`)
    return {
      id: uid('lm'),
      name: point.label,
      ...pointToNormalized(point, box),
      targetId: point.targetId ?? null,
      group: asset.label,
    }
  })
}

/** Adding a view to a page-framed chart must not silently crop the new image. */
export function containAddedImage(doc: DrawerDoc, imageId: string): DrawerDoc {
  if (doc.exportFrame !== 'page') return doc
  const image = doc.images.find((item) => item.id === imageId)
  if (!image) return doc
  const b = imagePageBounds(image)
  const p = doc.base.viewBox
  const x = Math.min(p.x, b.x - 16)
  const y = Math.min(p.y, b.y - 16)
  const right = Math.max(p.x + p.w, b.x + b.w + 16)
  const bottom = Math.max(p.y + p.h, b.y + b.h + 16)
  if (x === p.x && y === p.y && right === p.x + p.w && bottom === p.y + p.h) return doc
  const viewBox = { x, y, w: right - x, h: bottom - y }
  return { ...doc, base: { ...doc.base, viewBox, contentBox: doc.base.inner.trim() ? doc.base.contentBox : viewBox } }
}
