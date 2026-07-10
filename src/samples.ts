// Registry of the bundled body drawings + demo landmark/text seeds.

import type { TextAnnotation } from './types'

export interface SampleDef {
  key: string
  file: string
  label: string
}

export const SAMPLES: SampleDef[] = [
  { key: 'divider', file: 'standing_front_back_divider.svg', label: 'Standing — front / back' },
  { key: 'back', file: 'standing_back_view.svg', label: 'Standing — back' },
  { key: 'frontLeft', file: 'standing_front_left_half.svg', label: 'Standing — front (left half)' },
  { key: 'backRight', file: 'standing_back_right_half.svg', label: 'Standing — back (right half)' },
  { key: 'sideLying', file: 'side_lying_view.svg', label: 'Side-lying' },
  { key: 'wheelchair', file: 'seated_wheelchair_side_view.svg', label: 'Seated — wheelchair' },
  { key: 'organs', file: 'organs_demo.svg', label: 'Torso organs (parts demo)' },
]

export const DEFAULT_SAMPLE_KEY = 'divider'

export function sampleUrl(file: string): string {
  return `${import.meta.env.BASE_URL}samples/${file}`
}

/**
 * Demo callouts for the front/back divider view, matching the classic anatomy
 * reference (anterior labels left, posterior labels right). Positions are
 * approximate and fully drag-adjustable — they exist to show the system.
 *   nx,ny  = normalized anchor inside the drawing's content box (0..1)
 *   lx,ly  = label/balloon position in SVG user units
 */
export interface SeedDef {
  label: string
  nx: number
  ny: number
  lx: number
  ly: number
}

export const DIVIDER_SEEDS: SeedDef[] = [
  // Anterior (left figure) — labels to the left
  // Coordinates deliberately land on the anatomy of this silhouette, rather
  // than copying the reference image's page-relative percentages.
  { label: 'Chin', nx: 0.437, ny: 0.147, lx: 86, ly: 205 },
  { label: 'Trochanter', nx: 0.271, ny: 0.51, lx: 60, ly: 690 },
  { label: 'Knee', nx: 0.271, ny: 0.73, lx: 78, ly: 1010 },
  { label: 'Pretibial crest', nx: 0.363, ny: 0.82, lx: 60, ly: 1130 },
  // Posterior (right figure) — labels to the right
  { label: 'Occiput', nx: 0.56, ny: 0.088, lx: 648, ly: 135 },
  { label: 'Scapula', nx: 0.632, ny: 0.233, lx: 662, ly: 330 },
  { label: 'Spinous process', nx: 0.553, ny: 0.308, lx: 672, ly: 430 },
  { label: 'Elbow', nx: 0.784, ny: 0.428, lx: 676, ly: 520 },
  { label: 'Ischium', nx: 0.647, ny: 0.525, lx: 666, ly: 720 },
  { label: 'Malleolus', nx: 0.702, ny: 0.899, lx: 664, ly: 1240 },
  { label: 'Heel', nx: 0.676, ny: 0.966, lx: 664, ly: 1310 },
]

/** Editable standalone text that completes the classic reference layout. */
export const DIVIDER_TEXT_SEEDS: Omit<TextAnnotation, 'id'>[] = [
  {
    text: 'Anterior',
    pos: { x: 190, y: 28 },
    style: 'heading',
    fontSize: 28,
    fontWeight: 600,
    align: 'middle',
    color: '#111111',
    ruleWidth: 245,
  },
  {
    text: 'Posterior',
    pos: { x: 550, y: 28 },
    style: 'heading',
    fontSize: 28,
    fontWeight: 600,
    align: 'middle',
    color: '#111111',
    ruleWidth: 245,
  },
  {
    text: 'A',
    pos: { x: 28, y: 1342 },
    style: 'plain',
    fontSize: 32,
    fontWeight: 600,
    align: 'start',
    color: '#111111',
    ruleWidth: 120,
  },
]
