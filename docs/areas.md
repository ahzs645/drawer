# Areas and groups

A Drawer document can carry a **selection surface**: the parts of a drawing that a
form lets someone pick. It has three kinds of target on the same drawing:

- **Areas**: regions you select, such as a joint, a body part or a zone.
- **Sites**: numbered points you mark (the shared site table, see
  [multi-image-pages.md](multi-image-pages.md#sites)).
- **Marks**: symbols or strokes the person filling the form places. Each mark
  remembers the area and site it landed on, so an X on the left knee can count as
  selecting the left knee.

Forms use these together. Webforms' Drawer diagram field, for example, renders the
document and records which areas and sites were selected and where marks were
placed. Areas and groups are authored in the editor described here; marks are made
in the form at fill-in time.

## Defining areas

Areas are listed in the **Areas** panel, under the image they belong to. There are
three ways to define one.

1. **Named parts** (the most precise). **+ From named parts…** lists the named
   elements of an image's artwork: the ids from the original SVG. The handles Drawer
   assigns to unnamed elements (`el1`, `el2`, …) are not listed. Hover a row to see
   the part on the drawing, tick the ones you want and press **Create areas**. Each
   becomes an area whose outline is the element itself, labelled with the id
   prettified (`lung_left` → "Lung left"). A part that already has an area is shown
   as *added*. The **Torso organs** sample has named parts to try this on.
2. **Rectangle or ellipse.** Choose **Area** in the toolbar (or a shape in the
   Areas panel), pick ▭ or ◯ and drag on an image. Shift keeps it square or
   circular.
3. **Polygon.** With ⬠ selected, click each corner. Double-click, press Enter or
   click the first point again to finish (three points or more). Backspace removes
   the last point. Esc cancels.

An area belongs to the image under its first point and is stored in that image's
own drawing space, the same space as anchors with an `imageId`. Moving, resizing,
rotating or mirroring the image carries its areas along, and nothing in the area
changes. An area drawn off every image is stored in page space.

With the **Select** tool, click an area on the canvas (or its row in the panel) to
select it. Dragging an area moves its image. The area inspector edits the label and
an optional application field key, and shows the image and shape. Its **Counted in
groups** checkboxes set group membership. Delete or Backspace removes the selected
area. **Show on canvas** in the Areas panel hides or shows the outlines and labels
while you work. They stay in the document either way.

## Groups

A group is a named set of areas and sites that is counted together, like the 28
joints of a CDAI count. In the **Groups** section of the Areas panel:

- **+ Group** adds one.
- Click a group to open it. You can rename it, turn **Show the running count** on
  or off, and tick the areas and sites it contains. The row shows how many of each
  it has. While a group is open, its areas and site markers are highlighted on the
  canvas.
- **Delete group** removes only the group. Its areas and sites stay.

## Model

| Field | Meaning |
| --- | --- |
| `DrawerDoc.areas[]` | `Area { id, label, imageId?, shape, fieldKey? }` |
| `Area.shape` | `{ kind: 'part', targetId }` (an element id / `data-drawer-el` of the image's artwork, measured in `drawing.targetBoxes`), `{ kind: 'rect', x, y, w, h }`, `{ kind: 'ellipse', cx, cy, rx, ry }` or `{ kind: 'polygon', points }` |
| `DrawerDoc.groups[]` | `SurfaceGroup { id, label, areaIds, siteIds, showCount? }` (`showCount` defaults to true) |

Both lists are optional and additive. Project files stay version 1.

### What happens to areas when the document changes

- **Delete an area or a site**: it is also removed from every group.
- **Delete an image**: its areas are deleted and removed from groups.
- **Duplicate / Mirror copy**: the image's areas are copied onto the copy with new
  ids and the same shapes. A mirror copy's flip carries them along. Copies are not
  added to groups and do not keep the field key, so two areas never answer the
  same field without you choosing it.
- **Replace artwork**: refused when a part area names an element the new artwork
  lacks, as with part-targeted points.

### Loading

Opening a project (or the autosave) cleans the areas and groups instead of
rejecting the file. It drops malformed or duplicate entries, areas on images that
no longer exist, part areas with an empty target, shapes without a positive size
or with fewer than three polygon points, and group references to missing areas or
sites. Saving and reopening keeps everything else as it was.

## Code

| Module | Contents |
| --- | --- |
| `src/areaModel.ts` | pure document operations: add/update/delete areas and groups, membership, named-part listing, image cascades, load-time cleaning |
| `src/surface.ts` | geometry shared with form runtimes: outlines, centres, hit-testing, group totals, part tagging, mark markup |
| `src/export/exportSvg.ts` | renders drawn areas as `.drawer-area` shapes, and tags part areas in the artwork when given a selection state |
| `src/components/AreasPanel.tsx`, `AreaLayer.tsx` | the panel, the part picker, groups, the area inspector, and the canvas layer |

`areaModel.ts` and `surface.ts` have no app imports, so a form runtime can bundle
them with the rest of the core. Tests: `tests/areas.test.ts` and
`tests/surface.test.ts`.
