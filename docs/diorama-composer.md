# Multi-image diorama composer

Integration base: `ahzs645/drawer`, commit `24b9ce6d933c8a8970e12997474c286ff6dc0e81` (main inspected October 2, 2026).

## What this adds

A separate multi-image workspace inside Drawer, launched by **Open diorama composer**. The original single-image editor is unchanged until the user explicitly chooses **Open snapshot in Drawer** and confirms replacement of its active document.

The supplied skin-assessment scene has four independently movable SVG image instances, 22 shared pressure-site rows, 27 numbered connections, 11 image-attached anatomical labels, headings, a movable legend and source credits. Sites 6, 7, 10, 12 and 22 each appear in two poses; those placements point to the same site row, not independent copies of its label.

The source scene is not a flattened screenshot. Artwork, image transforms, site definitions, image-local attachment coordinates, labels and page text are separate data. The supplied body artwork is nevertheless a **scan-derived contour draft**, not newly validated anatomical illustration.

## Use

Select an image on the page or in the image list. Drag it, use its bottom-right resize handle, or edit X, Y, width, height and rotation. Aspect ratio is preserved by the resize handle unless Alt is held; width/height fields allow independent dimensions. Shift snaps image dragging to an 8-unit grid. Arrow keys move by one unit; Shift+arrow moves by ten. Image movement and each marker drag are single undo transactions.

Select a site number in the table to inspect every placement of that site. A row's label and application field key are shared across all its placements. **+ Link** followed by a click on a figure creates a placement. **Pick on image** relocates an existing placement, including onto a different unlocked figure. The image selector can also reassign a placement while retaining its normalized coordinates. Local X/Y fields show percentages within the image, not page percentages. Dragging a marker changes those local coordinates without moving the figure.

**Duplicate + links** creates an independent image instance with copied connections but the same site definitions. Hide retains the data; Delete removes that image and its placements, retains the site rows, and reports lost visible coverage. Lock blocks edits to the image and its attachments. Layer up/down changes image stacking. Text labels remain upright and keep their page-level font sizes when images rotate or scale; their positions follow the image.

The connection table is searchable by site, field key or connected image name. It can export one CSV record per placement. New rows can be added with **+ Site**. The legend displays the shared rows; selected-connection lines are optional authoring aids and are excluded from clean exports.

**+ Drawer sample** imports a supported SVG from the repository's existing sample registry. **+ Import SVG** imports local geometric SVGs. **+ Existing asset** creates another instance of an already loaded asset. The bundled template is loaded only when no valid source-scene autosave exists. It does not replace the user's standard Drawer document on opening.

## Two formats — do not confuse them

| File | Purpose | Independent image transforms? |
|---|---|---|
| `skin-assessment.scene.json` | Authoritative source; open with **Open scene** in the composer | Yes |
| `skin-assessment.drawer.json` | Explicit one-way snapshot for the existing Drawer v1 editor | No; artwork is consolidated into its single base |
| `skin-assessment.svg` / `.png` | Clean publication/rendering output from the composer | SVG has vector groups; neither is the source scene |
| `pressure-site-connections.csv` | Audit/export of site-to-image associations | Contains image IDs and local coordinates |

The standard snapshot contains 38 native anchors/callouts: 27 numbered placements and 11 anatomical callouts. Repeated sites keep separate native anchors with the same application `fieldKey`. A names-mode view with explicit blank label overrides preserves original badge numbers; switching to the legacy generic Numbers mode will renumber by callout order. Avoid that mode for the reference numbering.

**Legacy appearance limitation:** the current Drawer callout renderer always uses white balloon fills and does not support the composer's black/white source badges. The supplied native snapshot therefore uses the legacy number presentation; it is not the authoritative visual proof. Use the composer's SVG/PNG exports for the black badges and the shared table/legend. The snapshot legend is consolidated into base artwork. Later edits in the regular editor do not flow back to the source scene or update that consolidated legend. Reopen the composer for multi-image editing, then export a new snapshot.

## Architecture

- `src/diorama/core.js`: validated scene data, image transforms/inverse transforms, normalized connections, coverage checks, SVG renderer, CSV/native snapshot exporters and bounded transaction history. Dependency-free ES module.
- `src/diorama/editor.js`: actual interactive editor, scoped to a Shadow DOM root. The offline demonstration and React integration mount this same implementation, not separate lookalikes.
- `src/diorama/styles.js`: isolated, responsive editor styles.
- `src/diorama/editor.d.ts`: TypeScript interface for the React wrapper.
- `src/components/DioramaWorkspace.tsx`: lazy template loading, sample registry integration, lifecycle cleanup and explicit publishing through the existing `parseProject` and `loadDoc` functions.
- `src/App.tsx`: only an import and the workspace-launcher component are added.
- `public/samples/diorama/`: self-contained source scene and four SVG assets.

