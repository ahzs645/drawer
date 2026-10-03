# Multi-image pages and shared site tables

Drawer documents can hold several drawings on one page, each moved, resized and
rotated on its own, plus a **site table**: numbered locations that can be marked on
more than one drawing. Everything happens in the regular editor. There is no
separate composer and no snapshot step.

The two skin-assessment templates (**Load sample… → Multi-image templates**) show
the feature end to end: four body drawings, 22 numbered pressure-injury sites with
27 markers (sites 6, 7, 10, 12 and 22 are marked on two poses), 11 anatomy labels,
headings, credits and a movable legend.

## Images

Every document has a list of images (the **Images** panel). A drawing opened the
usual way, with **Load sample**, **New…** or an older project file, becomes the first
image, placed exactly where it used to be. Older files open unchanged and keep
their points where they were.

- **Add**: **+ Add sample…** adds a bundled body; **+ Add image…** adds an SVG,
  PNG, JPEG or WebP from a file, pasted markup or a URL. New images go to the right
  of what is already on the page, at a matching height.
- **Move**: with the **Select** tool, drag anywhere inside an image's frame. Shift
  snaps to 8 units. Arrow keys nudge the selected image (Shift ×10).
- **Resize / rotate**: drag the corner handle (Alt frees the aspect ratio) or the
  round handle above the frame (Shift snaps to 15°). The inspector edits X, Y,
  width, height and rotation numerically; width and height keep the aspect ratio.
- **Mirror, lock, hide, layer**: mirror flips the drawing horizontally. Locked images
  can't be moved, resized or deleted. Dragging over a locked image pans the
  canvas. Hidden images, and everything attached to them, are left out of the
  canvas and exports. **Layer up/down** changes the stacking order.
- **Duplicate / Mirror copy**: copies the image with its points, callouts, per-view
  label positions, landmarks, attached text and shapes. Site markers on the image
  become extra markers of the same sites.
- **Delete**: removes the image and everything attached to it. Site rows stay, and
  the coverage check reports any site that lost its last visible marker.

Images can also carry **areas**, regions a form can select. They are stored in the
image's drawing space, so they follow the image, and duplicates and deletes cascade
to them. See [areas.md](areas.md).

Points belong to the image you click. Their coordinates are stored in that image's
own drawing space (`Anchor.imageId`), so they follow every move, resize, rotation
or mirror. Callout labels and elbows, and text or shapes attached to an image
(`imageId`), are carried along through the same transform. Landmarks are per image
too: the catalog groups of an added drawing are prefixed with its name. Dragging a
point onto a different image moves it to that image.

**Page**: the page frame is the export crop when **Export the page frame** is on;
otherwise exports fit the content as before. The templates use the page frame. With
it on, the coverage check also warns about images or a legend that extend beyond the
page.

**Reference overlay**: load a PNG/JPEG/WebP to draw over the page at adjustable
opacity, for tracing or checking placement. It is kept for the session only. It is
never saved, autosaved or exported.

## Sites

The **Sites** panel is the shared table: one row per site with its number, label,
application field key and markers.

- **+ Site** adds a row (numbered after the last one, with a unique `site.…` key).
- The **+** on a row (or **Place marker** in the site inspector) arms placement:
  the next click on an image adds a marker there. Esc cancels.
- Click a row, or a marker on the canvas, to select the site. Its markers and legend
  row are highlighted. **Show selected connections** draws dashed lines from the
  markers to the legend row (canvas only; never exported).
- The site inspector edits number, label, field key and an optional value. Numbers
  and keys must stay unique; renaming a key carries its value along. Each marker can
  be shown or hidden per view, selected, or removed.
- Any callout can be linked to a site (or unlinked) from the callout inspector; a
  linked callout takes the site's number and label.
- The **coverage check** lists sites without a visible marker in the current view.
- **Export → Sites CSV** writes one row per marker (site, image, page coordinates,
  visibility). Formula-like text is neutralized; values are left out.

Markers default to the **Numbered badge (on point)** style: a filled circle with the
number knocked out, sitting directly on the point with no leader. It is an ordinary
callout style (`balloonShape: 'badge'`, `leaderStyle: 'none'`), so it is also
available as a preset for any callout, and site markers can use any other style.

Each view has a **Site markers** setting: numbers, numbers + names, numbers + values
(from the document's mapping values, keyed by the site's field key) or blank. Other
callouts keep following the view's mode. In a numbered view they are numbered after
the highest site number, and the generic legend lists only them. The site legend is
drawn on the page and in exports. Drag it on the canvas; its heading, font size, row
height and visibility are in the Sites panel.

