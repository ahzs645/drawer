#!/usr/bin/env node
/** Rebuild authored vectors and native Drawer scenes. No raster input is read. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBodyPack } from './clinical-body.mjs';
import { buildHandsPack } from './clinical-hands.mjs';
import { buildFeetPack } from './clinical-feet.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const packs = [buildBodyPack(), buildHandsPack(), buildFeetPack()];
const expectedCounts = { body: 4, hands: 4, feet: 12 };
const regions = { body: 'Body', hands: 'Hands', feet: 'Feet' };
const xml = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const written = [];

function emit(file, contents) {
  const path = join(root, file);
  if (check) {
    if (readFileSync(path, 'utf8') !== contents) throw new Error(`Rebuild required: ${file}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  written.push(file);
}

function svg(width, height, title, body, metadata) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${xml(title)}">\n<title>${xml(title)}</title>\n<metadata>${xml(JSON.stringify(metadata))}</metadata>\n${body}\n</svg>\n`;
}

function provenance(pack) {
  return {
    source: pack.source.filename,
    artwork: 'Manually authored cubic Bezier contours and separate named detail paths; no bitmap embedding or automatic contour tracing.',
    review: 'Visual reconstruction from supplied illustrations. Landmark and site positions are illustrative and have not been clinically validated.',
    symmetry: pack.id === 'body'
      ? 'Front and back are separately authored. Opposing profiles may reuse mirrored geometry; profile names describe image-facing direction only.'
      : 'Paired left/right views are explicitly reconstructed from mirrored masters; labels remain independent editable text.',
  };
}

function validatePack(pack) {
  if (pack.assets.length !== expectedCounts[pack.id]) throw new Error(`Unexpected ${pack.id} view count`);
  const ids = new Set();
  for (const a of pack.assets) {
    if (ids.has(a.id) || !/^[a-z][a-z0-9-]+$/.test(a.id)) throw new Error(`Invalid or repeated asset ${a.id}`);
    ids.add(a.id);
    for (const field of ['x', 'y', 'width', 'height']) if (!Number.isFinite(a[field])) throw new Error(`${a.id}: invalid ${field}`);
    if (a.width <= 0 || a.height <= 0) throw new Error(`${a.id}: empty frame`);
    if (/<(?:image|script|foreignObject|use)\b|data:image|\bon\w+\s*=|https?:\/\//i.test(a.inner)) throw new Error(`${a.id}: not self-contained vector artwork`);
    if (!/\b[CSQ][\d\s,.-]/i.test(a.inner)) throw new Error(`${a.id}: expected authored curve geometry`);
    const targets = [...a.inner.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    if (new Set(targets).size !== targets.length) throw new Error(`${a.id}: duplicate SVG target IDs`);
    if (!targets.every((id) => id.startsWith(`${a.id}-`))) throw new Error(`${a.id}: target IDs must be namespaced`);
    const pointIds = new Set();
    for (const l of a.landmarks) {
      if (pointIds.has(l.id)) throw new Error(`${a.id}: duplicate landmark ${l.id}`);
      pointIds.add(l.id);
      if (![l.x, l.y].every(Number.isFinite) || l.x < 0 || l.x > a.width || l.y < 0 || l.y > a.height) throw new Error(`${a.id}: out-of-frame landmark ${l.id}`);
      if (l.targetId && !targets.includes(l.targetId)) throw new Error(`${a.id}: missing target ${l.targetId}`);
    }
  }
}

function caption(t, image, scale = 1) {
  return {
    ...t,
    // Captions belong to the nearest view, so image transforms carry them too.
    imageId: image.id,
    x: (t.x - image.x),
    y: (t.y - image.y),
    fontSize: (t.fontSize ?? 24) * scale,
    align: t.align ?? 'start',
  };
}

function closestAsset(pack, t) {
  // Prefer horizontal match. For the hands, top/bottom labels belong to the
  // view in their row, not whichever outline happens to extend nearest them.
  return [...pack.assets].sort((a, b) => {
    const score = (v) => Math.hypot((v.x + v.width / 2 - t.x), (v.y + v.height / 2 - t.y));
    return score(a) - score(b);
  })[0];
}

/** Example site relationships: different views of the same named surface point. */
function siteConnections(assets) {
  const rows = new Map();
  const links = [];
  for (const a of assets) {
    const side = a.side === 'left' || a.side === 'right' ? a.side : null;
    if (!side) continue;
    const categories = a.id.startsWith('hand-')
      ? [['wrist', /wrist.*(?:cent|mid)|^wrist$/i], ['thumb-tip', /thumb.*tip|tip.*thumb/i], ['index-tip', /index.*tip|tip.*index/i], ['middle-tip', /middle.*tip|tip.*middle/i], ['ring-tip', /ring.*tip|tip.*ring/i], ['little-tip', /little.*tip|tip.*little/i]]
      : [['heel', /^heel(?: contour| bottom| centre| center)?$/i], ['great-toe', /^(?:great|big) toe(?: pad| nail)?$|hallux/i]];
    for (const [part, pattern] of categories) {
      const point = a.landmarks.find((l) => pattern.test(l.label));
      if (!point) continue;
      const key = `${a.id.startsWith('hand-') ? 'hand' : 'foot'}-${side}-${part}`;
      if (!rows.has(key)) rows.set(key, {
        id: `site-${key}`,
        label: `${side[0].toUpperCase()}${side.slice(1)} ${a.id.startsWith('hand-') ? 'hand' : 'foot'} — ${part.replaceAll('-', ' ')}`,
        fieldKey: `example.${key.replaceAll('-', '_')}`,
      });
      links.push({
        id: `link-${a.id}-${part}`, siteId: `site-${key}`, imageId: a.id,
        u: point.x / a.width, v: point.y / a.height, radius: a.id.startsWith('hand-') ? 10 : 7,
        ...(point.targetId ? { targetId: point.targetId } : {}),
      });
    }
  }
  // Only ship genuine cross-view connections, leaving single-view points in
  // the landmark catalog instead of presenting them as shared sites.
  const shared = new Set([...rows.keys()].filter((key) => links.filter((l) => l.siteId === `site-${key}`).length >= 2));
  const sites = [...rows.entries()].filter(([key]) => shared.has(key)).map(([, row], i) => ({ ...row, number: i + 1 }));
  return { sites, links: links.filter((l) => sites.some((s) => s.id === l.siteId)) };
}

