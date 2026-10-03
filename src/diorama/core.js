/** Drawer multi-image scene engine. No framework dependency; browser and Node share it.
 * Connection coordinates are normalized in an IMAGE INSTANCE, never in the page.
 * Clinical names are transcribed labels, not validated clinical terminology codes.
 */
export const SCENE_FORMAT = 'drawer-scene';
export const MAX_TEXT_BYTES = 8_000_000;
const clone = value => JSON.parse(JSON.stringify(value));
const finite = (n, name, min = -100000, max = 100000) => {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return n;
};
const str = (s, name, max = 240) => {
  if (typeof s !== 'string' || s.length > max) throw new Error(`Invalid ${name}.`);
  return s;
};
const id = s => { str(s, 'ID', 80); if (!/^[A-Za-z][\w-]*$/.test(s)) throw new Error('IDs must begin with a letter and contain only letters, numbers, underscores or hyphens.'); return s; };
const arr = (a, name, max) => { if (!Array.isArray(a) || a.length > max) throw new Error(`Invalid ${name}; maximum ${max}.`); return a; };
const unique = (a, name) => { const ids = a.map(x => x.id); if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${name} IDs.`); };
const truth = (v, fallback) => v === undefined ? fallback : Boolean(v);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = value => String(Math.round(value * 10000) / 10000);

/** Strict positive-list SVG importer. No CSS, scripts, href, image, use, foreignObject,
 * external URLs or event handlers survive. Reject unsupported elements rather than
 * pretending unsupported artwork imported faithfully. Keeps geometric vector SVGs.
 */
export function sanitizeVectorMarkup(markup) {
  if (typeof DOMParser === 'undefined') throw new Error('Vector imports require a browser DOM.');
  str(markup, 'SVG', 3_000_000);
  if (/<!DOCTYPE|<!ENTITY/i.test(markup)) throw new Error('SVG document types and entities are not allowed.');
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('SVG is not well-formed XML.');
  const tags = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','title','desc','text','tspan']);
  const geometry = new Set(['d','x','y','x1','x2','y1','y2','dx','dy','cx','cy','r','rx','ry','width','height','points','viewBox','preserveAspectRatio','transform','fill-rule','clip-rule','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','opacity','fill-opacity','stroke-opacity','font-size','font-weight','text-anchor','dominant-baseline','vector-effect']);
  const paint = /^(?:none|currentColor|transparent|#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i;
  const unsupported = [];
  for (const el of [...doc.documentElement.querySelectorAll('*')]) {
    if (!tags.has(el.localName) || el.namespaceURI !== 'http://www.w3.org/2000/svg') { unsupported.push(el.localName); el.remove(); continue; }
    for (const a of [...el.attributes]) {
      const name = a.name;
      if (name === 'fill' || name === 'stroke' || name === 'color') { if (!paint.test(a.value)) el.removeAttribute(name); }
      else if (geometry.has(name)) { if (/url\s*\(|[<>]|javascript:|data:/i.test(a.value)) el.removeAttribute(name); }
      else if (name === 'font-family') el.setAttribute(name, 'Arial, sans-serif');
      else el.removeAttribute(name); // Includes IDs: prevents collisions between copies.
    }
  }
  if (unsupported.length) throw new Error(`Unsupported SVG elements: ${[...new Set(unsupported)].join(', ')}. Convert them to geometric paths first.`);
  return new XMLSerializer().serializeToString(doc.documentElement).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

/** Parse / normalize into a NEW object; never retain arbitrary imported properties. */
export function validateScene(input, sanitizer = sanitizeVectorMarkup) {
  if (!input || input.format !== SCENE_FORMAT || input.version !== 1) throw new Error('Expected a drawer-scene version 1 file.');
  const s = {
    format: SCENE_FORMAT, version: 1, id: id(input.id), name: str(input.name, 'scene name'),
    width: finite(input.width, 'page width', 100, 12000), height: finite(input.height, 'page height', 100, 12000),
    assets: [], images: [], sites: [], links: [], annotations: [], texts: [], legend: null,
    provenance: { source: str(input.provenance?.source ?? '', 'source', 1000), review: str(input.provenance?.review ?? 'Unvalidated visual reconstruction.', 'review', 1000), artwork: str(input.provenance?.artwork ?? '', 'artwork', 1000), baseCommit: str(input.provenance?.baseCommit ?? '', 'commit', 80) },
  };
  for (const a of arr(input.assets, 'assets', 100)) s.assets.push({ id: id(a.id), name: str(a.name, 'asset name'), width: finite(a.width, 'asset width', 1, 12000), height: finite(a.height, 'asset height', 1, 12000), inner: sanitizer(str(a.inner, 'vector markup', 3_000_000)), source: str(a.source ?? '', 'asset source', 1000) });
  unique(s.assets, 'asset');
  const assetIds = new Set(s.assets.map(a => a.id));
  for (const i of arr(input.images, 'images', 100)) {
    if (!assetIds.has(i.assetId)) throw new Error(`Image ${i.id} refers to a missing asset.`);
    s.images.push({id: id(i.id), assetId: id(i.assetId), name: str(i.name, 'image name'), x: finite(i.x, 'image x'), y: finite(i.y, 'image y'), width: finite(i.width, 'image width', 1, 12000), height: finite(i.height, 'image height', 1, 12000), rotation: finite(i.rotation ?? 0, 'rotation', -3600, 3600), visible: truth(i.visible, true), locked: truth(i.locked, false)});
  }
  unique(s.images, 'image');
  const imageIds = new Set(s.images.map(i => i.id));
  for (const r of arr(input.sites, 'sites', 500)) {
    const value = r.value ?? null;
    if (typeof value === 'object' && value !== null || typeof value === 'number' && !Number.isFinite(value) || !['string','number','boolean','object'].includes(typeof value)) throw new Error('Mapping values must be finite numbers, strings, booleans or null.');
    if (typeof value === 'string') str(value, 'mapping value', 2000);
    const fieldKey = str(r.fieldKey, 'field key', 200);
    if (!fieldKey.trim() || ['__proto__','prototype','constructor'].includes(fieldKey)) throw new Error('Invalid field key.');
    const number = finite(r.number, 'site number', 1, 9999);
    if (!Number.isInteger(number)) throw new Error('Site numbers must be integers.');
    s.sites.push({id: id(r.id), number, label: str(r.label, 'site label'), fieldKey, value});
  }
  unique(s.sites, 'site');
  if (new Set(s.sites.map(r => r.number)).size !== s.sites.length) throw new Error('Site numbers must be unique.');
  if (new Set(s.sites.map(r => r.fieldKey)).size !== s.sites.length) throw new Error('Each site needs a unique field key; duplicate placements belong to that same site.');
  const siteIds = new Set(s.sites.map(r => r.id));
  for (const l of arr(input.links, 'connections', 2000)) {
    if (!imageIds.has(l.imageId) || !siteIds.has(l.siteId)) throw new Error(`Connection ${l.id} has a missing image or site.`);
    s.links.push({id: id(l.id), siteId: id(l.siteId), imageId: id(l.imageId), u: finite(l.u, 'connection u', 0, 1), v: finite(l.v, 'connection v', 0, 1), radius: finite(l.radius ?? 13, 'marker radius', 2, 80), visible: truth(l.visible, true)});
  }
  unique(s.links, 'connection');
  for (const a of arr(input.annotations ?? [], 'annotations', 1000)) {
    if (!imageIds.has(a.imageId)) throw new Error('Anatomy annotation has a missing image.');
    s.annotations.push({id: id(a.id), imageId: id(a.imageId), label: str(a.label, 'annotation label'), u: finite(a.u, 'annotation u', -4, 5), v: finite(a.v, 'annotation v', -4, 5), labelU: finite(a.labelU, 'label u', -4, 5), labelV: finite(a.labelV, 'label v', -4, 5), align: a.align === 'end' ? 'end' : 'start', fontSize: finite(a.fontSize ?? 25, 'annotation font size', 6, 120)});
  }
  unique(s.annotations, 'annotation');
  for (const t of arr(input.texts ?? [], 'texts', 500)) {
    if (t.imageId && !imageIds.has(t.imageId)) throw new Error('Text has a missing parent image.');
    s.texts.push({id: id(t.id), text: str(t.text, 'text', 2000), x: finite(t.x, 'text x'), y: finite(t.y, 'text y'), fontSize: finite(t.fontSize ?? 24, 'font size', 6, 150), bold: Boolean(t.bold), ruleWidth: finite(t.ruleWidth??0, 'rule width',0,3000), ruleOffsetX: finite(t.ruleOffsetX??0,'rule offset',-3000,3000), ...(t.imageId ? {imageId: id(t.imageId)} : {})});
  }
  unique(s.texts, 'text');
  const g = input.legend;
  if (!g) throw new Error('Missing legend settings.');
  s.legend = {x: finite(g.x, 'legend x'), y: finite(g.y, 'legend y'), width: finite(g.width, 'legend width', 80, 12000), rowHeight: finite(g.rowHeight, 'legend row height', 10, 300), fontSize: finite(g.fontSize, 'legend font size', 6, 120), heading: str(g.heading, 'legend heading'), visible: truth(g.visible, true)};
  return s;
}
export function parseScene(text, sanitizer) { str(text, 'project', MAX_TEXT_BYTES); return validateScene(JSON.parse(text), sanitizer); }
export function serializeScene(scene, {includeValues = false} = {}) {
  const s = clone(scene);
  if (!includeValues) s.sites.forEach(r => { r.value = null; });
  return JSON.stringify(s, null, 2);
}

export function toWorld(image, u, v) {
  const r = image.rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = (u - .5) * image.width, dy = (v - .5) * image.height;
  return {x: image.x + image.width/2 + dx*c - dy*s, y: image.y + image.height/2 + dx*s + dy*c};
}
export function toLocal(image, x, y, clamp = false) {
  const r = -image.rotation * Math.PI/180, c = Math.cos(r), s = Math.sin(r);
  const dx = x - image.x - image.width/2, dy = y - image.y - image.height/2;
  const u = (dx*c - dy*s)/image.width + .5, v = (dx*s + dy*c)/image.height + .5;
  return clamp ? {u: Math.max(0, Math.min(1,u)), v: Math.max(0, Math.min(1,v))} : {u,v};
}
export function imageBounds(image) {
  const p = [[0,0],[1,0],[1,1],[0,1]].map(([u,v]) => toWorld(image,u,v));
  const x = Math.min(...p.map(p=>p.x)), y = Math.min(...p.map(p=>p.y));
  return {x, y, width: Math.max(...p.map(p=>p.x))-x, height: Math.max(...p.map(p=>p.y))-y};
}
export function transformedMarkup(image, asset) {
  return `<g data-image="${esc(image.id)}" transform="translate(${n(image.x+image.width/2)} ${n(image.y+image.height/2)}) rotate(${n(image.rotation)}) scale(${n(image.width/asset.width)} ${n(image.height/asset.height)}) translate(${n(-asset.width/2)} ${n(-asset.height/2)})">${asset.inner}</g>`;
}
const siteFor = (s,l) => s.sites.find(r=>r.id===l.siteId);
const imgFor = (s,l) => s.images.find(i=>i.id===l.imageId);
export function visibleLinks(scene) { return scene.links.filter(l => l.visible && imgFor(scene,l)?.visible); }
export function coverage(scene) {
  const links = visibleLinks(scene);
  return scene.sites.map(site=>({site, total: scene.links.filter(l=>l.siteId===site.id).length, visible: links.filter(l=>l.siteId===site.id).length}));
}
export function sceneWarnings(scene) {
  const result = coverage(scene).filter(r=>!r.visible).map(r=>`Site ${r.site.number} (${r.site.label}) has no visible marker.`);
  for (const i of scene.images.filter(i=>i.visible)) { const b=imageBounds(i); if(b.x<0||b.y<0||b.x+b.width>scene.width||b.y+b.height>scene.height) result.push(`${i.name} extends beyond the page.`); }
  if(scene.legend.visible && scene.legend.y + scene.legend.rowHeight*scene.sites.length+scene.legend.fontSize>scene.height) result.push('Legend extends beyond the page.');
  return result;
}
export function updateImage(scene, imageId, patch) {
  const next=clone(scene), i=next.images.find(i=>i.id===imageId);
  if(!i) throw new Error('Image not found.');
  if(i.locked && Object.keys(patch).some(k=>k!=='locked')) throw new Error('Unlock the image before changing it.');
  const allowed=['x','y','width','height','rotation','visible','locked','name'];
  for(const k of Object.keys(patch)) if(allowed.includes(k)) i[k]=patch[k];
  for(const k of ['x','y','rotation']) finite(i[k],k);
  finite(i.width,'width',1,12000);finite(i.height,'height',1,12000);
  return next;
}
export function deleteImage(scene, imageId) {
  const next=clone(scene);
  if(next.images.find(i=>i.id===imageId)?.locked) throw new Error('Unlock the image before deleting it.');
  next.images=next.images.filter(i=>i.id!==imageId);
  // Explicit cascading deletion: rows remain, revealing unmapped sites in coverage.
  next.links=next.links.filter(l=>l.imageId!==imageId);
  next.annotations=next.annotations.filter(a=>a.imageId!==imageId);
  next.texts=next.texts.filter(t=>t.imageId!==imageId);
  return next;
}
export function freshId(prefix, existing) { let n=1; const used=new Set(existing.map(x=>x.id)); while(used.has(`${prefix}-${n}`))n++; return `${prefix}-${n}`; }
export function duplicateImage(scene, imageId) {
  const next=clone(scene), source=next.images.find(i=>i.id===imageId);
  if(!source)throw new Error('Image not found.');
  const newId=freshId('image',next.images);
  next.images.push({...source,id:newId,name:`${source.name} copy`,x:source.x+32,y:source.y+32,locked:false});
  for(const [key,prefix] of [['links','link'],['annotations','annotation'],['texts','text']]) {
    for(const item of [...next[key]].filter(x=>x.imageId===imageId)) next[key].push({...item,id:freshId(prefix,next[key]),imageId:newId});
  }
  return {scene:next,imageId:newId};
}
export function addConnection(scene, siteId, imageId, u=.5, v=.5) {
  if(!scene.sites.some(s=>s.id===siteId)||!scene.images.some(i=>i.id===imageId))throw new Error('Choose an existing site and image.');
  const next=clone(scene), link={id:freshId('link',next.links),siteId,imageId,u:finite(u,'u',0,1),v:finite(v,'v',0,1),radius:13,visible:true};
  next.links.push(link);return {scene:next,linkId:link.id};
}

export function renderLegend(scene, selectedSite='') {
  const g=scene.legend;if(!g.visible)return '';
  let s=`<g data-legend="true" font-family="Arial, sans-serif" fill="#181818"><text x="${n(g.x)}" y="${n(g.y+g.fontSize*.72)}" font-size="${n(g.fontSize)}" font-weight="700">${esc(g.heading)}</text>`;
  scene.sites.forEach((r,k)=>{const y=g.y+g.rowHeight*(k+1)+g.fontSize*.72;
    if(selectedSite===r.id)s+=`<rect x="${n(g.x-5)}" y="${n(y-g.fontSize)}" width="${n(g.width)}" height="${n(g.rowHeight)}" rx="4" fill="#dce9fb"/>`;
    s+=`<text data-site="${esc(r.id)}" x="${n(g.x)}" y="${n(y)}" font-size="${n(g.fontSize)}">${r.number}. ${esc(r.label)}</text>`;
  });return s+'</g>';
}
export function renderTexts(scene) {
  return scene.texts.map(t=>{
    const i=t.imageId?scene.images.find(i=>i.id===t.imageId):null;
    if(t.imageId&&!i?.visible)return '';
    const a=i?scene.assets.find(a=>a.id===i.assetId):null;
    const p=i?toWorld(i,t.x/a.width,t.y/a.height):t;
    const rule=t.ruleWidth?`<path d="M${n(p.x+(t.ruleOffsetX||0))} ${n(p.y+8)} h${n(t.ruleWidth)}" fill="none" stroke="#555" stroke-width="2"/>`:'';
    return rule+`<text data-text="${esc(t.id)}" x="${n(p.x)}" y="${n(p.y)}" font-family="Arial, sans-serif" font-size="${n(t.fontSize)}" font-weight="${t.bold?'700':'400'}" fill="#181818">${esc(t.text)}</text>`;
  }).join('');
}
export function renderScene(scene, options={}) {
  const {selectedImage='',selectedSite='',selectedLink='',mode='numbers',showSelection=false,showConnections=false,referenceUrl='',referenceOpacity=.25}=options;
  let body='<rect width="100%" height="100%" fill="white"/>';
  body+='<g data-layer="artwork">'+scene.images.filter(i=>i.visible).map(i=>transformedMarkup(i,scene.assets.find(a=>a.id===i.assetId))).join('')+'</g>';
  // Decorative source rules, kept independent of anatomical anchors.
  body+='<path d="M30 6H1507" stroke="#222" stroke-width="2" fill="none"/>';
  for(const a of scene.annotations){const i=imgFor(scene,a);if(!i?.visible)continue;const p=toWorld(i,a.u,a.v),q=toWorld(i,a.labelU,a.labelV),end=q.x+(a.align==='end'?7:-7);
    body+=`<g data-annotation="${esc(a.id)}"><path d="M${n(p.x)} ${n(p.y)} L${n(end)} ${n(q.y-5)}" stroke="#333" stroke-width="1.8" fill="none"/><text x="${n(q.x)}" y="${n(q.y)}" text-anchor="${a.align}" font-family="Arial, sans-serif" font-size="${n(a.fontSize)}" fill="#222">${esc(a.label)}</text></g>`;
  }
  body+=renderTexts(scene)+renderLegend(scene,showSelection?selectedSite:'');
  if(showConnections&&selectedSite){const index=scene.sites.findIndex(s=>s.id===selectedSite);for(const l of visibleLinks(scene).filter(l=>l.siteId===selectedSite)){const p=toWorld(imgFor(scene,l),l.u,l.v),g=scene.legend;body+=`<path data-connection="${l.id}" d="M${n(p.x)} ${n(p.y)} L${n(g.x-10)} ${n(g.y+g.rowHeight*(index+1)+g.fontSize*.4)}" fill="none" stroke="#2874bd" stroke-width="1.8" stroke-dasharray="6 5"/>`;}}
  for(const l of visibleLinks(scene)){const r=siteFor(scene,l),p=toWorld(imgFor(scene,l),l.u,l.v),selected=showSelection&&(l.id===selectedLink||r.id===selectedSite);
    body+=`<g data-link="${esc(l.id)}" data-site="${esc(r.id)}" role="button" tabindex="0" aria-label="Site ${r.number}: ${esc(r.label)} on ${esc(imgFor(scene,l).name)}" transform="translate(${n(p.x)} ${n(p.y)})"><title>${esc(r.label)} • ${esc(r.fieldKey)}</title><circle r="${n(l.radius)}" fill="${selected?'#1c68a7':'#111'}" stroke="white" stroke-width="1.4"/>`;
    if(mode==='numbers')body+=`<text y=".35em" text-anchor="middle" font-family="Arial, sans-serif" font-size="${n(l.radius*1.14)}" fill="white">${r.number}</text>`;
    else if(mode==='names'||mode==='values'){body+=`<text y=".35em" x="${n(l.radius+5)}" font-size="17" font-family="Arial, sans-serif" fill="#111" stroke="white" stroke-width="3" paint-order="stroke">${esc(mode==='names'?r.label:r.value??'—')}</text>`;}
    body+='</g>';
  }
  if(referenceUrl&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(referenceUrl))body+=`<image data-reference="true" href="${referenceUrl}" width="${scene.width}" height="${scene.height}" opacity="${Math.max(0,Math.min(1,referenceOpacity))}" pointer-events="none"/>`;
  if(showSelection){
    // Explicit transparent image hit boxes: select/move in empty interior too.
    body+='<g data-layer="image-hits">'+scene.images.filter(i=>i.visible).map(i=>{const ps=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>toWorld(i,u,v));return `<polygon data-image-hit="${esc(i.id)}" points="${ps.map(p=>`${n(p.x)},${n(p.y)}`).join(' ')}" fill="transparent" pointer-events="all"/>`;}).join('')+'</g>';
    // Re-enable markers above hit boxes via a separate transparent interactive layer.
    body+='<g data-layer="marker-hits">'+visibleLinks(scene).map(l=>{const p=toWorld(imgFor(scene,l),l.u,l.v);return `<circle data-link-hit="${esc(l.id)}" cx="${n(p.x)}" cy="${n(p.y)}" r="${n(l.radius+4)}" fill="transparent" pointer-events="all"/>`;}).join('')+'</g>';
    const i=scene.images.find(i=>i.id===selectedImage&&i.visible);
    if(i){const ps=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>toWorld(i,u,v));body+=`<g data-selection="true"><polygon points="${ps.map(p=>`${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${i.locked?'#888':'#2674bd'}" stroke-width="2" stroke-dasharray="7 4" pointer-events="none"/>`;
      if(!i.locked){const q=toWorld(i,1,1);body+=`<rect data-resize="${esc(i.id)}" x="${n(q.x-6)}" y="${n(q.y-6)}" width="12" height="12" fill="white" stroke="#2674bd" stroke-width="2"/>`;}
      body+='</g>';
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" role="img" aria-label="${esc(scene.name)}"><title>${esc(scene.name)}</title><desc>${esc(scene.provenance.review)} ${esc(scene.provenance.artwork)}</desc>${body}</svg>`;
}

