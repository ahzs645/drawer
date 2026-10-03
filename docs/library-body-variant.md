# Skin-assessment variant using Drawer body samples

This variant uses the existing **Body → Load sample…** vector library, not the earlier scan-traced bodies.

| Scene role | Exact Drawer sample | Original file |
| --- | --- | --- |
| Large anterior/posterior figure | Standing — front / back | `public/samples/standing_front_back_divider.svg` |
| Standing numbered figure | Standing — back | `public/samples/standing_back_view.svg` |
| Seated numbered figure | Seated — wheelchair | `public/samples/seated_wheelchair_side_view.svg` |
| Horizontal numbered figure | Side-lying | `public/samples/side_lying_view.svg` |

Source repository: `ahzs645/drawer`, inspected commit `24b9ce6d933c8a8970e12997474c286ff6dc0e81`.

The source files are byte-for-byte matches to their GitHub git-blob hashes. Body path data is unchanged, and the initial image instances preserve each source's aspect ratio. The build script checks hashes before rebuilding; changed artwork requires deliberate review/recalibration.

## Open the version you need

**Existing Drawer app:** use **Open project** and choose `skin-assessment-library.drawer.json`. This is a normal version-1 Drawer document with four bodies, 27 pressure-site callouts, 11 text callouts, and shared application field keys. It does not require the composer patch. Do not use **Load sample…** to load this complete document; that menu loads one body at a time.

**Movable, table-linked multi-image version:** open `drawer-library-demo.html` directly in a browser, or in the integrated composer use **Open scene** with `skin-assessment-library.scene.json`. The source scene is the master to retain for editing whole image instances. It contains 22 shared site rows, 27 numbered placements, four SVG assets/instances, 11 image-attached text callouts and three image-attached headings/figure labels.

The native Drawer project is a **one-way flattened snapshot** of the image arrangement, not a scene importer. Native callouts/anchors remain editable, but whole-image movement and the shared multi-image table belong to the composer. Native Drawer uses its own legacy outlined balloon styling; the composer's SVG/PNG exports preserve the filled black reference badges. Changes made in the ordinary Drawer editor do not flow back to the source scene.

## UI integration

`DioramaWorkspace.tsx` adds **Open library-body variant** next to **Open diorama composer**. The previous template remains available. The library version and the previous version have independent autosave keys:

- Integrated library version: `drawer:diorama:body-library:v1`
- Integrated previous version: `drawer:diorama:v1` (unchanged)
- Offline library version: `drawer:proof:body-library:v1`

The integrated sample picker uses the existing `SAMPLES` registry. The offline variant embeds these four source SVGs as data URLs, so **+ Drawer sample… → Seated — wheelchair** works without a network request. The original sample files in `public/samples/` are not modified.

Export names follow the scene ID: library files are named `skin-assessment-library.*`, rather than silently overwriting the earlier `skin-assessment.*` downloads. The default notice now comes from each scene's own provenance, rather than incorrectly describing every vector as newly traced.

## Rebuild and verify

From the repository root after applying the patch:

```bash
node scripts/build-library-variant.mjs artifacts/library-variant
node scripts/build-library-offline.mjs artifacts/library-variant/drawer-library-demo.html
node --test tests/diorama-core.test.mjs tests/library-variant.test.mjs
python scripts/test-library-browser.py artifacts/library-variant/drawer-library-demo.html \
  --output artifacts/library-browser-tests
pnpm run build
```

The browser test includes the reference-overlay export check. To run that exact test without manually attaching a reference, pass the supplied reference PNG as a second argument to the offline builder:

```bash
node scripts/build-library-offline.mjs artifacts/library-variant/drawer-library-demo.html /path/to/reference.png
```

Node build/tests have no npm dependencies. Browser tests require Python Playwright and Chromium; override `--chromium` as needed. The bundled offline HTML already includes the supplied PNG solely for its optional reference overlay; the overlay starts off and is excluded from exports.

The engine/source fixtures passed 70 Node tests, and the library editor passed 23 Chromium checks, including importing the exact wheelchair sample, dragging/resizing/rotating images, individual marker movement, shared labels/fields, connection reassignment, duplicate/delete/undo, source JSON, SVG/PNG/native JSON downloads and a narrow-screen smoke test. The full React/Vite production build (`pnpm run build`) passes with the variant integrated.

## Visual and clinical limits

All attachment locations were **recalibrated in the original samples' native SVG coordinates**; the old scan-relative percentages were not copied blindly onto replacement bodies. `marker-calibration.json` records every numbered placement, and `source-manifest.json` records the exact asset identities.

These remain approximate visual placements, not validated clinical sites or terminology codes. The source is a low-resolution educational diagram; hidden anatomy and small landmark details cannot be verified from it. This kit does not assert institutional permission or clinical approval. The supplied image's credits are acknowledged without reproducing a new “Used with permission” claim.
