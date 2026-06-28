// ---------------------------------------------------------------------------
// The landmark *catalog*: a predefined library of named body locations you can
// pick from and snap to — the idea Drawer borrows from body-map libraries
// (react-native-body-highlighter, MuscleMap, body-muscles, etal/bodymap,
// hugobonifay/body-map). Instead of free-clicking a blank silhouette, you pick
// a known target (or click near it and the anchor auto-locks to it).
//
// Two sources of landmarks:
//   1. CURATED catalogs, keyed by sample, for plain silhouette bodies that have
//      no addressable sub-elements (positions normalized to the content box).
//   2. AUTO-DERIVED from a body's named SVG elements (e.g. the organs demo, or
//      any imported multi-part SVG): each named part becomes a landmark at its
//      bounding-box center, tracking that element.
// ---------------------------------------------------------------------------

import { uid } from './id'
import { DIVIDER_SEEDS } from './samples'
import type { Box, Landmark } from './types'

/** A catalog entry before it gets a runtime id. */
export interface LandmarkDef {
  name: string
  nx: number
  ny: number
  targetId?: string | null
  group?: string
}

// The classic anterior/posterior reference points (reuse the demo seed
// positions so the catalog lines up exactly with the divider figure)…
const DIVIDER_FROM_SEEDS: LandmarkDef[] = DIVIDER_SEEDS.map((s) => ({
  name: s.label,
  nx: s.nx,
  ny: s.ny,
  // seeds before "Occiput" are the left (anterior) figure; the rest are right
  group: s.nx < 0.5 ? 'Anterior' : 'Posterior',
}))

// …plus extra bony prominences / pressure points so the picker offers more than
// what the demo already places. Approximate + drag-adjustable.
const DIVIDER_EXTRA: LandmarkDef[] = [
  // Anterior (left figure)
  { name: 'Forehead', nx: 0.262, ny: 0.045, group: 'Anterior' },
  { name: 'Acromion (shoulder)', nx: 0.16, ny: 0.18, group: 'Anterior' },
  { name: 'Elbow (olecranon)', nx: 0.17, ny: 0.42, group: 'Anterior' },
  { name: 'Iliac crest', nx: 0.205, ny: 0.4, group: 'Anterior' },
  { name: 'Patella', nx: 0.25, ny: 0.745, group: 'Anterior' },
  { name: 'Toes', nx: 0.255, ny: 0.99, group: 'Anterior' },
  // Posterior (right figure)
  { name: 'Vertebra prominens', nx: 0.735, ny: 0.2, group: 'Posterior' },
  { name: 'Sacrum', nx: 0.735, ny: 0.485, group: 'Posterior' },
  { name: 'Greater trochanter', nx: 0.8, ny: 0.46, group: 'Posterior' },
  { name: 'Calf', nx: 0.745, ny: 0.82, group: 'Posterior' },
  { name: 'Calcaneus (heel)', nx: 0.745, ny: 0.965, group: 'Posterior' },
]

// A back-only figure (single posterior view).
const BACK_CATALOG: LandmarkDef[] = [
  { name: 'Occiput', nx: 0.5, ny: 0.06, group: 'Posterior' },
  { name: 'Vertebra prominens', nx: 0.5, ny: 0.2, group: 'Posterior' },
  { name: 'Scapula (left)', nx: 0.38, ny: 0.24, group: 'Posterior' },
  { name: 'Scapula (right)', nx: 0.62, ny: 0.24, group: 'Posterior' },
  { name: 'Spinous process', nx: 0.5, ny: 0.33, group: 'Posterior' },
  { name: 'Elbow (left)', nx: 0.2, ny: 0.45, group: 'Posterior' },
  { name: 'Elbow (right)', nx: 0.8, ny: 0.45, group: 'Posterior' },
  { name: 'Sacrum', nx: 0.5, ny: 0.5, group: 'Posterior' },
  { name: 'Ischium', nx: 0.5, ny: 0.55, group: 'Posterior' },
  { name: 'Calf (left)', nx: 0.4, ny: 0.82, group: 'Posterior' },
  { name: 'Calf (right)', nx: 0.6, ny: 0.82, group: 'Posterior' },
  { name: 'Heel (left)', nx: 0.42, ny: 0.97, group: 'Posterior' },
  { name: 'Heel (right)', nx: 0.58, ny: 0.97, group: 'Posterior' },
]

/** Curated catalogs keyed by sample key (see samples.ts). */
export const LANDMARK_CATALOGS: Record<string, LandmarkDef[]> = {
  divider: [...DIVIDER_FROM_SEEDS, ...DIVIDER_EXTRA],
  back: BACK_CATALOG,
}

/** Auto-generated element handles look like "el12"; those aren't real names. */
const AUTO_ID = /^el\d+$/

/** Turn an element id/slug into a display name: "lung_right" -> "Lung right". */
export function prettyName(id: string): string {
  const s = id.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id
}

/**
 * Derive landmarks from a body's *named* elements: one per element, at the
 * center of its bounding box, tracking that element. Skips the auto-assigned
 * "elN" handles so we only surface real, meaningful part names.
 */
export function landmarksFromTargets(targetBoxes: Record<string, Box>): LandmarkDef[] {
  return Object.keys(targetBoxes)
    .filter((k) => !AUTO_ID.test(k))
    .map((k) => ({ name: prettyName(k), nx: 0.5, ny: 0.5, targetId: k, group: 'Parts' }))
}

/** Assign runtime ids to catalog defs. */
export function makeLandmarks(defs: LandmarkDef[]): Landmark[] {
  return defs.map((d) => ({
    id: uid('lm'),
    name: d.name,
    nx: d.nx,
    ny: d.ny,
    targetId: d.targetId ?? null,
    group: d.group,
  }))
}

/**
 * Build the landmark set for a freshly loaded body: the curated catalog for
 * this sample (if any) plus any auto-derived named parts, de-duplicated by
 * (name + targetId) so a curated entry wins over a derived one.
 */
export function buildLandmarksFor(
  sampleKey: string | null,
  targetBoxes: Record<string, Box>,
): Landmark[] {
  const curated = sampleKey ? LANDMARK_CATALOGS[sampleKey] ?? [] : []
  const derived = landmarksFromTargets(targetBoxes)
  const seen = new Set(curated.map((d) => `${d.name}::${d.targetId ?? ''}`))
  const merged = [...curated]
  for (const d of derived) {
    const key = `${d.name}::${d.targetId ?? ''}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(d)
    }
  }
  return makeLandmarks(merged)
}
