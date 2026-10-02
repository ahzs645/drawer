# Foot-artery template, mappings, attachments and rendering

## Scope and status

Prepared against `ahzs645/drawer` main commit `abd7f35e5b390ee1fc19a5273f4f4bee8951bae5`.
This change extends Drawer's existing document, anchor, view, history, project-I/O and renderer structures. It does not introduce a separate production document format or an external storage service.

The supplied foot schematic was reconstructed as editable SVG paths, vector stipple dots, text and leaders. It is a cleaned reconstruction, not a pixel-identical trace or an exact font match. Source point positions are retained in a 726 × 701 coordinate system. The default label uses “malleolus”; the delivery kit also includes a source-spelling SVG with “maleolus”. Anatomy and terminology mappings have not been independently validated. No clinical codes are preassigned.

## Native UI workflow

After applying this patch, run the normal application build and open Drawer. Choose **Foot-artery template**. Replacing an open drawing prompts for confirmation; export the old project first. Open **Mappings & attachments**, then select a callout from the dropdown or canvas.

Assign an SVG attachment target, external field key and optional mapped display name, code system and code. To change the point's target without relocating it, select another target. **Center point on attached element** deliberately changes its location. Labels can contain newlines and can be offset independently of the leader endpoint. Existing canvas dragging continues to work.

Choose a label source for the active names view: original label, mapped display name, mapped value, or mapped name plus value. Supply flat scalar values as JSON. Numbered and blank views continue to suppress textual labels. Existing per-view label overrides take precedence over mapped text.

Use the existing project export to retain the complete drawing and its new fields. The mapping-manifest button exports only identities, coordinates and mapping assignments; it is not a complete editable project. The standalone HTML in the delivery kit is a proof interface using the same compiled core and SVG exporter, not the full React application.

## Stable targets

| Anchor ID | SVG target ID | Source point |
| --- | --- | --- |
| `anchor-posterior-tibial` | `site-posterior-tibial` | 441, 302 |
| `anchor-peroneal` | `site-peroneal` | 307, 380 |
| `anchor-anterior-tibial` | `site-anterior-tibial` | 384, 387 |
| `anchor-dorsalis-pedis` | `site-dorsalis-pedis` | 388, 534 |

These are local authoring IDs, not standard medical codes. Each named site is an invisible 12 × 12 SVG rectangle with a center-normalized anchor. The foot silhouette, creases, nails, frame and stipple are separate artwork. Decorative dots are excluded from attachment-target enumeration.

Edit `public/samples/foot_arteries_base.svg`, preserve these IDs, then run:

```sh
node scripts/sync-foot-artwork.mjs
node scripts/sync-foot-artwork.mjs --check
```

This updates the bundled template literal without requiring network fetches or a deployment-root-specific asset URL.

## Data contract

All additions are optional in the existing version-1 project document. Apply the patch before opening the included project: old renderers do not understand multiline layout offsets and mapping modes.

```ts
anchor.mapping = {
  fieldKey: 'demo.site',       // Literal external key; dots are not path traversal.
  display: 'Example site',    // Optional display label.
  system: 'urn:example',      // Optional user-supplied code system; not inferred.
  code: 'EXAMPLE'             // Optional user-supplied code.
}
doc.mappingValues = { 'demo.site': 'Test value' }
view.mappingMode = 'label-value'
```

Values support string, finite number, boolean and null. Missing/null values display an em dash; `0`, `false` and the empty string are preserved intentionally. Expressions are not evaluated. Reserved prototype-related keys and non-scalar values are rejected. SVG text and metadata are escaped. `includeMetadata: false` suppresses mapping metadata, but **does not redact values that are visibly rendered as labels**.

Mappings live on anchors, not on rendered text, so they are retained when label wording, positions or view formats change. Reference images also belong to anchors.

## Two meanings of attachment

**Geometric attachment:** `attachAnchorToTarget` associates an anchor with a named SVG target. `replaceBaseKeepingMappings` rejects missing referenced IDs rather than silently retargeting points to the whole drawing. Transformed target boxes are measured in the root coordinate system. Target centers remain correct under tested translation, scale and nested rotation.

This remains bounding-box-relative attachment, not mesh or anatomical registration. Arbitrary off-center coordinates in rotated shapes are relative to their transformed axis-aligned bounding boxes, not a full local affine coordinate frame. Labels and elbows retain their document-space positions when the artwork is replaced; reposition or arrange them if a new layout requires it. Unsupported path-offset anchors are rejected for replacement. Absolute anchors block replacement when the declared viewBox changes. Existing missing targets are surfaced for manual reattachment; importing a legacy document is not proof its anatomy is registered correctly.

**Reference-file attachment:** PNG, JPEG and WebP images may be associated with an anchor. Uploads verify byte signatures, MIME consistency, size and actual image decoding. Limits are 1 MiB per image and 2 MiB total per project. SVG, HTML and PDF are not supported reference types in this change. Imported reference data is also checked for duplicate IDs, size and format consistency. References are previewed in the panel and retained in project JSON, but are not printed or embedded into SVG exports.

The live app's existing browser autosave also stores these project fields. There is no server upload, attachment-management service, encryption feature, access-control system or clinical-record integration added here. Use non-patient test data. Export projects explicitly; attachment-heavy projects can exhaust browser storage. Autosave failures now produce a visible status message. The standalone proof has no automatic persistence.

## Renderer and import changes

The React callout component and SVG exporter use the same multiline line positions and resolved mapping labels. Normal marker sizes, dash spacing and stroke widths are aligned; selection decorations are intentionally editor-only. The exporter measures multiline block extents and offers an explicit `viewBox` override for matching the supplied crop. Automatic text bounds are estimates, not font shaping; visually check unusually long text and non-Latin labels. An explicit source crop can intentionally clip labels dragged outside it; use automatic fit for publication layouts.

SVG import now uses a restricted self-contained SVG subset. Scripts, `foreignObject`, animation, embedded images, style elements and external resource references are removed. Supported inline presentation properties and local clip references are retained. Duplicate/reserved target IDs are rejected, and target geometry is recomputed from sanitized project markup in the browser. This is a deliberately restrictive importer, not a separately audited general-purpose SVG security library. Existing SVGs depending on embedded stylesheets, images or unsupported elements need regression review before upgrading. Sanitization now requires a browser DOM instead of returning raw markup in non-DOM environments.

## Verification

The supplied reports record 52/52 Chromium core checks, 9/9 standalone interactive checks, strict compilation of the dependency-free TypeScript core, and syntax-only transpilation checks for the three affected TSX files. The core suite includes mapping edge cases, attachment upload/round-trip, target transformation and missing-target rejection, sanitized SVG import, export metadata, and source/auto-fit label bounds. The standalone suite covers actual file controls, download/reopen, undo/redo, pointer dragging and a 390-pixel viewport.

The complete React/Vite application, its dependencies, all existing samples and site-wide end-to-end behavior were **not** built or exercised in the preparation environment. TypeScript transpilation is not a substitute for a full application typecheck. No changes were pushed or deployed.

Run the full application checks after applying:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

Optional reproducible browser-core suite (requires Python Playwright and Chromium):

```sh
python -m pip install playwright
python -m playwright install chromium
python scripts/test-diagram-browser.py --output ./diagram-proof
```

Use `--chromium /path/to/chromium` for an existing browser, and optionally `--reference /path/to/source.png` for a different real PNG fixture. The suite first runs strict TypeScript compilation. It writes a standalone native-core proof and a JSON test report and exits nonzero on failures. It deliberately does not assert full React UI compatibility.
