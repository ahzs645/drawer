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

/** An external application field, not an inferred or validated clinical code. */
export interface AnchorMapping {
  fieldKey: string
  display?: string
  system?: string
  code?: string
}

/** Raster reference evidence; stored in the editable project, never in SVG exports. */
export interface AnchorAttachment {
  id: string
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
  dataUrl: string
}

export type MappingMode = 'label' | 'mapped-label' | 'value' | 'label-value'
export type MappingValue = string | number | boolean | null

export interface Anchor {
  id: string
  mode: AnchorMode
  /**
   * Image this point belongs to. Its relative/absolute coordinates are then in
   * that image's own drawing space, so the point follows the image when it is
   * moved, resized or rotated. Absent = a point on the page itself.
   */
  imageId?: string
  mapping?: AnchorMapping
  attachments?: AnchorAttachment[]
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
  /** image whose drawing this landmark is normalized in; absent = the page */
  imageId?: string
}

export type FontWeight = 400 | 500 | 600 | 700

export type TextAnnotationStyle = 'plain' | 'heading'
export type TextAnnotationAlign = 'start' | 'middle' | 'end'

/**
 * Standalone figure text that is not tied to an anatomical point. This covers
 * section headings (for example, "Anterior" / "Posterior"), figure letters,
 * captions, and other freely positioned labels.
 */
export interface TextAnnotation {
  id: string
  text: string
  pos: Vec2
  style: TextAnnotationStyle
  fontSize: number
  fontWeight: 400 | 600 | 700
  align: TextAnnotationAlign
  color: string
  /** width of the horizontal rule for the heading style, in SVG user units */
  ruleWidth: number
  /** when set, the text moves with this image (pos stays in page units) */
  imageId?: string
}

/** 'badge' is a filled circle with knocked-out text (a numbered site marker). */
export type BalloonShape = 'circle' | 'hex' | 'badge' | 'none'
/** 'none' puts the balloon directly on the point, with no leader line. */
export type LeaderStyle = 'straight' | 'elbow' | 'none'
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
  /** leader thickness in SVG user units */
  leaderWidth?: number
  /** optional label type settings; undefined fontSize follows the drawing scale */
  fontSize?: number
  fontWeight?: FontWeight
}

export const DEFAULT_STYLE: CalloutStyle = {
  balloonShape: 'none',
  leaderStyle: 'elbow',
  anchorMarker: 'ring',
  leaderEnd: 'none',
  dashed: false,
  leaderWidth: 1.6,
  fontWeight: 500,
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
  /** Optional text-block offset from labelPos; lets a label sit above a leader. */
  labelOffset?: Vec2
  labelAlign?: TextAnnotationAlign
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
  leaderWidth?: number
  fontSize?: number
  fontWeight?: FontWeight
  /**
   * Shared site row this callout is a placement of. Every placement of a site
   * shows the site's label, number and field key, so one row can be marked on
   * several images.
   */
  siteId?: string
}

export type LabelMode = 'names' | 'numbers' | 'blank'

export interface CalloutOverride {
  /** Optional text-block offset from labelPos; lets a label sit above a leader. */
  labelOffset?: Vec2
  labelAlign?: TextAnnotationAlign
  visible?: boolean
  labelPos?: Vec2
  labelText?: string
  balloonText?: string
  balloonShape?: BalloonShape
  elbow?: Vec2 | null
}

/** A named label-set. Switching views re-skins every callout. */
export interface View {
  mappingMode?: MappingMode
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
  /**
   * Render every leader / marker / balloon in ink black instead of each callout's
   * own color — the plain "textbook" look. Per-callout colors are preserved in the
   * model and simply ignored while this is on.
   */
  mono?: boolean
  /**
   * How site placements render in this view. Defaults to 'blank' for a blank
   * quiz view and 'numbers' otherwise. Other callouts follow labelMode.
   */
  siteDisplay?: SiteDisplay
}

export type SiteDisplay = 'numbers' | 'names' | 'values' | 'blank'

/**
 * A row of the shared site table: one numbered location (e.g. "6. Sacrum") that
 * may be marked on several images. The field key links it to an external
 * application field; its value lives in DrawerDoc.mappingValues.
 */
export interface Site {
  id: string
  number: number
  label: string
  fieldKey: string
}

/** The on-page numbered list of sites. */
export interface SiteLegend {
  /** top-left corner of the legend block, in page units */
  pos: Vec2
  heading: string
  fontSize: number
  rowHeight: number
  visible: boolean
}

/**
 * A drawing placed on the page. The drawing keeps its own coordinate system;
 * x/y/width/height place its viewBox on the page (before rotation about the
 * box center). Several images can share a page, each movable independently.
 */
