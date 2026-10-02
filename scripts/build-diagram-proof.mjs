#!/usr/bin/env node
/** Compile the dependency-free Drawer core and build a standalone browser proof. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync(join(tmpdir(), 'drawer-proof-'))
mkdirSync(output, { recursive: true })
const compiled = mkdtempSync(join(output, 'compiled-'))
const localTsc = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
const tsc = process.env.TSC || (existsSync(localTsc) ? localTsc : 'tsc')
const inputs = ['src/types.ts', 'src/geometry.ts', 'src/resolve.ts', 'src/diagramMappings.ts', 'src/svgSafety.ts', 'src/svgParse.ts', 'src/templates/footArteries.ts', 'src/export/exportSvg.ts', 'src/export/projectIo.ts']
const result = spawnSync(tsc, ['--target', 'ES2020', '--module', 'commonjs', '--lib', 'ES2020,DOM', '--strict', '--skipLibCheck', '--outDir', compiled, ...inputs], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
if (result.error || result.status !== 0) {
  console.error(result.error?.message || result.stdout + result.stderr)
  process.exit(1)
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : path.endsWith('.js') ? [path] : []
  })
}
const entries = walk(compiled).sort().map((path) => `${JSON.stringify(relative(compiled, path).split(sep).join('/').replace(/\.js$/, ''))}:function(module,exports,require){\n${readFileSync(path, 'utf8')}\n}`)
const bundle = `(function(){const modules={${entries.join(',\n')}};
const cache={};function load(id,from=''){
 const parts=(id.startsWith('.')?from.split('/').slice(0,-1).join('/')+'/'+id:id).split('/');
 const out=[];for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p)}
 const key=out.join('/').replace(/\\.js$/,'');if(cache[key])return cache[key].exports;
 if(!modules[key])throw Error('Unknown core module '+key);const mod={exports:{}};cache[key]=mod;
 modules[key](mod,mod.exports,(next)=>load(next,key));return mod.exports;}
window.DrawerCore={...load('geometry'),...load('resolve'),...load('diagramMappings'),...load('svgParse'),...load('export/exportSvg'),...load('export/projectIo'),...load('templates/footArteries')};})();`
writeFileSync(join(output, 'native-core.js'), bundle)
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Drawer native renderer proof</title><style>body{margin:0;background:white}#image{width:726px;height:701px}#image svg{display:block;width:100%;height:100%}</style></head><body><div id="image"></div><script>${bundle.replace(/<\/script/gi, '<\\/script')}</script><script>window.doc=DrawerCore.createFootArteriesDoc();document.querySelector('#image').innerHTML=DrawerCore.exportSvg(doc,{includeLegend:false,viewBox:doc.base.viewBox});</script></body></html>`
writeFileSync(join(output, 'native-proof.html'), html)
console.log(`Strict core TypeScript compilation passed. Browser proof: ${join(output, 'native-proof.html')}`)
