#!/usr/bin/env node
/** Browser regression for authored charts and the native diorama workflow.
 * npm run build first. PLAYWRIGHT_MODULE/CHROMIUM_PATH can point at installed tools.
 * Starts its own Vite server, so it also works in isolated execution environments.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'browser-checks/clinical'));
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true,
});
const page = await browser.newPage({ viewport: { width: 1720, height: 1100 } });
const errors = [];
const results = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
const check = (name, value, detail) => {
  results.push({ name, passed: !!value, ...(detail ? { detail } : {}) });
  console.log(value ? 'PASS' : 'FAIL', name, detail || '');
  assert.ok(value, name);
};
const state = () => page.evaluate(async () => {
  const { useStore } = await import('/src/store.ts');
  const s = useStore.getState();
  return { doc: s.doc, status: s.status, pendingSiteId: s.pendingSiteId, pendingSiteImageId: s.pendingSiteImageId, past: s.past.length };
});
const waitDoc = async (id) => {
  for (let n = 0; n < 100; n++) {
    const s = await state();
    if (s.status.startsWith('Failed')) throw new Error(s.status);
    if (s.doc?.id === id && !s.status.startsWith('Loading')) return s.doc;
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out loading ${id}`);
};
const panel = page.locator('#clinical-library-panel');
const openPanel = async (tab) => {
  if (!await panel.isVisible()) await page.locator('.clinical-toggle').click();
  await panel.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
};
const closePanel = async () => { if (await panel.isVisible()) await panel.getByRole('button', { name: 'Close clinical charts panel' }).click(); };
const load = async (key, id) => {
  await closePanel();
  await page.selectOption('.toolbar select', `template:${key}`);
  return waitDoc(id);
};
const screen = (name) => page.screenshot({ path: join(out, name), fullPage: false });
const saveProject = async (name) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save project', exact: true }).click()]);
  await download.saveAs(join(out, name));
};
const exportSvg = async (name) => {
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => {
    await page.getByRole('button', { name: 'Export ▾' }).click();
    await page.getByRole('menuitem', { name: /^SVG standalone/ }).click();
  })()]);
  await download.saveAs(join(out, name));
  return readFileSync(join(out, name), 'utf8');
};
const imagePoints = async (imageId) => page.evaluate(async (id) => {
  const { useStore } = await import('/src/store.ts');
  const { anchorPagePoint, landmarkPoint } = await import('/src/geometry.ts');
  const d = useStore.getState().doc;
  return {
    anchors: d.anchors.filter((a) => a.imageId === id).map((a) => ({ id: a.id, ...anchorPagePoint(d, a) })),
    landmarks: d.landmarks.filter((l) => l.imageId === id).map((l) => ({ id: l.id, ...landmarkPoint(d, l) })),
    text: d.textAnnotations.filter((t) => t.imageId === id).map((t) => ({ id: t.id, ...t.pos })),
  };
}, imageId);
const near = (a, b) => Math.abs(a - b) < 1e-6;

try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('.callout');
  for (const [key, id, count, landmarks, name] of [
    ['clinicalBody', 'clinical-body', 4, 58, 'body'],
    ['clinicalHands', 'clinical-hands', 4, 52, 'hands'],
    ['clinicalFeet', 'clinical-feet', 12, 78, 'feet'],
    ['clinicalAtlas', 'clinical-atlas', 20, 188, 'atlas'],
  ]) {
    const doc = await load(key, id);
    check(`${name}: correct independent views and landmarks`, doc.images.length === count && doc.landmarks.length === landmarks);
    check(`${name}: clean vectors and no injected page rule`, doc.activeViewId === 'artwork' && !doc.drawingElements.some((d) => d.id === 'page-rule') && doc.images.every((i) => !/<image\b|data:image/.test(i.drawing.inner)));
    check(`${name}: source notes and measured target attachments retained`, !!doc.provenance?.source && doc.landmarks.every((l) => !l.targetId || !!doc.images.find((i) => i.id === l.imageId)?.drawing.targetBoxes[l.targetId]));
    await saveProject(`${name}.drawer.json`);
    const svg = await exportSvg(`${name}-export.svg`);
    check(`${name}: SVG export contains every view without raster artwork`, (svg.match(/class="image"/g) || []).length === count && !/<image\b|data:image/.test(svg));
    await screen(`${name}-app.png`);
  }

  await openPanel('View library');
  check('library shows all 20 thumbnails', await panel.locator('.clinical-asset').count() === 20);
  await panel.getByRole('group', { name: 'Filter anatomy region' }).getByRole('button', { name: /^Feet/ }).click();
  check('foot filter shows all 12 foot views', await panel.locator('.clinical-asset').count() === 12);
  await panel.getByLabel('Filter view side', { exact: true }).selectOption('left');
  check('side filter separates the six left views', await panel.locator('.clinical-asset').count() === 6);
  await screen('view-library.png');
  await panel.getByLabel('Filter view side', { exact: true }).selectOption('all');
  await closePanel();

  let doc = await load('clinicalHands', 'clinical-hands');
  const imageId = 'hand-right-palmar';
  const image = doc.images.find((i) => i.id === imageId);
  const original = await imagePoints(imageId);
  const otherOriginal = await imagePoints('hand-left-palmar');
  await openPanel('Layout table');
  const xField = panel.getByLabel(`${image.name}: X position`, { exact: true });
  await xField.fill(String(image.x + 70)); await xField.press('Enter');
  const moved = await imagePoints(imageId);
  check('layout move carries points, landmarks and attached caption', ['anchors', 'landmarks', 'text'].every((kind) => moved[kind].length && moved[kind].every((p, i) => near(p.x, original[kind][i].x + 70) && near(p.y, original[kind][i].y))));
  check('moving one view leaves the other view fixed', JSON.stringify(await imagePoints('hand-left-palmar')) === JSON.stringify(otherOriginal));
  await closePanel(); await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check('undo restores the image and all attachments', JSON.stringify(await imagePoints(imageId)) === JSON.stringify(original));

  await openPanel('Layout table');
  const widthField = panel.getByLabel(`${image.name}: Width`, { exact: true });
  await widthField.fill(String(image.width * 1.2)); await widthField.press('Enter');
  const rotationField = panel.getByLabel(`${image.name}: Rotation`, { exact: true });
  await rotationField.fill('27'); await rotationField.press('Enter');
  doc = (await state()).doc;
  const changed = doc.images.find((i) => i.id === imageId);
  check('resize keeps the aspect ratio and rotation is saved', near(changed.height / changed.width, image.height / image.width) && changed.rotation === 27);
  const beforeGrid = (await state()).past;
  await panel.getByRole('button', { name: 'Arrange visible views' }).click();
  const afterGrid = await state();
  check('grid arrangement records one undo transaction', afterGrid.past === beforeGrid + 1);
  const noCrop = await page.evaluate(async () => {
    const { useStore } = await import('/src/store.ts');
    const { textAnnotationBounds } = await import('/src/geometry.ts');
    const d = useStore.getState().doc, frame = d.base.viewBox;
    return d.textAnnotations.every((t) => {
      const box = textAnnotationBounds(t);
      return box.x >= frame.x - 0.01 && box.y >= frame.y - 0.01 && box.x + box.w <= frame.x + frame.w + 0.01 && box.y + box.h <= frame.y + frame.h + 0.01;
    });
  });
  check('grid export frame contains every attached chart caption', noCrop);
  await screen('layout-table.png');
  await closePanel(); await page.getByRole('button', { name: 'Undo', exact: true }).click();

  doc = await load('clinicalHands', 'clinical-hands');
  await openPanel('Connections');
  check('connections table has twelve shared site rows', await panel.locator('.clinical-matrix tbody tr').count() === 12);
  await panel.locator('.clinical-marker-count').first().click();
  check('selecting a hidden marker opens a visible marker view', (await state()).doc.activeViewId !== 'artwork' && await page.locator('.canvas .site-marker').count() > 0);
  check('cross-view connections render with the printed legend hidden', await page.locator('.site-connection').count() > 0);
  await openPanel('Connections');
  await panel.getByLabel('New shared site', { exact: true }).fill('Review point');
  await panel.getByRole('button', { name: '+ Add site', exact: true }).click();
  await screen('connections-table.png');
  await panel.getByRole('button', { name: `Place Review point on ${image.name}`, exact: true }).click();
  check('matrix placement is constrained to the chosen image', (await state()).pendingSiteImageId === imageId);
  const markersBefore = (await state()).doc.callouts.length;
  const wrong = await page.locator('.body-layer [data-image-id="hand-left-palmar"]').boundingBox();
  await page.mouse.click(wrong.x + wrong.width * 0.45, wrong.y + wrong.height * 0.42);
  check('clicking another image does not create a misattached marker', (await state()).doc.callouts.length === markersBefore && (await state()).pendingSiteImageId === imageId);
  const right = await page.locator(`.body-layer [data-image-id="${imageId}"]`).boundingBox();
  await page.mouse.click(right.x + right.width * 0.6, right.y + right.height * 0.42);
  doc = (await state()).doc;
  check('clicking the chosen view creates the correct connection', doc.callouts.length === markersBefore + 1 && doc.anchors.find((a) => a.id === doc.callouts.at(-1).anchorId).imageId === imageId && (await state()).pendingSiteImageId === null);

  await openPanel('View library');
  await panel.getByRole('group', { name: 'Filter anatomy region' }).getByRole('button', { name: /^Feet/ }).click();
  await panel.getByRole('button', { name: /^Add Left foot.*plantar.*to page$/i }).click();
  doc = (await state()).doc;
  check('adding a view imports its own curated landmarks and source', doc.images.length === 5 && doc.images.at(-1).source && doc.landmarks.filter((l) => l.imageId === doc.images.at(-1).id).length === 7);
  const addedBounds = await page.evaluate(async () => {
    const { useStore } = await import('/src/store.ts');
    const { imagePageBounds } = await import('/src/geometry.ts');
    const d = useStore.getState().doc, b = imagePageBounds(d.images.at(-1)), frame = d.base.viewBox;
    return b.x >= frame.x && b.y >= frame.y && b.x + b.w <= frame.x + frame.w && b.y + b.h <= frame.y + frame.h;
  });
  check('adding a view expands the export page to contain it', addedBounds);
  await closePanel();
  await saveProject('edited-hand-diorama.drawer.json');
  const beforeReopen = (await state()).doc;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open project', exact: true }).click()]);
  await chooser.setFiles(join(out, 'edited-hand-diorama.drawer.json'));
  await page.waitForTimeout(200);
  const reopened = (await state()).doc;
  check('saved project reopens with placements, landmarks, mappings and provenance', JSON.stringify(reopened.anchors) === JSON.stringify(beforeReopen.anchors) && JSON.stringify(reopened.landmarks) === JSON.stringify(beforeReopen.landmarks) && JSON.stringify(reopened.provenance) === JSON.stringify(beforeReopen.provenance) && reopened.images.length === 5);
  await page.waitForTimeout(650); await page.reload(); await page.waitForSelector('.canvas');
  check('autosave restores the edited diorama', (await state()).doc.images.length === 5);

  await load('clinicalAtlas', 'clinical-atlas');
  await openPanel('View library');
  await page.setViewportSize({ width: 760, height: 1024 });
  const box = await panel.boundingBox();
  check('library stays inside a narrow viewport', box.x >= 0 && box.x + box.width <= 760 && box.height <= 1024);
  await screen('narrow-library.png');

  // A slow request must not modify the project opened while it was pending.
  await closePanel();
  for (const kind of ['chart', 'asset']) {
    let signal;
    const intercepted = new Promise((resolveRequest) => { signal = resolveRequest; });
    let release;
    const delayed = new Promise((resolveDelay) => { release = resolveDelay; });
    const url = kind === 'chart' ? '**/samples/clinical/hands-chart.scene.json' : '**/samples/clinical/assets/foot-right-heel.svg';
    await page.route(url, async (route) => { signal(); await delayed; await route.continue(); });
    const pending = page.evaluate(async (operation) => {
      const { useStore } = await import('/src/store.ts');
      return operation === 'chart' ? useStore.getState().loadTemplate('clinicalHands') : useStore.getState().addSampleImage('foot-right-heel');
    }, kind);
    await intercepted;
    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open project', exact: true }).click()]);
    await fileChooser.setFiles(join(out, 'body.drawer.json'));
    await waitDoc('clinical-body');
    release();
    const succeeded = await pending;
    check(`late ${kind} response cannot alter a newly opened project`, succeeded === false && (await state()).doc.id === 'clinical-body' && (await state()).doc.images.length === 4);
    await page.unroute(url);
  }
  check('no browser runtime errors', errors.length === 0, errors.join('\n'));
} catch (error) {
  errors.push(String(error));
  await screen('failure.png');
  throw error;
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ passed: results.filter((r) => r.passed).length, total: results.length, results, errors }, null, 2));
  await browser.close();
  await server.close();
}