export interface ImageInstance {
  id: string
  name: string
  drawing: BaseDrawing
  x: number
  y: number
  width: number
  height: number
  /** degrees, clockwise, about the center of the placed box */
  rotation: number
  /** mirror the drawing horizontally */
  flipX?: boolean
  /** hidden images (and everything attached to them) are not drawn or exported */
  visible?: boolean
  /** locked images cannot be moved, resized, or deleted from the canvas */
  locked?: boolean
  /** free-text provenance note, e.g. where the artwork came from */
  source?: string
}

/**
 * A drawing's markup + geometry. Used for each placed image, and for the page
 * (DrawerDoc.base), whose viewBox is the page frame.
 */
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

/**
 * The shape of a selectable area, in its image's drawing space (or page space
 * when the area has no imageId):
 *  - 'part': a named element of the artwork (its id / data-drawer-el), so the
 *    real outline is the click target — the most precise kind;
 *  - 'rect' / 'ellipse' / 'polygon': a shape drawn over the artwork.
 */
export type AreaShape =
  | { kind: 'part'; targetId: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'polygon'; points: Vec2[] }

/**
 * A selectable region of a drawing — a joint, a body part, a zone. Areas and
 * sites are two kinds of target on the same surface: an area is a region you
 * select, a site is a numbered point you mark. A form can use either or both.
 */
export interface Area {
  id: string
  label: string
  /** image the shape is stored in; absent = page coordinates */
  imageId?: string
  shape: AreaShape
  /** external application key, like Site.fieldKey (not a clinical code) */
  fieldKey?: string
}

/**
 * A named set of areas and/or sites that is counted together, e.g. the 28
 * joints of a CDAI count. Mirrors a hotspot map's counter group.
 */
export interface SurfaceGroup {
  id: string
  label: string
  areaIds: string[]
  siteIds: string[]
  /** show the running count beside the drawing (default true) */
  showCount?: boolean
}

export type MarkSymbol = 'x' | 'circle' | 'triangle'

/**
 * Something the viewer placed on the drawing: a symbol where they clicked, or
 * a freehand stroke. Points are in the image's drawing space (page space when
 * imageId is absent), so a mark follows its image. A mark remembers the area
 * and site it landed on, so marking "X on the left knee" can count as
 * selecting the left knee.
 */
export interface SurfaceMark {
  id: string
  kind: 'symbol' | 'stroke'
  symbol?: MarkSymbol
  imageId?: string
  points: Vec2[]
  color: string
  /** symbol size / stroke width basis, in the image's drawing units */
  size: number
  areaId?: string
  siteId?: string
}

export type DrawingElementKind = 'line' | 'rect'

/** A freely drawn line or rectangle layered over the imported base drawing. */
export interface DrawingElement {
  id: string
  /** when set, the shape moves with this image (coordinates stay in page units) */
  imageId?: string
  kind: DrawingElementKind
  start: Vec2
  end: Vec2
  stroke: string
  strokeWidth: number
  dashed: boolean
  /** rectangle fill; null means transparent */
  fill: string | null
}

export interface DrawerDoc {
  /** Flat external-field values. Treat downloaded projects/autosaves as data-bearing. */
  mappingValues?: Record<string, MappingValue>
  id: string
  name: string
  /**
   * The page. Its viewBox is the page frame; artwork lives in `images`. Older
   * project files stored their single drawing here — they are migrated into
   * images[0] on load (see normalizeDoc), so `inner` is normally empty.
   */
  base: BaseDrawing
  /** drawings placed on the page, bottom to top */
  images: ImageInstance[]
  /** shared site table (numbered locations with one or more placements) */
  sites?: Site[]
  siteLegend?: SiteLegend
  /** crop for SVG/PNG/PDF export: fit the content (default) or use the page frame */
  exportFrame?: 'content' | 'page'
  anchors: Anchor[]
  callouts: Callout[]
  views: View[]
  activeViewId: string
  /** named body locations to pick from / snap to (the catalog) */
  landmarks: Landmark[]
  /** freely positioned headings, figure letters, and captions */
  textAnnotations: TextAnnotation[]
  /** freely drawn divider lines and simple shapes */
  drawingElements: DrawingElement[]
  /** selectable regions (named parts or drawn shapes); optional, additive */
  areas?: Area[]
  /** counted sets of areas and sites; optional, additive */
  groups?: SurfaceGroup[]
  /** stable display/authoring order for landmark groups, including empty groups */
  landmarkGroupOrder: string[]
  /** groups hidden from canvas markers (they remain editable in the panel) */
  hiddenLandmarkGroups: string[]
}

/** A callout fully resolved against the active view, ready to render. */
export interface ResolvedCallout {
  /** Optional text-block offset from labelPos; lets a label sit above a leader. */
  labelOffset?: Vec2
  labelAlign?: TextAnnotationAlign
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
  leaderWidth: number
  fontSize: number
  fontWeight: FontWeight
  labelPos: Vec2
  elbow: Vec2 | null
  color: string
  visible: boolean
  /** 1-based number used in 'numbers' mode and the legend */
  index: number
  imageId?: string
  siteId?: string
}