/** CSV is a connection table: one row per site/image placement, plus unmapped sites.
 * Escape formula-like user text so spreadsheet applications do not execute it.
 */
const csvCell=v=>{let s=v==null?'':String(v);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function connectionCsv(scene,{includeValues=false}={}) {
  const rows=[['site_id','number','label','field_key','image_id','image_name','connection_id','u','v','visible',...(includeValues?['value']:[])]];
  for(const r of scene.sites){const links=scene.links.filter(l=>l.siteId===r.id);for(const l of links.length?links:[null])rows.push([r.id,r.number,r.label,r.fieldKey,l?.imageId??'',l?imgFor(scene,l).name:'',l?.id??'',l?n(l.u):'',l?n(l.v):'',l?Boolean(l.visible&&imgFor(scene,l).visible):false,...(includeValues?[r.value]:[])]);}
  return rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

/** Native Drawer v1 export is an explicit SNAPSHOT, not a two-way scene editor.
 * Each repeat marker has its own native anchor but shares the row's fieldKey.
 * Names-mode preserves the source's stable numbers (Drawer's generic numbers
 * mode would incorrectly renumber the repeated sites by callout order).
 */
export function toDrawerProject(scene,{includeValues=false}={}) {
  const baseInner=scene.images.filter(i=>i.visible).map(i=>transformedMarkup(i,scene.assets.find(a=>a.id===i.assetId))).join('')+renderLegend(scene);
  const doc={id:`scene-${scene.id}`,name:scene.name,base:{inner:baseInner,viewBox:{x:0,y:0,w:scene.width,h:scene.height},contentBox:{x:0,y:0,w:scene.width,h:scene.height},targetBoxes:{}},anchors:[],callouts:[],views:[{id:'source-sites',name:'Source site numbers (stable)',labelMode:'names',mappingMode:'label',overrides:{}}],activeViewId:'source-sites',landmarks:[],textAnnotations:[],drawingElements:[],landmarkGroupOrder:scene.images.map(i=>i.name),hiddenLandmarkGroups:[],mappingValues:{}};
  if(includeValues)for(const r of scene.sites)doc.mappingValues[r.fieldKey]=r.value;
  for(const l of visibleLinks(scene)){const r=siteFor(scene,l),i=imgFor(scene,l),p=toWorld(i,l.u,l.v),targetId=`scene-target-${l.id}`,anchorId=`anchor-${l.id}`,calloutId=`callout-${l.id}`;
    doc.base.inner+=`<rect id="${targetId}" data-drawer-role="attachment-target" x="${n(p.x-.5)}" y="${n(p.y-.5)}" width="1" height="1" fill="none" stroke="none"/>`;
    doc.base.targetBoxes[targetId]={x:p.x-.5,y:p.y-.5,w:1,h:1};
    doc.anchors.push({id:anchorId,mode:'relative-bbox',relative:{targetId,nx:.5,ny:.5},mapping:{fieldKey:r.fieldKey,display:r.label}});
    doc.callouts.push({id:calloutId,anchorId,labelText:r.label,balloonShape:'circle',balloonText:String(r.number),leaderStyle:'straight',anchorMarker:'none',leaderEnd:'none',dashed:false,labelPos:p,elbow:null,color:'#111111',leaderWidth:0,fontSize:l.radius*1.14,fontWeight:500});
    doc.views[0].overrides[calloutId]={labelText:''};
    doc.landmarks.push({id:`landmark-${l.id}`,name:r.label,nx:.5,ny:.5,targetId,group:i.name});
  }
  for(const a of scene.annotations){const i=imgFor(scene,a);if(!i?.visible)continue;const p=toWorld(i,a.u,a.v),q=toWorld(i,a.labelU,a.labelV),anchorId=`anchor-${a.id}`;
    doc.anchors.push({id:anchorId,mode:'absolute',absolute:p});
    doc.callouts.push({id:`callout-${a.id}`,anchorId,labelText:a.label,balloonShape:'none',balloonText:'',leaderStyle:'straight',anchorMarker:'none',leaderEnd:'none',dashed:false,labelPos:q,labelAlign:a.align,elbow:null,color:'#111111',leaderWidth:1.8,fontSize:a.fontSize,fontWeight:400});
  }
  for(const t of scene.texts){const i=t.imageId?scene.images.find(i=>i.id===t.imageId):null;if(t.imageId&&!i?.visible)continue;const a=i?scene.assets.find(a=>a.id===i.assetId):null,p=i?toWorld(i,t.x/a.width,t.y/a.height):t;
    if(t.ruleWidth)doc.drawingElements.push({id:`rule-${t.id}`,kind:'line',start:{x:p.x+(t.ruleOffsetX||0),y:p.y+8},end:{x:p.x+(t.ruleOffsetX||0)+t.ruleWidth,y:p.y+8},stroke:'#555555',strokeWidth:2,dashed:false,fill:null});
    doc.textAnnotations.push({id:t.id,text:t.text,pos:{x:p.x,y:p.y-t.fontSize*.35},style:'plain',fontSize:t.fontSize,fontWeight:t.bold?700:400,align:'start',color:'#111111',ruleWidth:0});}
  return {format:'drawer-project',version:1,doc};
}

/** Bounded undo history; one record per drag, not one per pointermove. */
export class SceneHistory {
  constructor(scene,limit=60){this.scene=clone(scene);this.past=[];this.future=[];this.limit=limit;}
  commit(next){if(JSON.stringify(next)===JSON.stringify(this.scene))return false;this.past.push(this.scene);if(this.past.length>this.limit)this.past.shift();this.scene=clone(next);this.future=[];return true;}
  undo(){if(!this.past.length)return false;this.future.push(this.scene);this.scene=this.past.pop();return true;}
  redo(){if(!this.future.length)return false;this.past.push(this.scene);this.scene=this.future.pop();return true;}
}
