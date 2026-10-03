#!/usr/bin/env node
/**
 * End-to-end checks of the multi-image editor in a real browser, against a
 * running build (pnpm build && pnpm preview). Prerequisites: the `playwright`
 * package (set PLAYWRIGHT_MODULE to its path if it is not resolvable) and a
 * Chromium (CHROMIUM_PATH, or Playwright's own).
 * Run: node scripts/test-app-browser.mjs [http://localhost:4173/] [output-dir]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const URL_ = process.argv[2] || 'http://localhost:4173/';
const OUT = resolve(process.argv[3] || 'browser-checks');
mkdirSync(OUT, { recursive: true });
const out = (name) => join(OUT, name);
const root = fileURLToPath(new URL('..', import.meta.url));
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e))); 
p.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text()) });
p.on('dialog', d => d.accept());
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(ok ? 'PASS' : 'FAIL', name, extra); };
const saved = async () => { await p.waitForTimeout(700); return JSON.parse(await p.evaluate(() => localStorage.getItem('drawer:autosave:v1'))).doc; };
const anchorsOf = async sel => p.$$eval(sel, els => els.map(e => ({ id: e.dataset.calloutId, x: +e.dataset.anchorX, y: +e.dataset.anchorY })));

await p.goto(URL_);
await p.waitForSelector('.callout');
// load library template
await p.selectOption('.toolbar select', 'template:skinLibrary');
await p.waitForSelector('.site-marker');
await p.waitForTimeout(300);
check('4 images', (await p.$$('.body-layer [data-image-id]')).length === 4);
check('27 site markers', (await p.$$('.canvas .site-marker')).length === 27);
check('38 callouts', (await p.$$('.canvas .callout')).length === 38);
check('22 legend rows', (await p.$$('.site-legend [data-legend-site]')).length === 22);
check('sites panel lists 22', (await p.$$('.site-list li')).length === 22);
await p.screenshot({ path: out('template.png') });

// select tool, drag standing image
await p.getByRole('button', { name: '↖ Select' }).click();
const before = await anchorsOf('.canvas .callout');
const img = p.locator('.body-layer [data-image-id="standing"]');
const box = await img.boundingBox();
// grab a point on the body path (center column)
const sx = box.x + box.width * 0.06, sy = box.y + box.height * 0.97;
await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + 40, sy + 20, { steps: 5 }); await p.mouse.up();
const after = await anchorsOf('.canvas .callout');
let doc = await saved();
const standingIds = new Set(doc.anchors.filter(a => a.imageId === 'standing').map(a => a.id));
const onStanding = doc.callouts.filter(c => standingIds.has(c.anchorId)).map(c => c.id);
const moved = after.filter((a, i) => Math.hypot(a.x - before[i].x, a.y - before[i].y) > 1).map(a => a.id);
check('only standing markers moved', moved.length === onStanding.length && moved.every(id => onStanding.includes(id)), `${moved.length}/${onStanding.length}`);
const img2 = doc.images.find(i => i.id === 'standing');
check('image selected + inspector', await p.locator('.image-inspector').isVisible());
check('image moved in doc', Math.abs(img2.x - 695.45) > 5, `${img2.x},${img2.y}`);

// undo restores
await p.keyboard.press('Control+z');
doc = await saved();
check('undo restores image position', Math.abs(doc.images.find(i => i.id === 'standing').x - 695.4516806722689) < 1e-6);

// resize via inspector width
{ const sb = await p.locator('.body-layer [data-image-id="seated"]').boundingBox(); await p.mouse.click(sb.x + 8, sb.y + sb.height - 8); }
const widthInput = p.locator('.image-inspector label:has-text("Width") input');
await widthInput.fill('300');
doc = await saved();
const seated = doc.images.find(i => i.id === 'seated');
check('width edit keeps aspect', Math.abs(seated.width - 300) < 1e-6 && Math.abs(seated.height / seated.width - 273 / 197.06119610570235) < 1e-6, `${seated.width}x${seated.height}`);
// rotation via inspector
await p.locator('.image-inspector label:has-text("Rotation") input').fill('30');
await p.waitForTimeout(200);
await p.screenshot({ path: out('rotated.png') });
// rotate handle drag
const rh = p.locator('[data-rotate-handle]');
const rb = await rh.boundingBox();
await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await p.mouse.down(); await p.mouse.move(rb.x + 80, rb.y + 60, { steps: 6 }); await p.mouse.up();
doc = await saved();
check('rotate handle changed rotation', Math.abs(doc.images.find(i => i.id === 'seated').rotation - 30) > 1, String(doc.images.find(i => i.id === 'seated').rotation));
// resize handle drag
const hh = p.locator('[data-resize-handle]');
const hb = await hh.boundingBox();
const w0 = doc.images.find(i => i.id === 'seated').width;
await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x + 60, hb.y + 60, { steps: 6 }); await p.mouse.up();
doc = await saved();
check('resize handle changed width', Math.abs(doc.images.find(i => i.id === 'seated').width - w0) > 5);

// site placement: select site 6 row's + button, then click on the lying image
const before28 = (await p.$$('.canvas .site-marker')).length;
await p.getByRole('button', { name: 'Place a marker for site 6' }).click();
check('placement hint', await p.locator('.canvas-hint').isVisible());
const lying = await p.locator('.body-layer [data-image-id="lying"]').boundingBox();
await p.mouse.click(lying.x + lying.width * 0.45, lying.y + lying.height * 0.6);
check('site marker added', (await p.$$('.canvas .site-marker')).length === before28 + 1);
doc = await saved();
const newest = doc.callouts[doc.callouts.length - 1];
check('new marker linked to site 6 on lying', newest.siteId === 'site-06' && doc.anchors.find(a => a.id === newest.anchorId).imageId === 'lying');

// drag that marker onto the standing image -> re-homed
const mk = p.locator(`.canvas .callout[data-callout-id="${newest.id}"] .callout-head`);
const mb = await mk.boundingBox();
const st = await p.locator('.body-layer [data-image-id="standing"]').boundingBox();
await p.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await p.mouse.down();
await p.mouse.move(st.x + st.width * 0.5, st.y + st.height * 0.5, { steps: 8 }); await p.mouse.up();
doc = await saved();
check('marker re-homed to standing', doc.anchors.find(a => a.id === newest.anchorId).imageId === 'standing');

// site rename in inspector propagates to legend
await p.locator('.site-list li', { hasText: 'Sacrum' }).locator('.cl-name').click();
const label = p.locator('.site-inspector label:has-text("Label") input');
await label.fill('Sacrum / coccyx');
check('legend renamed', (await p.locator('.site-legend text', { hasText: '6. Sacrum / coccyx' }).count()) === 1);
// duplicate number rejected
const numberInput = p.locator('.site-inspector .site-number-field input');
await numberInput.fill('7'); await numberInput.press('Enter');
check('duplicate number rejected', await p.locator('.site-inspector .hint.error').isVisible());

// view: site names
await p.locator('.view-tab', { hasText: 'Site names' }).click();
check('names view shows label text', (await p.locator('.canvas .site-marker .label-text', { hasText: 'Occiput' }).count()) >= 1);
await p.locator('.view-tab', { hasText: 'Site numbers' }).click();

// connections
await p.getByLabel('Show selected connections').check();
check('connection lines', (await p.$$('.site-connection')).length >= 2);

// duplicate image copies site markers
await p.locator('.image-list li', { hasText: 'Side-lying' }).click();
const markersBefore = (await p.$$('.canvas .site-marker')).length;
await p.locator('.image-inspector').getByRole('button', { name: 'Duplicate', exact: true }).click();
check('duplicate copies markers', (await p.$$('.canvas .site-marker')).length === markersBefore + 12, `${(await p.$$('.canvas .site-marker')).length}`);
// delete the copy via Delete key
await p.keyboard.press('Delete');
check('delete image removes its markers', (await p.$$('.canvas .site-marker')).length === markersBefore);
// hide image hides markers
await p.getByLabel('Show Side-lying').uncheck();
check('hidden image hides markers', (await p.$$('.canvas .site-marker')).length === markersBefore - 12);
check('coverage warns', (await p.locator('.sites-panel .warning-list li').count()) > 0);
await p.getByLabel('Show Side-lying').check();

// add sample image
await p.locator('.images-panel select').selectOption('organs');
await p.waitForTimeout(500);
check('sample image added', (await p.$$('.body-layer [data-image-id]')).length === 5);
// add callout on organs part with anchor tool
await p.getByRole('button', { name: '✛ Add callout' }).click();
doc = await saved();
const organs = doc.images[doc.images.length - 1];
const heart = p.locator(`.body-layer [data-image-id="${organs.id}"] #heart`);
if (await heart.count()) {
  const hb2 = await heart.boundingBox();
  await p.mouse.click(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
  doc = await saved();
  const a = doc.anchors[doc.anchors.length - 1];
  check('callout on organ part targets image+part', a.imageId === organs.id && a.relative.targetId === 'heart', JSON.stringify(a));
} else check('heart found', false);

// export SVG
const [dl] = await Promise.all([p.waitForEvent('download'), (async () => { await p.getByRole('button', { name: 'Export ▾' }).click(); await p.getByRole('menuitem', { name: /^SVG standalone/ }).click(); })()]);
const svg = readFileSync(await dl.path(), 'utf8');
writeFileSync(out('export.svg'), svg);
check('export has images', (svg.match(/class="image"/g) || []).length === 5);
check('export has site legend', svg.includes('class="site-legend"') && svg.includes('data-site-number'));
const [dl2] = await Promise.all([p.waitForEvent('download'), (async () => { await p.getByRole('button', { name: 'Export ▾' }).click(); await p.getByRole('menuitem', { name: /Sites CSV/ }).click(); })()]);
const csv = readFileSync(await dl2.path(), 'utf8');
check('csv rows', csv.trim().split('\r\n').length === 1 + 28, String(csv.trim().split('\r\n').length));
// save project & reopen
const [dl3] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Save project' }).click()]);
const proj = readFileSync(await dl3.path(), 'utf8');
writeFileSync(out('project.drawer.json'), proj);
await p.screenshot({ path: out('final.png') });
// open scene file directly
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Open project' }).click()]);
await chooser.setFiles(join(root, 'public/samples/diorama/skin-assessment.scene.json'));
await p.waitForTimeout(500);
check('scene file opens', (await p.$$('.canvas .site-marker')).length === 27 && (await p.$$('.body-layer [data-image-id]')).length === 4);
await p.screenshot({ path: out('traced.png') });
// reopen saved project
const [chooser2] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Open project' }).click()]);
await chooser2.setFiles(out('project.drawer.json'));
await p.waitForTimeout(500);
check('saved project reopens', (await p.$$('.body-layer [data-image-id]')).length === 5);
// reload restores autosave
await p.reload(); await p.waitForSelector('.callout'); await p.waitForTimeout(300);
check('autosave restore', (await p.$$('.body-layer [data-image-id]')).length === 5);

// Escape cancels a pending placement; + Site adds a row
await p.getByRole('button', { name: 'Place a marker for site 3' }).click();
await p.keyboard.press('Escape');
check('escape cancels placement', !(await p.locator('.canvas-hint').isVisible()));
await p.getByLabel('New site label').fill('Forehead');
await p.getByRole('button', { name: '+ Site' }).click();
check('site added', (await p.$$('.site-list li')).length === 23 && (await p.$$('.site-legend [data-legend-site]')).length === 23);
// values view shows an entered value
await p.locator('.site-inspector label:has-text("Value") input').fill('Stage 1');
await p.locator('.site-inspector').getByRole('button', { name: '+ Place marker on an image' }).click();
{ const ob = await p.locator('.body-layer [data-image-id="overview"]').boundingBox(); await p.mouse.click(ob.x + ob.width * 0.4, ob.y + ob.height * 0.05); }
await p.locator('.view-tab', { hasText: 'Field values' }).click();
check('values view shows value', (await p.locator('.canvas .site-marker .label-text', { hasText: 'Stage 1' }).count()) === 1);
await p.locator('.view-tab', { hasText: 'Site numbers' }).click();
// legend drag
doc = await saved();
const lx = doc.siteLegend.pos.x;
const heading = await p.locator('.site-legend > text').first().boundingBox();
await p.mouse.move(heading.x + 10, heading.y + 5); await p.mouse.down(); await p.mouse.move(heading.x + 60, heading.y + 25, { steps: 5 }); await p.mouse.up();
doc = await saved();
check('legend dragged', doc.siteLegend.pos.x > lx + 10);
// mirror copy
await p.locator('.image-list li', { hasText: 'Standing — back' }).first().click();
await p.getByRole('button', { name: 'Mirror copy' }).click();
doc = await saved();
check('mirror copy flips', doc.images.some(i => i.flipX && i.name.includes('mirror')));
// add image by pasting SVG
await p.getByRole('button', { name: '+ Add image…' }).click();
await p.getByRole('button', { name: 'Paste SVG' }).click();
await p.locator('textarea.svg-paste').fill('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="dot" cx="50" cy="50" r="40" fill="none" stroke="black"/></svg>');
await p.getByRole('button', { name: 'Add', exact: true }).click();
doc = await saved();
check('pasted image added', doc.images.length === 7 && doc.images.at(-1).drawing.targetBoxes.dot);
// reference overlay is session-only
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEJMDGgAEwBAEBkAgK7yJ3hAAAAAElFTkSuQmCC', 'base64');
writeFileSync(out('overlay.png'), png);
await p.locator('.images-panel summary', { hasText: 'Reference overlay' }).click();
const [ov] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Load overlay image…' }).click()]);
await ov.setFiles(out('overlay.png'));
await p.waitForTimeout(300);
check('overlay drawn', (await p.$$('.reference-overlay')).length === 1);
doc = await saved();
check('overlay not saved', !JSON.stringify(doc).includes('data:image/png'));
// page frame toggle
await p.locator('.images-panel summary', { hasText: 'Page' }).click();
await p.getByLabel('Export the page frame (show it on the canvas)').uncheck();
check('page frame hidden', (await p.$$('.page-frame')).length === 0);
await p.getByLabel('Export the page frame (show it on the canvas)').check();
check('page frame shown', (await p.$$('.page-frame')).length === 1);
check('no page errors', errors.length === 0, JSON.stringify(errors));
console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
writeFileSync(out('results.json'), JSON.stringify({ passed: results.filter(r => r.ok).length, total: results.length, results }, null, 2));
await b.close();
process.exitCode = results.every(r => r.ok) ? 0 : 1;
