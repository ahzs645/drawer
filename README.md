# Drawer

**A semantic SVG annotation editor for medical / anatomy diagrams** — import a clean
body-silhouette SVG, click a point on the body to drop an anchor that *locks to that
location*, generate a draggable SolidWorks-style balloon/leader callout, switch between
label-set "views", and export a **static** SVG/PNG that still carries the
label-to-location relationships as metadata.

It turns a flat raster diagram (body + lines + labels baked into one image) into
structured, reusable layers:

```
base body drawing  +  anchor points  +  leader lines  +  labels / balloons  +  metadata
```

so the same diagram can be relabeled, renumbered, blanked for a quiz, or translated —
without losing which label points at which anatomical structure.

## Why anchors instead of drawn lines

A leader line here is **generated**, not drawn. Each callout stores an *anchor* — a
point locked to the body — and the leader is computed from the anchor to a draggable
label. Move the word "Scapula" anywhere and its leader still points at the scapula.

Anchors are stored **normalized** to the drawing's content bounding box
(`nx, ny` in `0..1`), so they survive scaling and stay meaningful if you redraw or swap
the body art. (`absolute` and `path-offset` modes also exist in the model.)

## What you can do

- **Load a body** — bundled views (standing front/back, back, half-body front/back,
  side-lying, seated wheelchair, plus a multi-part *torso organs* demo) or **Import** any SVG.
- **Add callout** — click the body to anchor a point; a leader + label appear. Clicking a
  *named part* of a multi-element SVG (e.g. the heart in the organs demo) anchors to **that
  element**, normalized to its bounding box, so it tracks the part. Re-target or detach any
  anchor from the inspector’s “Anchored to part” menu.
- **Drag** the label (per-view position), the white anchor dot (body-locked, affects all
  views), or the small square to bend the leader into an elbow.
- **Edit** label text, balloon shape (none / circle / hexagon), number/code, leader style
  (straight / elbow), and color in the inspector.
- **Views (label sets)** — switch the whole diagram between modes:
  - **Names** — anatomical labels with leaders (like the original reference)
  - **Numbered** — SolidWorks-style numbered balloons + an auto legend
  - **Blank quiz** — empty balloons for student worksheets
  - **Translations** — a names view where each callout's visible label can be overridden
    per view (e.g. a *Français* view: Chin → Menton), falling back to the canonical
    default. The exported `data-name` stays the canonical term while the visible text
    is translated.
  Each view keeps its own label positions, per-callout visibility, and label text, so
  one document produces many figures.
- **Export**
  - **SVG** — a standalone static file. Each callout is wrapped in
    `<g class="callout" data-callout-id data-name data-anchor-mode data-nx data-ny …>`
    so the label↔location link is preserved inside the flat output.
  - **PNG** — rasterized at 2× for handouts/slides.
  - **PDF** — a single-page **vector** PDF (paths + text stay crisp), page-sized to the
    figure. The PDF libraries are loaded lazily so they don't weigh down initial load.
  - **Save project** — full editable JSON (`*.drawer.json`); reopen with **Open project**.
- **Edit comfortably** — full **undo/redo**, **autosave** (your session is restored
  on reload), **zoom/pan** (wheel + `− Fit +` controls), and keyboard shortcuts.

### Keyboard

| Key | Action |
| --- | --- |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + Shift + Z` (or `Ctrl + Y`) | Redo |
| `Delete` / `Backspace` | Delete the selected callout |
| `Esc` | Deselect |
| Mouse wheel | Zoom to cursor; drag empty space to pan |

## Exported SVG shape

```xml
<svg viewBox="…" data-generator="drawer" data-doc-name="Standing — front / back">
  <g class="body-layer"><path …/></g>
  <g class="callout" data-callout-id="callout_…" data-name="Scapula"
     data-anchor-mode="relative-bbox" data-target="" data-nx="0.7" data-ny="0.23"
     data-anchor-x="…" data-anchor-y="…">
    <polyline …/>            <!-- leader -->
    <circle …/>              <!-- anchor marker -->
    <text>Scapula</text>     <!-- label -->
  </g>
  <g class="legend">…</g>     <!-- numbered / quiz views -->
</svg>
```

## Data model

| Entity | Role |
| --- | --- |
| `BaseDrawing` | imported body markup + `viewBox` + tight `contentBox` (for normalization) |
| `Anchor` | a point locked to the body (`relative-bbox` \| `absolute` \| `path-offset`) |
| `Callout` | anchor + default label/balloon/leader/color |
| `View` | a named label-set: `labelMode` (`names`/`numbers`/`blank`) + per-callout overrides |
| `DrawerDoc` | the whole document: base + anchors + callouts + views |

`resolve.ts` merges each callout with the active view to produce render-ready
`ResolvedCallout`s, shared by the canvas and the SVG exporter.

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production build to dist/
pnpm preview    # serve the production build
```

Stack: Vite + React + TypeScript, SVG-native rendering, Zustand for state, custom
pointer-drag with proper SVG-CTM coordinate transforms. No canvas/diagramming framework —
the output stays clean SVG.

### Layout

```
src/
  types.ts            data model
  geometry.ts         coordinate transforms + leader/balloon geometry (pure)
  resolve.ts          callout × view -> ResolvedCallout (pure)
  svgParse.ts         import SVG -> BaseDrawing (+ sanitization)
  store.ts            Zustand store (all document mutations)
  samples.ts          bundled bodies + demo landmark seeds
  components/         Canvas, Callout, Toolbar, ViewBar, Inspector, Sidebar
  export/             exportSvg (static + metadata), exportPng, projectIo (save/load)
public/samples/       the six body SVGs
```

## Roadmap

- Per-view balloon styles
- `path-offset` anchoring UI (snap along a stroke)
- Multi-page PDF figure sheets (one page per view)
- Auto-layout / collision avoidance for labels
- Multi-select and group move/delete

Implemented since the first cut: undo/redo, autosave + session restore, zoom/pan
controls, keyboard shortcuts, **anchor-to-element** (`data-target`), **per-view label
text** (translations), and **vector PDF export**.

## Extensibility / tldraw

The model, geometry, resolver, and exporters (`types.ts`, `geometry.ts`, `resolve.ts`,
`export/`) are pure, framework-agnostic TypeScript — the React/SVG canvas is just one
renderer. That keeps the door open to a future `@drawer/tldraw` adapter: the callout maps
to a custom tldraw `ShapeUtil` (whose `toSvg` can emit the same clean metadata), the anchor
to a custom `BindingUtil` (tldraw arrows already bind via a normalized relative anchor), and
placement to a custom tool. We keep the SVG-native app as the source of truth (clean export,
no watermark/licensing) and can layer a tldraw editing surface on the same core later.

> Note: tldraw's SDK is **not** OSI open source — production use requires a license key and
> shows a "Made with tldraw" watermark unless you buy a business license, and that obligation
> flows to downstream users. Our SVG-native stack has no such constraint, which is why Drawer
> can be fully open source (below).

## License

Drawer is free software licensed under the **GNU Affero General Public License v3.0**
([AGPL-3.0](./LICENSE)). You may use, study, share, and modify it. The AGPL's defining
condition: if you run a modified version as a **network service**, you must offer that
version's source to its users. The app's **“Source ↗”** link points back to this repository
to satisfy that obligation (AGPL §13).

Copyright © 2026 ahzs645 and contributors.

All runtime dependencies are permissively licensed (React, Vite, Zustand — MIT), so the
project carries no third-party copyleft or watermark obligations of its own.
