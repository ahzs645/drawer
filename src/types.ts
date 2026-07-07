// ---------------------------------------------------------------------------
// Data model for the semantic SVG annotation editor.
//
// The whole point of this model is to keep the *relationship* between a label
// and the body location it points to, instead of baking everything into one
// flat picture. So we separate:
//   - the base body drawing (imported SVG silhouette)
//   - anchors            (points LOCKED to the body)
//   - callouts           (the visible balloon + label + leader line)
//   - views              (named label-sets: names / numbers / blank quiz / ...)
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * How an anchor's position is stored.
 *  - 'relative-bbox': normalized 0..1 inside a target element's bounding box
 *    (or the whole drawing's content box when targetId is null). This survives
 *    scaling / swapping a redrawn body, which is what we want by default.
 *  - 'absolute': raw SVG user-unit coordinates. Simple, but tied to one drawing.
 *  - 'path-offset': a fraction along a specific <path> (reserved; resolved when
 *    the target element is a path).
 */
export type AnchorMode = 'relative-bbox' | 'absolute' | 'path-offset'

export interface Anchor {
  id: string
  mode: AnchorMode
  /** present when mode === 'absolute' */
  absolute?: Vec2
  /** present when mode === 'relative-bbox' */
  relative?: { targetId: string | null; nx: number; ny: number }
  /** present when mode === 'path-offset' */
  pathOffset?: { targetId: string; t: number }
}

/**
 * A named body location you can pick from / snap to — the "catalog" idea from
 * body-map libraries (react-native-body-highlighter, MuscleMap, bodymap, …).
 * Stored like an anchor: normalized 0..1 inside a target element's box, or the
 * whole drawing's content box when targetId is null. So the catalog survives
 * scaling and keeps pointing at the right relative spot.
 */
export interface Landmark {
  id: string
  /** display name, e.g. "Scapula" — becomes the callout label when placed */
  name: string
  /** normalized x within the (target or content) box, 0..1 */
  nx: number
  /** normalized y within the (target or content) box, 0..1 */
  ny: number
  /** element this landmark tracks (e.g. "heart"); null = whole-body box */
  targetId?: string | null
  /** optional group for the picker, e.g. "Anterior" / "Posterior" / "Organs" */
  group?: string
}

export type BalloonShape = 'circle' | 'hex' | 'none'
export type LeaderStyle = 'straight' | 'elbow'
/** How the point ON the body is drawn (the end the leader lands on). */
export type AnchorMarker = 'ring' | 'dot' | 'tick' | 'none'
/** Decoration at the body end of the leader line. */
export type LeaderEnd = 'none' | 'arrow' | 'dot'

/**
 * The reusable visual style of a callout — how the point looks, how the leader
 * looks, and what the "thing it leads to" (balloon/label) looks like. This is
 * the bundle a StylePreset captures. Kept separate from position/text so it can
 * be swapped freely and shared across drawings.
 */
export interface CalloutStyle {
  balloonShape: BalloonShape
  leaderStyle: LeaderStyle
  anchorMarker: AnchorMarker
  leaderEnd: LeaderEnd
  /** dashed leader line */
  dashed: boolean
}

export const DEFAULT_STYLE: CalloutStyle = {
  balloonShape: 'none',
  leaderStyle: 'elbow',
  anchorMarker: 'ring',
  leaderEnd: 'none',
  dashed: false,
}

/**
 * A named, reusable callout style. Presets live at the app level (persisted in
 * the browser), NOT inside a document, so the same look can be reused across
 * different images instead of being baked into one drawing.
 */
export interface StylePreset {
  id: string
  name: string
  /** built-in presets ship with the app and can't be deleted */
  builtin?: boolean
  style: CalloutStyle
}

/**
 * A callout: the visible annotation. Holds default appearance; per-view
 * overrides (label position, text, etc.) live on the View.
 */
export interface Callout {
  id: string
  anchorId: string
  labelText: string
  balloonShape: BalloonShape
  /** short text / number drawn inside the balloon */
  balloonText: string
  leaderStyle: LeaderStyle
  /** how the point on the body is drawn (optional; defaults to 'ring') */
  anchorMarker?: AnchorMarker
  /** decoration at the body end of the leader (optional; defaults to 'none') */
  leaderEnd?: LeaderEnd
  /** dashed leader line (optional; defaults to false) */
  dashed?: boolean
  /** default head position (balloon center) in SVG user units */
  labelPos: Vec2
  /** optional manual elbow bend point in SVG user units */
  elbow: Vec2 | null
  color: string
}

export type LabelMode = 'names' | 'numbers' | 'blank'

export interface CalloutOverride {
  visible?: boolean
  labelPos?: Vec2
  labelText?: string
  balloonText?: string
  balloonShape?: BalloonShape
  elbow?: Vec2 | null
}

/** A named label-set. Switching views re-skins every callout. */
export interface View {
  id: string
  name: string
  labelMode: LabelMode
  overrides: Record<string, CalloutOverride>
  /**
   * Optional style FORMAT for this view. When set, every callout is rendered in
   * this style regardless of its own base style — so the same placed markers can
   * appear as plain textbook lines in one view and numbered balloons in another.
   * Undefined = use each callout's own base style.
   */
  style?: CalloutStyle
}

export interface BaseDrawing {
  /** inner SVG markup of the body (paths/groups), without the outer <svg> */
  inner: string
  /** the imported viewBox */
  viewBox: Box
  /** tight bounding box of the drawn content, used for normalized anchoring */
  contentBox: Box
  /**
   * bounding box per addressable body element (keyed by id or assigned
   * data-drawer-el). An anchor with relative.targetId set is normalized to and
   * resolved against the matching box, so it tracks that specific body part.
   */
  targetBoxes: Record<string, Box>
}

export interface DrawerDoc {
  id: string
  name: string
  base: BaseDrawing
  anchors: Anchor[]
  callouts: Callout[]
  views: View[]
  activeViewId: string
  /** named body locations to pick from / snap to (the catalog) */
  landmarks: Landmark[]
}

/** A callout fully resolved against the active view, ready to render. */
export interface ResolvedCallout {
  id: string
  anchorId: string
  anchorPoint: Vec2
  labelText: string
  balloonShape: BalloonShape
  balloonText: string
  leaderStyle: LeaderStyle
  anchorMarker: AnchorMarker
  leaderEnd: LeaderEnd
  dashed: boolean
  labelPos: Vec2
  elbow: Vec2 | null
  color: string
  visible: boolean
  /** 1-based number used in 'numbers' mode and the legend */
  index: number
}