A site contains `id`, stable `number`, `label`, `fieldKey` and optional `value`. A connection contains its own `id`, `siteId`, `imageId`, normalized `u`/`v`, visibility and badge radius. An image instance references an asset and stores position, dimensions, rotation, visibility and lock state. Transforming an image does not rewrite its local connection coordinates. The shared row is the authority for numbering, labels and application field mappings.

## Privacy and import boundaries

The example keys such as `skin.sacrum` are **application placeholders**, not validated clinical terminology codes. This is not a patient-record system, a validated clinical assessment, or an approved replacement for an organizational form.

Entered field values remain in session state and undo history. By default values are removed from scene downloads, native snapshots, CSV and visual downloads; values-mode visual exports revert to numbers unless **Include entered field values** is checked. Values are never placed into browser autosave by this composer. Names, artwork, field keys and layout are saved locally when storage is available. Do not enter identifying information into names, labels or artwork. A published snapshot with value export enabled may subsequently be autosaved by the existing Drawer editor. Use **Save scene** because storage can be unavailable or full; the UI reports failures.

The reference PNG is an optional local overlay. It is not part of source-scene serialization, native exports or clean SVG/PNG exports. The offline proof contains the supplied scan solely to make visual comparison possible; the repository patch does not include it.

SVG importing uses a positive list of geometric elements and attributes. Scripts, external resources, embedded raster images, `use`, `foreignObject`, document types and entities are rejected. IDs, event handlers and style attributes are removed. Basic inherited root fill/stroke settings are preserved. Convert advanced SVG effects, CSS-dependent illustrations, gradients, clipping, masks, symbols or fonts to supported paths before import. This is deliberately not a universal lossless SVG importer. Rejection happens before mutation. JSON input is bounded and validates IDs, references, finite coordinates, dimensions, unique site numbers, unique field keys and scalar values. Formula-like CSV fields are escaped as text.

## Rebuild and test

No new runtime dependency is needed in the existing Drawer project.

```sh
node --test tests/diorama-core.test.mjs
node scripts/build-diorama-offline.mjs artifacts/drawer-diorama-demo.html
# Optional second argument embeds your locally held PNG reference:
node scripts/build-diorama-offline.mjs artifacts/drawer-diorama-demo.html reference.png

# Browser tests: install Playwright and Chromium separately.
python scripts/test-diorama-browser.py artifacts/drawer-diorama-demo.html \
  --output artifacts/diorama-tests --chromium /usr/bin/chromium

# Existing repository production checks (run after applying the patch):
pnpm install --frozen-lockfile
pnpm run build
```

The browser test script requires the proof with the optional reference image for its overlay/download test. On systems where Chromium is elsewhere, supply its actual path. The generated offline HTML has no external script, font or network dependencies and can be opened directly in a modern browser. Browser policies may disable localStorage for local files; source downloads remain available.

To rebuild the contour drafts from the exact user-supplied screenshot:

```sh
python -m pip install Pillow numpy opencv-python
python scripts/rebuild-skin-assets.py /path/to/image.png --reference-output reference.png
```

The coordinates/crops intentionally match the supplied screenshot resampled to 1651 × 928. They are not a generic segmentation model. The script masks printed badges and some leader/text ink before vectorization. Missing detail beneath source badges cannot be recovered by this operation. Reference crop PNGs are generated locally for comparison but are not included in the source patch.

## Verification performed for this delivery

**57/57 Node tests** and **20/20 Chromium checks** passed. Browser checks include actual drag/resize/rotation, individual marker relocation, shared row edits, table filtering, new/reassigned connections, duplicate/hide/delete/lock behavior as applicable, undo/redo, JSON import rejection, SVG sanitization, SVG/PNG/CSV/JSON downloads, value redaction, page/legend edits and a narrow-screen smoke check. A layout-section collapse bug found during testing was fixed and retested. Test reports are in the delivery kit.

The full React/Vite production build (`pnpm run build`, including `tsc --noEmit`) passes with the composer integrated, and both composer buttons were smoke-tested in Chromium against the built app (scene renders, snapshot publishes into the regular editor without page errors). Persistent refresh restoration has not been exercised in an automated test; graceful session-only behavior was exercised.

## Artwork and scope limits

This recreates the supplied arrangement and makes its elements editable, but does not claim pixel-perfect facsimile or independent anatomical review. Some strokes remain jagged and some outlines are interrupted by removed source badges/leader lines. The cleaner artwork pass should replace image assets in the source scene, checking attachments afterward. Image-local coordinates are geometric associations, not evidence of clinical correctness.

The supplied image's attribution is retained as source text. Its statement about permission for a 2016 adaptation is historical source attribution, **not a new permission grant**. Confirm artwork/form reuse rights through your organization before publishing or clinical use. The new code is intended to be integrated under the repository's existing AGPL-3.0-only code license; source artwork is not automatically relicensed by that code license.