## Data model additions

| Field | Meaning |
| --- | --- |
| `DrawerDoc.images[]` | `ImageInstance`: `drawing` (a `BaseDrawing` in its own coordinates) placed by `x, y, width, height`, `rotation` about the box center, optional `flipX`, `visible`, `locked`, `source` |
| `DrawerDoc.base` | now the page; its `viewBox` is the page frame. Older files' artwork is migrated into `images[0]` on load (`normalizeDoc`) |
| `Anchor.imageId`, `Landmark.imageId` | the drawing the point is stored in |
| `TextAnnotation.imageId`, `DrawingElement.imageId` | the item moves with that image |
| `DrawerDoc.sites[]` | `{ id, number, label, fieldKey }`; values stay in `mappingValues[fieldKey]` |
| `Callout.siteId` | the callout is a marker of that site |
| `DrawerDoc.siteLegend` | position, heading, font size, row height, visibility |
| `View.siteDisplay` | `numbers` · `names` · `values` · `blank` |
| `DrawerDoc.exportFrame` | `content` (default) or `page` |

The pure logic lives in `src/docModel.ts` (migration, image placement, duplicate and
delete cascades, sites, coverage, CSV), `src/geometry.ts` (drawing↔page transforms,
hit-testing) and `src/resolve.ts` (site display and numbering). Project files stay
version 1: new fields are additive, and older files are migrated on open.

## Scene files

**Open project** also accepts `drawer-scene` files (`*.scene.json`), the format the
earlier standalone diorama composer used, and converts them to a regular document:

- assets → sanitized, measured image drawings
- images → placements
- sites → site rows (non-empty values → mapping values)
- connections → site markers
- anatomy labels → straight-leader callouts
- texts (and their rules) → text and lines, attached to their image where they were
- the legend → the site legend

Validation rejects missing references, duplicate IDs, site numbers or field keys,
reserved keys and out-of-range numbers. The two templates in
`public/samples/diorama/` are scene files loaded this way:

| Template | Artwork |
| --- | --- |
| `skin-assessment-library.scene.json` | the four bundled body SVGs, original paths unchanged; marker positions recalibrated by hand, approximate |
| `skin-assessment.scene.json` | contour traces of a supplied reference flowsheet (`scripts/rebuild-skin-assets.py`, which also writes the standalone `public/samples/diorama/*.svg` traces) |

To rebuild the traced drafts from the original screenshot (not included in the repo):

```sh
python -m pip install Pillow numpy opencv-python
python scripts/rebuild-skin-assets.py /path/to/image.png --reference-output reference.png
```

The crops and coordinates match that screenshot resampled to 1651 × 928. The script
masks printed badges and some leader/text ink before vectorizing. Detail hidden
under the source badges cannot be recovered.

## Privacy

The example keys such as `skin.sacrum` are application placeholders, not validated
clinical terminology codes. This is a drawing tool, not a patient-record system or a
validated clinical assessment. Site values are document data. Like all mapping
values, they are saved in project files and the browser autosave, so use test data
only. The Sites CSV leaves values out. The reference overlay is never stored.

Imported artwork goes through the existing SVG sanitizer (no scripts, event handlers,
external resources or non-fragment URLs). Scene and project files are size-bounded
and validated before they replace the open document.

## Tests

```sh
pnpm test                                   # pure model tests (Node 22+, no browser)
pnpm build && pnpm preview &                # then, with Playwright + Chromium available:
node scripts/test-app-browser.mjs http://localhost:4173/ artifacts/browser-checks
```

The browser script drives the real app. It covers:

- the templates, and moving, resizing and rotating images (markers follow; undo
  works)
- placing markers and re-homing them onto another image
- site edits and validation, view site modes and connection lines
- duplicate, mirror, delete and hide images, and the coverage warnings
- adding sample and pasted images, and part-targeted callouts on an added image
- SVG and CSV export, project save and reopen, opening a scene file, autosave restore
- the reference overlay (checked that it is never saved) and the page frame

## Artwork and scope limits

The templates recreate the supplied arrangement and make every element editable.
They are not a pixel-perfect facsimile and have not had independent anatomical
review. The traced artwork is a contour draft with some jagged or interrupted
strokes. Marker positions are geometric associations, not evidence of clinical
correctness.

The supplied form's attribution is kept as source text. Its statement about
permission for a 2016 adaptation is historical attribution, **not a new permission
grant**. Confirm reuse rights for the artwork and form before publishing or clinical
use. Drawer's AGPL-3.0-only license covers the code, not the source artwork.