function sceneAssets(pack) {
  return pack.assets.map((a) => ({
    id: a.id, name: a.name, width: a.width, height: a.height,
    inner: a.inner, landmarks: a.landmarks, source: pack.source.filename,
  }));
}

function makeScene(pack) {
  const { sites, links } = siteConnections(pack.assets);
  return {
    format: 'drawer-scene', version: 1, id: `clinical-${pack.id}`,
    name: pack.title, width: pack.source.width, height: pack.source.height,
    pageRule: false, cleanView: true,
    assets: sceneAssets(pack),
    images: pack.assets.map((a) => ({ id: a.id, assetId: a.id, name: a.name, x: a.x, y: a.y, width: a.width, height: a.height, rotation: 0 })),
    sites, links, annotations: [],
    texts: (pack.texts ?? []).map((t) => caption(t, closestAsset(pack, t))),
    legend: { x: 24, y: 24, width: 300, rowHeight: 26, fontSize: 18, heading: 'Shared example sites', visible: false },
    provenance: provenance(pack),
  };
}

function chartSvg(pack) {
  const artwork = pack.assets.map((a) => `<g data-view="${a.id}" transform="translate(${a.x} ${a.y})">${a.inner}</g>`).join('\n');
  const labels = (pack.texts ?? []).map((t) => `<text id="${t.id}" x="${t.x}" y="${t.y}" text-anchor="${t.align ?? 'start'}" font-family="Arial, Helvetica, sans-serif" font-size="${t.fontSize ?? 24}" font-weight="${t.bold ? 700 : 400}" fill="#000">${xml(t.text)}</text>`).join('\n');
  return svg(pack.source.width, pack.source.height, pack.title, `<rect width="100%" height="100%" fill="white" data-drawer-decoration="true"/>\n${artwork}\n${labels}`, provenance(pack));
}

