import { DEFAULT_STYLE } from './types'
import type { CalloutStyle, StylePreset } from './types'

// ---------------------------------------------------------------------------
// Callout style presets.
//
// A preset is a reusable bundle describing how a callout looks: the point on
// the body (anchorMarker), the leader line, and the "thing it leads to"
// (balloon + label). Presets are an APP-level concept — they persist in the
// browser (localStorage) and are shared across every drawing you open, rather
// than being stored inside a single document. That's the "not bound to the
// image" part: swap images, keep your styles.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'drawer.stylePresets.v1'
const DEFAULT_KEY = 'drawer.defaultPreset.v1'

/** Ships with the app. Users can apply these but not delete them. */
export const BUILTIN_PRESETS: StylePreset[] = [
  {
    id: 'preset-textbook',
    name: 'Textbook (plain line)',
    builtin: true,
    style: {
      balloonShape: 'none',
      leaderStyle: 'straight',
      anchorMarker: 'none',
      leaderEnd: 'none',
      dashed: false,
    },
  },
  {
    id: 'preset-tick',
    name: 'Tick + label',
    builtin: true,
    style: {
      balloonShape: 'none',
      leaderStyle: 'straight',
      anchorMarker: 'tick',
      leaderEnd: 'none',
      dashed: false,
    },
  },
  {
    id: 'preset-dot',
    name: 'Dot marker',
    builtin: true,
    style: {
      balloonShape: 'none',
      leaderStyle: 'elbow',
      anchorMarker: 'dot',
      leaderEnd: 'dot',
      dashed: false,
    },
  },
  {
    id: 'preset-arrow',
    name: 'Arrow pointer',
    builtin: true,
    style: {
      balloonShape: 'none',
      leaderStyle: 'straight',
      anchorMarker: 'none',
      leaderEnd: 'arrow',
      dashed: false,
    },
  },
  {
    id: 'preset-balloon',
    name: 'Numbered balloon',
    builtin: true,
    style: {
      balloonShape: 'circle',
      leaderStyle: 'elbow',
      anchorMarker: 'ring',
      leaderEnd: 'none',
      dashed: false,
    },
  },
  {
    id: 'preset-hex',
    name: 'Hex balloon',
    builtin: true,
    style: {
      balloonShape: 'hex',
      leaderStyle: 'elbow',
      anchorMarker: 'ring',
      leaderEnd: 'none',
      dashed: false,
    },
  },
]

export const DEFAULT_PRESET_ID = 'preset-balloon'

function isStyle(s: unknown): s is CalloutStyle {
  if (!s || typeof s !== 'object') return false
  const v = s as Record<string, unknown>
  return (
    typeof v.balloonShape === 'string' &&
    typeof v.leaderStyle === 'string' &&
    typeof v.anchorMarker === 'string' &&
    typeof v.leaderEnd === 'string' &&
    typeof v.dashed === 'boolean'
  )
}

/** Load user presets from localStorage, merged after the built-ins. */
export function loadPresets(): StylePreset[] {
  let user: StylePreset[] = []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        user = parsed.filter(
          (p): p is StylePreset =>
            p && typeof p.id === 'string' && typeof p.name === 'string' && isStyle(p.style),
        )
      }
    }
  } catch {
    // corrupt storage — fall back to built-ins only
  }
  return [...BUILTIN_PRESETS, ...user.map((p) => ({ ...p, builtin: false }))]
}

/** Persist only the user (non-builtin) presets. */
export function savePresets(presets: StylePreset[]) {
  try {
    const user = presets.filter((p) => !p.builtin)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  } catch {
    // storage unavailable (private mode / quota) — presets stay session-only
  }
}

export function loadDefaultPresetId(): string {
  try {
    return localStorage.getItem(DEFAULT_KEY) || DEFAULT_PRESET_ID
  } catch {
    return DEFAULT_PRESET_ID
  }
}

export function saveDefaultPresetId(id: string) {
  try {
    localStorage.setItem(DEFAULT_KEY, id)
  } catch {
    // ignore
  }
}

/** Extract just the style fields from a callout-like object. */
export function styleFromCallout(c: {
  balloonShape: CalloutStyle['balloonShape']
  leaderStyle: CalloutStyle['leaderStyle']
  anchorMarker?: CalloutStyle['anchorMarker']
  leaderEnd?: CalloutStyle['leaderEnd']
  dashed?: boolean
  leaderWidth?: number
  fontSize?: number
  fontWeight?: CalloutStyle['fontWeight']
}): CalloutStyle {
  return {
    balloonShape: c.balloonShape,
    leaderStyle: c.leaderStyle,
    anchorMarker: c.anchorMarker ?? DEFAULT_STYLE.anchorMarker,
    leaderEnd: c.leaderEnd ?? DEFAULT_STYLE.leaderEnd,
    dashed: c.dashed ?? DEFAULT_STYLE.dashed,
    leaderWidth: c.leaderWidth ?? DEFAULT_STYLE.leaderWidth,
    fontSize: c.fontSize,
    fontWeight: c.fontWeight ?? DEFAULT_STYLE.fontWeight,
  }
}
