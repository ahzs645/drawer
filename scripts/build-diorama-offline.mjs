/** Build a single self-contained HTML proof using the exact integrated scene engine.
 * Usage: node scripts/build-diorama-offline.mjs [output.html] [reference.png]
 * No bundler / network required. Reference is optional and never exported with artwork.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(process.argv[2]||path.join(root,'artifacts/drawer-diorama-demo.html'));
const modules=[];
for(const name of ['core.js','styles.js','editor.js']){
 let source=await readFile(path.join(root,'src/diorama',name),'utf8');
 source=source.split('\n').filter(line=>!line.startsWith('import ')).join('\n')
   .replaceAll('export const ','const ').replaceAll('export function ','function ').replaceAll('export class ','class ');
 modules.push(source);
}
const scene=JSON.parse(await readFile(path.join(root,'public/samples/diorama/skin-assessment.scene.json'),'utf8'));
let reference='';
if(process.argv[3]){
 const bytes=await readFile(process.argv[3]);
 if(bytes.length>8000000||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Reference must be a PNG up to 8 MB.');
 reference='data:image/png;base64,'+bytes.toString('base64');
}
const config=JSON.stringify({scene,reference,storageKey:'drawer:proof:diorama:v1'});
const script=(modules.join('\n')+'\nwindow.diorama=createDioramaEditor(document.querySelector("#editor"),'+config+');').replace(/<\/script/gi,'<\\/script');
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drawer · Skin assessment diorama composer</title><style>body{margin:0}#editor{min-height:100vh}</style><div id="editor"></div><script type="module">'+script+'</script></html>');
console.log(output);