function makeAtlas() {
  // Keep each chart's relative layout, then place its individual views onto a
  // larger page. The result is still twenty independent native image objects.
  const placements = {
    body: { x: 42, y: 80, scale: 1 },
    hands: { x: 1635, y: 90, scale: 0.84 },
    feet: { x: 455, y: 1280, scale: 1.02 },
  };
  const all = packs.flatMap((pack) => pack.assets);
  const { sites, links } = siteConnections(all);
  const images = packs.flatMap((pack) => {
    const p = placements[pack.id];
    return pack.assets.map((a) => ({ id: a.id, assetId: a.id, name: a.name, x: p.x + a.x * p.scale, y: p.y + a.y * p.scale, width: a.width * p.scale, height: a.height * p.scale, rotation: 0 }));
  });
  const headings = [
    { id: 'atlas-title', text: 'Clinical views', x: 65, y: 50, fontSize: 35, bold: true },
    { id: 'atlas-body-heading', text: 'BODY · FOUR VIEWS', x: 65, y: 1120, fontSize: 23, bold: true },
    { id: 'atlas-hands-heading', text: 'HANDS · FOUR VIEWS', x: 1840, y: 1200, fontSize: 23, bold: true },
    { id: 'atlas-feet-heading', text: 'FEET · TWELVE VIEWS', x: 475, y: 2220, fontSize: 23, bold: true },
  ];
  const texts = packs.flatMap((pack) => {
    const p = placements[pack.id];
    return (pack.texts ?? []).map((t) => caption(t, closestAsset(pack, t), p.scale));
  });
  return {
    format: 'drawer-scene', version: 1, id: 'clinical-atlas', name: 'Clinical atlas — 20 reconstructed vector views',
    width: 2750, height: 2280, pageRule: false, cleanView: true,
    assets: packs.flatMap(sceneAssets), images, sites, links,
    annotations: [], texts: [...texts, ...headings],
    legend: { x: 35, y: 1250, width: 410, rowHeight: 34, fontSize: 18, heading: 'Shared example sites', visible: false },
    provenance: {
      source: packs.map((p) => p.source.filename).join('; '),
      artwork: '20 manually authored vector views assembled as independent Drawer images. Source chart layouts retained within the body, hand and foot sections.',
      review: 'Illustrative anatomy and shared example sites. Positions and laterality require source review before clinical use; no external terminology codes assigned.',
    },
  };
}

const catalog = [];
const manifest = { format: 'drawer-clinical-vector-manifest', version: 1, method: 'manual-bezier-reconstruction', charts: [] };
for (const pack of packs) {
  validatePack(pack);
  const sourceNotes = provenance(pack);
  for (const a of pack.assets) {
    const file = `clinical/assets/${a.id}.svg`;
    emit(`public/samples/${file}`, svg(a.width, a.height, a.name, a.inner, { ...sourceNotes, assetId: a.id, view: a.view, side: a.side ?? 'unspecified' }));
    catalog.push({ key: a.id, file, label: a.name, region: regions[pack.id], side: ['left', 'right'].includes(a.side) ? a.side : 'unspecified', view: a.view, source: pack.source.filename, width: a.width, height: a.height, landmarks: a.landmarks });
  }
  emit(`public/samples/clinical/${pack.id}-chart.svg`, chartSvg(pack));
  emit(`public/samples/clinical/${pack.id}-chart.scene.json`, json(makeScene(pack)));
  manifest.charts.push({
    id: pack.id, title: pack.title, source: pack.source, provenance: sourceNotes,
    assets: pack.assets.map((a) => ({
      id: a.id, name: a.name, view: a.view, side: a.side ?? 'unspecified',
      sourceBox: { x: a.x, y: a.y, width: a.width, height: a.height },
      file: `assets/${a.id}.svg`, landmarks: a.landmarks,
      namedTargets: [...a.inner.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
      pathCount: [...a.inner.matchAll(/<path\b/g)].length,
    })),
  });
}
emit('src/clinicalCatalogData.json', json(catalog));
emit('public/samples/clinical/catalog.json', json(catalog));
emit('public/samples/clinical/manifest.json', json(manifest));
emit('public/samples/clinical/clinical-atlas.scene.json', json(makeAtlas()));
console.log(`${check ? 'Verified' : 'Wrote'} ${written.length} deterministic files: 20 individual vectors, 3 chart sheets, 4 native scenes, and their catalogs.`);
