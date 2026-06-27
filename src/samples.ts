// Registry of the bundled body drawings + demo landmark seeds.

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
  { label: 'Chin', nx: 0.27, ny: 0.085, lx: 86, ly: 130 },
  { label: 'Trochanter', nx: 0.225, ny: 0.455, lx: 60, ly: 640 },
  { label: 'Knee', nx: 0.25, ny: 0.73, lx: 78, ly: 1010 },
  { label: 'Pretibial crest', nx: 0.235, ny: 0.82, lx: 60, ly: 1130 },
  // Posterior (right figure) — labels to the right
  { label: 'Occiput', nx: 0.735, ny: 0.07, lx: 648, ly: 112 },
  { label: 'Scapula', nx: 0.7, ny: 0.225, lx: 662, ly: 330 },
  { label: 'Spinous process', nx: 0.735, ny: 0.305, lx: 672, ly: 430 },
  { label: 'Elbow', nx: 0.83, ny: 0.43, lx: 676, ly: 520 },
  { label: 'Ischium', nx: 0.735, ny: 0.52, lx: 666, ly: 720 },
  { label: 'Malleolus', nx: 0.72, ny: 0.95, lx: 664, ly: 1270 },
  { label: 'Heel', nx: 0.745, ny: 0.975, lx: 664, ly: 1322 },
]
