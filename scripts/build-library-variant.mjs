/** Rebuild the library-body variant without tracing or redrawing any artwork.
 * Uses four files already in public/samples. Source git-blob hashes are checked:
 * a changed library asset requires an explicit recalibration, never a silent remap.
 * Coordinates below are in each ORIGINAL SVG's user units, not the page.
 * Node 18+; no npm dependencies. Run from any directory.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateScene,serializeScene,renderScene,toDrawerProject,connectionCsv,sceneWarnings} from '../src/diorama/core.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(process.argv[2]||path.join(root,'artifacts/library-variant'));
const commit='24b9ce6d933c8a8970e12997474c286ff6dc0e81';
const specs=[
 ['overview','divider','standing_front_back_divider.svg','Standing — front / back','bb523d1e2401f04b852b01804725d2fd7fce2594'],
 ['standing','back','standing_back_view.svg','Standing — back','0d85d3c4ae98710232b8304e7a7627c381471998'],
 ['seated','wheelchair','seated_wheelchair_side_view.svg','Seated — wheelchair','bc03b2f6e3a483a0469a3f97f4e458e2b0aa6e2f'],
 ['lying','sideLying','side_lying_view.svg','Side-lying','11f667272649cf41e3a6070b4828b6c8cdc675ea'],
];
const source=JSON.parse(await readFile(path.join(root,'public/samples/diorama/skin-assessment.scene.json'),'utf8'));
const scene=structuredClone(source);scene.id='skin-assessment-library';scene.name='Skin Assessment — Drawer body library';
scene.provenance={
 source:'Layout and site names: user-provided Skin Assessment Flowsheet image. Artwork: ahzs645/drawer public/samples.',
 review:'Visual authoring variant; marker locations are approximate and require anatomical review. Not a validated clinical assessment tool.',
 artwork:'Four existing Drawer body SVGs, with original paths unchanged. Image aspect ratios preserved. Marker coordinates recalibrated in each sample’s native SVG units.',
 baseCommit:commit,
};
scene.assets=[];
const manifest={repository:'ahzs645/drawer',commit,method:'Existing library artwork; no generated, traced or redrawn paths.',assets:[]};
for(const [imageId,key,file,name,expected] of specs){
 const bytes=await readFile(path.join(root,'public/samples',file));
 const blobSha=createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex');
 if(blobSha!==expected)throw new Error(`${file} changed (${blobSha}). Review/recalibrate the coordinates before updating the expected hash.`);
 const raw=bytes.toString('utf8');const box=/viewBox="([^"]+)"/.exec(raw)?.[1].split(/\s+/).map(Number);
 if(!box||box.length!==4||box[0]!==0||box[1]!==0||box[2]<=0||box[3]<=0)throw new Error(`Unsupported viewBox in ${file}`);
 const inner=raw.replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
 const assetId=`library-${key}`;
 scene.assets.push({id:assetId,name,width:box[2],height:box[3],inner,source:`https://github.com/ahzs645/drawer/blob/${commit}/public/samples/${file} (git blob ${blobSha})`});
 const image=scene.images.find(i=>i.id===imageId);image.assetId=assetId;image.name=name;
 // Retain the reference placement and preserve the library sample's aspect ratio.
 if(imageId==='lying')image.height=image.width*box[3]/box[2];
 else {const cx=image.x+image.width/2;image.width=image.height*box[2]/box[3];image.x=cx-image.width/2;}
 manifest.assets.push({imageId,sampleKey:key,name,path:`public/samples/${file}`,blobSha,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,viewBox:box,pathPolicy:'Unchanged source path data.'});
}
// Visual placements. Labels describe the user reference, not inferred clinical codes.
const native={
 standing:{1:[262,86],2:[300,238],3:[260,309],4:[376,383],5:[193,420],6:[261,458],7:[309,505],8:[198,835],9:[330,899],10:[195,927]},
 seated:{12:[431,206],6:[421,358],7:[365,404],10:[78,607],22:[199,420]},
 lying:{11:[132,174],12:[283,245],13:[476,225],14:[550,251],15:[653,247],16:[744,205],17:[744,262],18:[838,253],19:[940,200],20:[936,262],21:[1003,267],22:[745,149]},
};
const placementAudit=[];
for(const link of scene.links){
 const img=scene.images.find(i=>i.id===link.imageId),asset=scene.assets.find(a=>a.id===img.assetId),site=scene.sites.find(s=>s.id===link.siteId),xy=native[img.id]?.[site.number];
 if(!xy)throw new Error(`Missing calibration for ${link.id}`);
 link.u=xy[0]/asset.width;link.v=xy[1]/asset.height;link.radius=img.id==='lying'?11.5:12.5;
 placementAudit.push({id:link.id,number:site.number,label:site.label,imageId:img.id,assetId:asset.id,nativeX:xy[0],nativeY:xy[1],u:link.u,v:link.v,review:'Approximate visual placement; not anatomically validated.'});
}
const overview=scene.images.find(i=>i.id==='overview');
const asset=scene.assets.find(a=>a.id===overview.assetId);
const scale=overview.height/asset.height;
const anatomy={
 'Chin':[321,223,260,233],
 'Trochanter':[203,667,185,413],
 'Knee':[243,915,242,540],
 'Pretibial crest':[253,989,242,590],
 'Occiput':[409,148,450,201],
 'Scapula':[461,321,480,286],
 'Elbow':[562,501,495,340],
 'Spinous process':[400,526,483,382],
 'Ischium':[466,699,540,506],
 'Malleolus':[490,1186,477,641],
 'Heel':[477,1286,483,684],
};
for(const a of scene.annotations){const [x,y,lx,ly]=anatomy[a.label];a.u=x/asset.width;a.v=y/asset.height;a.labelU=(lx-overview.x)/overview.width;a.labelV=(ly-overview.y)/overview.height;}
for(const [id,x,y] of [['anterior',171,154],['posterior',426,154],['figure-a',60,731]]){
 const t=scene.texts.find(t=>t.id===id);t.x=(x-overview.x)/scale;t.y=(y-overview.y)/scale;
}
scene.texts.find(t=>t.id==='credit-1').text='Layout reference: supplied Skin Assessment Flowsheet; source credits Trelease CC (1988) and the BC Skin & Wound Committee (2016).';
scene.texts.find(t=>t.id==='credit-2').text='Library-body variant · existing Drawer SVGs · approximate marker placement · not clinically validated.';
for(const id of ['credit-1','credit-2'])Object.assign(scene.texts.find(t=>t.id===id),{x:60,fontSize:14});
scene.texts.push({id:'variant-caption',text:'Variant · Drawer body library',x:30,y:82,fontSize:18,bold:false,ruleWidth:0,ruleOffsetX:0});
// The source files are trusted repo SVGs; the actual editor validates again with DOM sanitization.
const normalized=validateScene(scene,s=>s);
const warnings=sceneWarnings(normalized);if(warnings.length)throw new Error(warnings.join('\n'));
await mkdir(output,{recursive:true});
await mkdir(path.join(root,'public/samples/diorama'),{recursive:true});
await writeFile(path.join(root,'public/samples/diorama/skin-assessment-library.scene.json'),serializeScene(normalized));
await writeFile(path.join(output,'skin-assessment-library.scene.json'),serializeScene(normalized));
await writeFile(path.join(output,'skin-assessment-library.svg'),renderScene(normalized));
await writeFile(path.join(output,'skin-assessment-library.drawer.json'),JSON.stringify(toDrawerProject(normalized),null,2));
await writeFile(path.join(output,'pressure-site-connections.csv'),connectionCsv(normalized));
await writeFile(path.join(output,'source-manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(path.join(output,'marker-calibration.json'),JSON.stringify(placementAudit,null,2));
console.log(`${output}\n${scene.assets.length} original assets; ${scene.sites.length} sites; ${scene.links.length} connections; ${scene.annotations.length} anatomy callouts.`);
