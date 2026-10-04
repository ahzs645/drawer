# Reconstructed clinical charts and dioramas

Drawer includes twenty independently placeable SVG views reconstructed from the three supplied illustrations. The geometry is authored in JavaScript as cubic Bézier contours, with separate named detail paths. Rebuilding the artwork does not read a bitmap or invoke a contour tracer.

## Included views

| Chart | Views | SVG paths | Named SVG targets | Landmark points |
| --- | ---: | ---: | ---: | ---: |
| Body | 4 | 191 | 213 | 58 |
| Hands | 4 | 60 | 70 | 52 |
| Feet | 12 | 126 | 150 | 78 |
| Total | 20 | 377 | 433 | 188 |

Body views are anterior, posterior, left-facing profile and right-facing profile. The profile names describe image orientation: the source has no label establishing their clinical laterality.

Hand views preserve the supplied orientations: right and left palms with fingers down, and left and right dorsal hands with fingers up. Foot views comprise toe front, plantar, heel rear, medial side, lateral side and dorsal oblique for each side. Hand/foot laterality follows the source captions; the more specific view names are editorial descriptions.

Each SVG has a local frame, named parts, and an opaque white silhouette with black linework. These can overlap cleanly in a diorama. Chart labels are independent editable text; they are not mirrored with the artwork.

## Open and edit

1. Open **Clinical charts & dioramas** above the canvas.
2. Open a complete body, hand or foot chart, or the combined **Clinical atlas — all 20 views**.
3. In **View library**, filter by region, side or text and use **+ Add view** to insert a specimen into the current document. Adding a view expands a page-framed document to contain it.
4. In **Layout table**, change X/Y, width or angle and press Enter. Width preserves aspect ratio. The canvas supports ordinary dragging and the existing resize/rotate handles.
5. Use **Arrange visible views** for a grid. It preserves each image's size and angle, carries its attached text and markers, includes their complete footprints, skips fixed objects and grows the page. A single Undo restores the previous arrangement.
6. Save with **Save project**. Reopen the `.drawer.json` with **Open project**. The supplied `.scene.json` files also open through this control.

The dioramas are two-dimensional compositions. Drawer edits view placement, points, labels, selectable regions and their connections. Individual Bézier nodes remain editable in the SVG files and the authored geometry modules.

## Shared sites and connections

The hand chart contains twelve illustrative shared sites: wrist and five fingertips on each hand, each connected across its palmar and dorsal view. The foot chart contains four shared regions: left/right heel and great toe, with placements on the views that show them. The atlas combines these into **16 sites and 42 placements**. The body views supply landmark catalogs without imposing a particular assessment site list.

The **Connections** table uses sites as rows and placed images as columns:

- A count selects an existing placement. An adjacent **+** adds another on that view.
- An empty cell's **+** starts placement constrained to that image. Clicking another image does not create a marker. Escape or **Cancel placement** cancels.
- A site row selects the shared label and application field key for editing in the sidebar. The example keys use the `example.` prefix and have no external terminology codes.
- **Show selected connections** works with or without a printed legend.
- The matrix reports hidden markers. Selecting a marker can switch to **Site numbers**, while a hidden image must be shown explicitly in the Layout table.

Scenes open in **Clean artwork**, which hides their supplied example markers. **Site numbers**, **Site names**, **Field values** and **Blank markers** retain the editable placements. Matrix placement chooses a marker view first and preserves the clean view's imported visibility settings. Custom annotations follow the normal per-view visibility controls.

## Anatomy, artwork and provenance

The reconstruction keeps the source compositions and major contours, with manually authored fingers, toes, creases, nails and facial details. Paired hands and feet use explicit reflected masters; body front and back are separately drawn, while opposing profiles reuse a reflected construction. This regularizes small bilateral differences in the source.

The main remaining visual differences are the more uniform stroke weights and approximations in facial expression, small toe/finger curves, and some body knee/calf contours. Landmarks are illustration attachment points, not independently validated clinical locations. Review anatomy and laterality before using these assets in a clinical form.

The reference filenames, source dimensions, per-view source rectangles, target IDs and local landmark coordinates are recorded in `public/samples/clinical/manifest.json`. Sources are:

- `Four-view clinical body chart(1).png` — 1575 × 999.
- `Labeled hand views in four positions(1).png` — 1254 × 1254.
- `Twelve-view left and right foot chart(1).png` — 1816 × 866.

Original raster images are comparison inputs, not embedded in the vector assets. Scene source notes survive project saving and are included as inert SVG export metadata. Reconstructed source text uses editable Arial/Helvetica/sans-serif labels, without asserting the original font's identity.

## Rebuild and extend

```bash
pnpm run build:clinical
pnpm run check:clinical
pnpm test
pnpm build
```

The first command regenerates thirty deterministic files: twenty individual SVGs, three complete SVG sheets, four native scenes, and three catalogs/manifests. `check:clinical` compares generated bytes with the committed files.

Geometry modules:

- `scripts/clinical-body.mjs`
- `scripts/clinical-hands.mjs`
- `scripts/clinical-feet.mjs`
- `scripts/build-clinical-assets.mjs` — validation, SVG serialization, catalogs and native scene composition.

For an offline comparison viewer, install Pillow, NumPy and CairoSVG in your Python environment and run:

```bash
python scripts/compare-clinical-vectors.py \
  --references /path/to/supplied-images \
  --output /path/to/comparison-kit
```

The references directory must contain the three original filenames listed above. This renderer creates side-by-side images, source-coordinate overlays and an offline `comparison.html`; it never generates or changes the SVG geometry. It also copies the assets and scene files. Full browser-saved projects, code patch and test evidence are supplied separately in the finished kit.

Each module returns a pack with source metadata and assets `{id, name, x, y, width, height, inner, side, view, landmarks}`. `x/y` place the asset in the original chart; its inner SVG and landmark coordinates use the local frame. Stable IDs allow an improved SVG to replace earlier artwork while retaining attachment targets.

The scene importer additionally supports:

| Field | Meaning |
| --- | --- |
| `assets[].landmarks` | Local `{id, label, x, y, targetId?}` catalog, cloned independently per placed image. |
| `links[].targetId` | Attach a frame-relative `u/v` point to a named SVG part without moving it. |
| `images[].flipX` | Preserve horizontal mirroring. |
| `texts[].align` | `start`, `middle` or `end`. |
| `pageRule: false` | Omit the legacy skin-assessment header line. |
| `cleanView: true` | Add an initial clean artwork view. |
| `provenance` | Bounded flat string metadata retained in the document and SVG export. |

Missing target references and malformed coordinates fail import explicitly. Delayed sample/template responses are discarded after a later project-opening or undo/redo action, and opening a template retains the previous document in Undo history.

## Verification

The integration was checked with **39 passing model tests**, **39 clinical browser checks**, **43 existing editor browser checks**, the production TypeScript/Vite build, and the deterministic artwork check. Legacy SVG appearance is still compared against the original golden hashes after removing the additive provenance node.

The clinical browser test starts its own Vite server:

```bash
PLAYWRIGHT_MODULE=/path/to/playwright \
CHROMIUM_PATH=/path/to/chromium \
node scripts/test-clinical-browser.mjs /path/to/results
```

If Playwright and its browser are already installed normally, omit the two environment variables. The browser checks exercise real controls for loading, filtering, movement, resizing, rotation, grid placement, connections, saved projects, autosave and narrow layouts; they also test delayed-request cancellation.
