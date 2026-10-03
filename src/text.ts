// ---------------------------------------------------------------------------
// Small pure text helpers shared by the app and the runtime-safe core
// modules (no app imports here: Webforms bundles the core on its own).
// ---------------------------------------------------------------------------

/** Turn an element id/slug into a display name: "lung_right" -> "Lung right". */
export function prettyName(id: string): string {
  const s = id.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id
}
