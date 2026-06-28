# Contributing to Drawer

Thanks for your interest! Drawer is a semantic SVG annotation editor for
medical/anatomy diagrams, licensed under **AGPL-3.0**.

## Development

```bash
pnpm install
pnpm dev         # http://localhost:5173
pnpm typecheck   # tsc --noEmit
pnpm build       # typecheck + production build
```

## Project shape

The model is the source of truth and is **framework-agnostic** — keep it that way:

- `src/types.ts` — data model (`DrawerDoc`, `Anchor`, `Callout`, `View`, …)
- `src/geometry.ts` — pure coordinate transforms + leader/balloon geometry
- `src/resolve.ts` — pure `callout × view → ResolvedCallout`
- `src/svgParse.ts` — import/sanitize SVG into a `BaseDrawing`
- `src/store.ts` — Zustand store; all document mutations + undo/redo history
- `src/components/` — the React/SVG canvas, toolbar, inspector, views
- `src/export/` — static SVG (with metadata), PNG, and project JSON

Prefer adding logic to the pure modules (geometry/resolve/export) over the
components, so it stays reusable (e.g. for a future tldraw adapter).

## Guidelines

- Keep `pnpm build` green (TypeScript strict, no unused locals).
- Match the surrounding code style; no new heavy dependencies without discussion.
- Anchors are stored **normalized** (to the content box or a target element's
  box) — don't bake in absolute pixel coordinates.
- By contributing, you agree your contributions are licensed under AGPL-3.0.

## Licensing of contributions

All contributions are accepted under the project's AGPL-3.0 license.
