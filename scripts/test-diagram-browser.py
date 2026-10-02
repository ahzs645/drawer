#!/usr/bin/env python3
"""Browser checks for the real compiled Drawer core (not the full React app).
Prerequisites: Node + TypeScript, Python playwright, Chromium.
Run: python scripts/test-diagram-browser.py --chromium /path/to/chromium
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse, base64, json, os, shutil, subprocess, tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=None)
parser.add_argument('--chromium', default=os.getenv('CHROMIUM_PATH'))
parser.add_argument('--reference', type=Path, help='Optional real PNG fixture; otherwise a built-in 2x2 PNG is used.')
args = parser.parse_args()
output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix='drawer-browser-checks-'))
output.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[1]
subprocess.run(['node', str(root / 'scripts/build-diagram-proof.mjs'), str(output)], check=True)
chromium = args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
launch = {'headless': True}
if chromium: launch['executable_path'] = chromium
if hasattr(os, 'geteuid') and os.geteuid() == 0: launch['args'] = ['--no-sandbox']
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(**launch)
 page=browser.new_page(viewport={'width':1280,'height':900})
 page.set_content((output / 'native-proof.html').read_text())
 page.wait_for_function('window.DrawerCore && window.doc')
 def test(name,fn):
  try:
   v=page.evaluate(fn)
   if v is not True: raise AssertionError(str(v))
   checks.append({'name':name,'status':'pass'})
  except Exception as ex:
   checks.append({'name':name,'status':'FAIL','detail':str(ex)})
 test('Four source anchors resolve to the designated SVG coordinates',"""() => JSON.stringify(DrawerCore.resolveCallouts(doc).map(c=>c.anchorPoint))===JSON.stringify([{x:441,y:302},{x:307,y:380},{x:384,y:387},{x:388,y:534}])""")
 test('Fresh template instances have distinct document IDs',"() => DrawerCore.createFootArteriesDoc().id!==doc.id")
 test('Template has no inferred clinical mappings',"() => doc.anchors.every(a=>!a.mapping) && Object.keys(doc.mappingValues).length===0")
 test('All four callouts render as nine editable text lines',"() => document.querySelectorAll('#image .callout').length===4 && document.querySelectorAll('#image .callout tspan').length===9")
 test('Reconstruction contains no embedded raster images',"() => !document.querySelector('#image image')")
 test('All source labels lie inside the explicit 726 by 701 export',"""() => [...document.querySelectorAll('#image .callout text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.y>=0&&b.x+b.width<=726&&b.y+b.height<=701})""")
 test('Stipple dots do not create 1,000 attachment candidates',"() => Object.keys(doc.base.targetBoxes).length<30")
 test('Mapping display replaces original text when selected',"""() => {const d=DrawerCore.setAnchorMapping(doc,doc.anchors[0].id,{fieldKey:'demo.site',display:'Example location'});d.views[0].mappingMode='mapped-label';return DrawerCore.resolveCallouts(d)[0].labelText==='Example location'}""")
 # Do not let test-local mutations leak through shared view references.
 page.evaluate('doc=DrawerCore.createFootArteriesDoc()')
 for val,expected,name in [(0,'0','Numeric zero'),(False,'false','Boolean false'),('','','Empty string'),(None,'—','Null value')]:
  test(name+' is rendered intentionally',f"() => DrawerCore.mappedLabel({{id:'a',mode:'absolute',mapping:{{fieldKey:'f'}}}},'label','value',{{f:{json.dumps(val)}}})==={json.dumps(expected)}")
 test('Absent value uses an em dash',"() => DrawerCore.mappedLabel({id:'a',mode:'absolute',mapping:{fieldKey:'f'}},'label','value',{})==='—'")
 test('Inherited object keys are not read as values',"() => DrawerCore.mappedLabel({id:'a',mode:'absolute',mapping:{fieldKey:'toString'}},'label','value',{})==='—'")
 test('Dotted field keys match literally without traversal',"() => DrawerCore.mappedLabel({id:'a',mode:'absolute',mapping:{fieldKey:'a.b'}},'label','value',{'a.b':'literal'})==='literal'")
 test('Mapping changes do not mutate the original document',"() => {const d=DrawerCore.setAnchorMapping(doc,doc.anchors[0].id,{fieldKey:'x'});return !doc.anchors[0].mapping && d.anchors[0].mapping.fieldKey==='x'}")
 test('Mapping metadata survives SVG export',"() => {const d=DrawerCore.setAnchorMapping(doc,doc.anchors[0].id,{fieldKey:'x',system:'urn:example',code:'EXAMPLE'});const svg=DrawerCore.exportSvg(d);return svg.includes('data-field-key=\"x\"')&&svg.includes('data-code=\"EXAMPLE\"')}")
 test('Mapping metadata can be excluded from published SVG',"() => {const d=DrawerCore.setAnchorMapping(doc,doc.anchors[0].id,{fieldKey:'x'});return !DrawerCore.exportSvg(d,{includeMetadata:false}).includes('data-field-key')}")
 test('Mapped user text is XML-escaped',"() => {const d=structuredClone(doc);d.anchors[0].mapping={fieldKey:'x'};d.mappingValues={x:'<script>alert(1)</script>'};d.views[0].mappingMode='value';const svg=DrawerCore.exportSvg(d);return svg.includes('&lt;script&gt;')&&!svg.includes('<script>')}")
 test('Active per-view text overrides retain precedence',"() => {const d=structuredClone(doc);d.anchors[0].mapping={fieldKey:'x',display:'mapped'};d.views[0].mappingMode='mapped-label';d.views[0].overrides[d.callouts[0].id]={labelText:'manual override'};return DrawerCore.resolveCallouts(d)[0].labelText==='manual override'}")
 test('Named attachment can be changed without moving the point',"() => {const d=DrawerCore.attachAnchorToTarget(doc,doc.anchors[0].id,'foot-silhouette');const p=DrawerCore.resolveCallouts(d)[0].anchorPoint;return Math.abs(p.x-441)<1e-6&&Math.abs(p.y-302)<1e-6}")
 test('Centering on a new target is explicit',"() => {const d=DrawerCore.attachAnchorToTarget(doc,doc.anchors[0].id,'site-peroneal',true);const p=DrawerCore.resolveCallouts(d)[0].anchorPoint;return p.x===307&&p.y===380}")
 test('Missing target replacement is rejected atomically',"() => {const base=structuredClone(doc.base);delete base.targetBoxes['site-peroneal'];try{DrawerCore.replaceBaseKeepingMappings(doc,base);return false}catch(e){return e.message.includes('site-peroneal')&&doc.base.targetBoxes['site-peroneal'].w===12}}")
 test('Translated and scaled SVG target boxes resolve in root coordinates',"""() => {const raw=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 1800"><g transform="translate(100 200) scale(2)">${doc.base.inner}</g></svg>`;const d=DrawerCore.replaceBaseKeepingMappings(doc,DrawerCore.parseSvg(raw));const p=DrawerCore.resolveCallouts(d)[0].anchorPoint;return Math.abs(p.x-982)<1e-5&&Math.abs(p.y-804)<1e-5}""")
 test('Nested rotation is included in element bounding boxes',"""() => {const base=DrawerCore.parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g transform="translate(100 20)"><g transform="rotate(90)"><rect id="test" x="10" y="20" width="30" height="40"/></g></g></svg>');const b=base.targetBoxes.test;return Math.abs(b.x-40)<1e-5&&Math.abs(b.y-30)<1e-5&&Math.abs(b.w-40)<1e-5&&Math.abs(b.h-30)<1e-5}""")
 test('An absolute anchor cannot silently change coordinate systems',"() => {const d=structuredClone(doc);d.anchors[0]={id:d.anchors[0].id,mode:'absolute',absolute:{x:441,y:302}};const base=structuredClone(d.base);base.viewBox.w*=2;try{DrawerCore.replaceBaseKeepingMappings(d,base);return false}catch(e){return e.message.includes('absolute')}}")
 test('Unsupported path-offset replacement fails explicitly',"() => {const d=structuredClone(doc);d.anchors[0]={id:d.anchors[0].id,mode:'path-offset',pathOffset:{targetId:'foot-silhouette',t:0.5}};try{DrawerCore.replaceBaseKeepingMappings(d,d.base);return false}catch(e){return e.message.includes('path-offset')}}")
 test('Project save and reload preserve mapping, values, target and offsets',"() => {const d=DrawerCore.setAnchorMapping(doc,doc.anchors[0].id,{fieldKey:'x',display:'Example'});d.mappingValues={x:0};const re=DrawerCore.parseProject(DrawerCore.serializeProject(d));return re.anchors[0].mapping.fieldKey==='x'&&re.mappingValues.x===0&&re.anchors[0].relative.targetId==='site-posterior-tibial'&&re.callouts[0].labelOffset.y===-50}")
 test('Legacy projects without extension fields still load',"() => {const d=structuredClone(doc);delete d.mappingValues;delete d.landmarks;delete d.textAnnotations;delete d.drawingElements;delete d.landmarkGroupOrder;delete d.hiddenLandmarkGroups;d.views=d.views.slice(0,1);const re=DrawerCore.parseProject(DrawerCore.serializeProject(d));return re.landmarks.length===0&&re.callouts.length===4}")
 test('Future project versions are rejected',"() => {const x=JSON.parse(DrawerCore.serializeProject(doc));x.version=999;try{DrawerCore.parseProject(JSON.stringify(x));return false}catch(e){return e.message.includes('version')}}")
 test('Duplicate anchor IDs are rejected',"() => {const d=structuredClone(doc);d.anchors[1].id=d.anchors[0].id;try{DrawerCore.validateDiagramExtensions(d);return false}catch(e){return e.message.includes('duplicate')}}")
 test('Non-scalar mapping values are rejected',"() => {const d=structuredClone(doc);d.mappingValues={x:{bad:true}};try{DrawerCore.validateDiagramExtensions(d);return false}catch(e){return e.message.includes('value')}}")
 test('Prototype-reserved field keys are rejected',"() => {try{DrawerCore.setAnchorMapping(doc,doc.anchors[0].id,{fieldKey:'__proto__'});return false}catch(e){return e.message.includes('mapping')}}")
 test('Invalid label offsets are rejected',"() => {const d=structuredClone(doc);d.callouts[0].labelOffset.x=NaN;try{DrawerCore.validateDiagramExtensions(d);return false}catch(e){return e.message.includes('offset')}}")
 test('Nonpositive SVG viewBox is rejected',"() => {try{DrawerCore.parseSvg('<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 -1 100\"/>');return false}catch(e){return true}}")
 test('Duplicate SVG target IDs are rejected',"() => {try{DrawerCore.parseSvg('<svg xmlns=\"http://www.w3.org/2000/svg\"><rect id=\"same\"/><circle id=\"same\"/></svg>');return false}catch(e){return e.message.includes('Duplicate')}}")
 test('SVG script, animation, foreignObject and remote image are removed',"""() => {const base=DrawerCore.parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)"><script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">bad</div></foreignObject><image href="https://example.invalid/leak.png"/><animate attributeName="href"/><rect width="10" height="10" onclick="alert(1)"/></svg>');return !/script|foreignObject|<image|<animate|onclick|onload/.test(base.inner)}""")
 test('SVG inline safe styles and local clip references survive',"""() => {const base=DrawerCore.parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="clip"><rect width="20" height="20"/></clipPath></defs><rect width="50" height="50" style="stroke: black; fill: red; background-image:url(https://example.invalid/a)" clip-path="url(#clip)"/></svg>');return base.inner.includes('stroke:black')&&base.inner.includes('url(#clip)')&&!base.inner.includes('example.invalid')}""")
 test('Imported project target geometry is recomputed from sanitized SVG',"() => {const d=structuredClone(doc);d.base.targetBoxes['site-peroneal']={x:900,y:900,w:1,h:1};const re=DrawerCore.parseProject(DrawerCore.serializeProject(d));return re.base.targetBoxes['site-peroneal'].x===301}")
 test('Numbered view hides mapped text and numbers all four points',"() => {const c=DrawerCore.resolveCallouts(doc,'numbered');return c.every((r,i)=>r.labelText===''&&r.balloonText===String(i+1))}")
 test('Blank view hides label text and balloon text',"() => DrawerCore.resolveCallouts(doc,'blank').every(r=>r.labelText===''&&r.balloonText==='')")
 test('Multiline top and bottom bounds enclose text in auto-fit export',"""() => {const host=document.createElement('div');host.innerHTML=DrawerCore.exportSvg(doc,{includeLegend:false});document.body.append(host);const svg=host.querySelector('svg'),v=svg.viewBox.baseVal;const okay=[...host.querySelectorAll('.callout text')].every(t=>{const b=t.getBBox();return b.x>=v.x&&b.y>=v.y&&b.x+b.width<=v.x+v.width&&b.y+b.height<=v.y+v.height});host.remove();return okay}""")
 test('Multiline number legend fits within automatic export bounds',"""() => {const host=document.createElement('div');host.innerHTML=DrawerCore.exportSvg(doc,{viewId:'numbered'});document.body.append(host);const svg=host.querySelector('svg'),v=svg.viewBox.baseVal;const okay=[...host.querySelectorAll('.legend text')].every(t=>{const b=t.getBBox();return b.x>=v.x&&b.y>=v.y&&b.x+b.width<=v.x+v.width&&b.y+b.height<=v.y+v.height});host.remove();return okay}""")
 # Real reference upload/decode, rather than a synthetic MIME label.
 raw=args.reference.read_bytes() if args.reference else base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==')
 page.evaluate("bytes=>{window.referenceBytes=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))}",base64.b64encode(raw).decode())
 test('A real PNG is read, decoded and attached to an anchor',"async () => {window.reference=await DrawerCore.readReferenceImage(new File([referenceBytes],'source.png',{type:'image/png'}));window.attachedDoc=DrawerCore.addReferenceImage(doc,doc.anchors[0].id,reference);return attachedDoc.anchors[0].attachments[0].name==='source.png'}")
 test('Reference data survives project save and reopen',"() => {const re=DrawerCore.parseProject(DrawerCore.serializeProject(attachedDoc));return re.anchors[0].attachments[0].dataUrl===reference.dataUrl}")
 test('Published SVG never embeds reference image bytes',"() => {const svg=DrawerCore.exportSvg(attachedDoc);return !svg.includes(reference.dataUrl)&&!svg.includes('data:image')}")
 test('A disguised HTML upload is rejected by file signature',"async () => {try{await DrawerCore.readReferenceImage(new File(['<html>bad</html>'],'fake.png',{type:'image/png'}));return false}catch(e){return e.message.includes('signature')}}")
 test('Attachment MIME mismatch is rejected on project import',"() => {const d=structuredClone(attachedDoc);d.anchors[0].attachments[0].mimeType='image/jpeg';try{DrawerCore.validateDiagramExtensions(d);return false}catch(e){return true}}")
 test('Attachment byte-size mismatch is rejected',"() => {const d=structuredClone(attachedDoc);d.anchors[0].attachments[0].size++;try{DrawerCore.validateDiagramExtensions(d);return false}catch(e){return true}}")
 test('Duplicate reference IDs are rejected',"() => {const d=structuredClone(attachedDoc);d.anchors[1].attachments=[d.anchors[0].attachments[0]];try{DrawerCore.validateDiagramExtensions(d);return false}catch(e){return true}}")
 test('Oversized reference upload is rejected before decoding',"async () => {try{await DrawerCore.readReferenceImage(new File([new Uint8Array(1048577)],'large.png'));return false}catch(e){return e.message.includes('1 MiB')}}")
 test('Retargeting preserves the image attachment and mapping',"() => {let d=DrawerCore.setAnchorMapping(attachedDoc,doc.anchors[0].id,{fieldKey:'x'});d=DrawerCore.attachAnchorToTarget(d,doc.anchors[0].id,'site-peroneal',true);return d.anchors[0].mapping.fieldKey==='x'&&d.anchors[0].attachments.length===1}")
 browser.close()
(output / 'browser-checks.json').write_text(json.dumps(checks,indent=2))
print('PASS',sum(c['status']=='pass' for c in checks),'/',len(checks))
for c in checks:
 if c['status']!='pass': print(c)

print('Report:', output / 'browser-checks.json')
raise SystemExit(0 if all(c['status']=='pass' for c in checks) else 1)
