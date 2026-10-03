import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateScene,serializeScene,parseScene,renderScene,toDrawerProject,coverage,sceneWarnings,toWorld,updateImage} from '../src/diorama/core.js';
const source=JSON.parse(readFileSync(new URL('../public/samples/diorama/skin-assessment-library.scene.json',import.meta.url),'utf8'));
const fixture=()=>validateScene(structuredClone(source),s=>s);
const originals=[
 ['library-divider','standing_front_back_divider.svg','bb523d1e2401f04b852b01804725d2fd7fce2594'],
 ['library-back','standing_back_view.svg','0d85d3c4ae98710232b8304e7a7627c381471998'],
 ['library-wheelchair','seated_wheelchair_side_view.svg','bc03b2f6e3a483a0469a3f97f4e458e2b0aa6e2f'],
 ['library-sideLying','side_lying_view.svg','11f667272649cf41e3a6070b4828b6c8cdc675ea'],
];
const paths=s=>[...s.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m=>m[1]);
for(const [id,file,sha] of originals){
 test(`${file}: original GitHub bytes and unchanged paths`,()=>{
  const bytes=readFileSync(new URL(`../public/samples/${file}`,import.meta.url));
  const hash=createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex');
  assert.equal(hash,sha);
  const asset=source.assets.find(a=>a.id===id);assert.deepEqual(paths(asset.inner),paths(bytes.toString('utf8')));
  assert.equal(paths(asset.inner).length,1);
 });
}
test('every initial image preserves the original sample aspect ratio',()=>{for(const i of source.images){const a=source.assets.find(a=>a.id===i.assetId);assert.ok(Math.abs(i.width/i.height-a.width/a.height)<1e-12);}});
test('library variant retains four images, 22 rows, 27 placements, and 11 anatomy labels',()=>{assert.deepEqual([source.assets.length,source.images.length,source.sites.length,source.links.length,source.annotations.length],[4,4,22,27,11]);});
test('all reference site numbers preserved including repeated sites',()=>{const c=coverage(fixture());assert.deepEqual(c.map(x=>x.site.number),Array.from({length:22},(_,i)=>i+1));assert.deepEqual(c.filter(x=>x.total===2).map(x=>x.site.number),[6,7,10,12,22]);});
test('all placements in their image and complete visible page coverage',()=>{for(const l of source.links)assert.ok(l.u>=0&&l.u<=1&&l.v>=0&&l.v<=1);assert.deepEqual(sceneWarnings(fixture()),[]);});
test('moving wheelchair carries all five site placements, not other images',()=>{const s=fixture(),i=s.images.find(i=>i.id==='seated'),next=updateImage(s,'seated',{x:i.x+23,y:i.y-12});assert.deepEqual(next.links,s.links);assert.deepEqual(next.images.filter(i=>i.id!=='seated'),s.images.filter(i=>i.id!=='seated'));for(const l of s.links.filter(l=>l.imageId==='seated')){const a=toWorld(i,l.u,l.v),b=toWorld(next.images.find(i=>i.id==='seated'),l.u,l.v);assert.ok(Math.abs(b.x-a.x-23)<1e-9);assert.ok(Math.abs(b.y-a.y+12)<1e-9);}});
test('scene serialization preserves all image-specific geometry',()=>{const s=fixture();assert.deepEqual(parseScene(serializeScene(s),x=>x),s);});
test('clean SVG contains the original four path definitions and no raster',()=>{const s=fixture(),svg=renderScene(s);assert.deepEqual(paths(svg).slice(0,4),s.assets.flatMap(a=>paths(a.inner)));assert.equal(paths(svg).length,18); /* Four bodies plus 14 heading/leader rules. */assert.ok(!svg.includes('<image'));});
test('native Drawer snapshot preserves paths and 38 mapped/callout anchors',()=>{const s=fixture(),p=toDrawerProject(s);assert.equal(p.format,'drawer-project');assert.equal(p.version,1);assert.equal(p.doc.anchors.length,38);assert.equal(p.doc.callouts.length,38);assert.deepEqual(paths(p.doc.base.inner),s.assets.flatMap(a=>paths(a.inner)));assert.equal(p.doc.views[0].labelMode,'names');});
test('variant is distinct from original and does not claim new permission or clinical validation',()=>{assert.equal(source.id,'skin-assessment-library');assert.match(source.provenance.review,/approximate/);assert.ok(!source.texts.some(t=>t.text.includes('Used with permission')));});
