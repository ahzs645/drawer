#!/usr/bin/env python3
"""Exercise the body-library variant offline editor in Chromium, without a web server.
Requires: pip install playwright; a Chromium installation (or playwright install chromium).
This deliberately tests the shared editor, not the React/Vite integration build.
"""
import argparse,json,math,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('html',type=Path);p.add_argument('--output',type=Path,default=Path('artifacts/diorama-tests'));p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
html=args.html.read_text().replace('window.diorama=createDioramaEditor','window.testEngine={sanitizeVectorMarkup,toWorld,toLocal,serializeScene,toDrawerProject};window.diorama=createDioramaEditor')
results=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1600,'height':1100},device_scale_factor=1,accept_downloads=True)
 page.set_default_timeout(4000)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept('Custom test site') if d.type=='prompt' else d.accept())
 def reset():
  page.set_content(html,wait_until='load');page.wait_for_function('!!window.diorama');page.wait_for_timeout(70)
 def state():return page.evaluate('window.diorama.getScene()')
 def image(s,id):return next(i for i in s['images'] if i['id']==id)
 def field(selector,value):
  el=page.locator(selector);el.fill(str(value));el.dispatch_event('change')
 def coord(x,y):return page.evaluate('([x,y])=>{let s=document.querySelector("#editor").shadowRoot.querySelector(".board svg");let p=new DOMPoint(x,y).matrixTransform(s.getScreenCTM());return {x:p.x,y:p.y}}',[x,y])
 def drag(x,y,dx,dy):
  a=coord(x,y);z=coord(x+dx,y+dy);page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(z['x'],z['y'],steps=6);page.mouse.up()
 def test(name,fn):
  try: reset();fn();results.append({'name':name,'passed':True});print('PASS',name,flush=True)
  except Exception as e:results.append({'name':name,'passed':False,'error':str(e)});print('FAIL',name,str(e),flush=True);page.screenshot(path=str(args.output/('failure-'+str(len(results))+'.png')),full_page=True)
 def initial():
  s=state();assert (len(s['images']),len(s['sites']),len(s['links']))==(4,22,27);assert page.locator('tbody tr').count()==22;assert page.locator('[data-link]').count()==27;assert page.locator('svg image').count()==0
 test('Library scene: 4 images, 22 rows, 27 editable markers',initial)
 def moving():
  before=state();drag(798,409,38,-16);after=state();a=image(before,'standing');z=image(after,'standing');assert abs(z['x']-a['x']-38)<.05,(a,z);assert abs(z['y']-a['y']+16)<.05;assert before['links']==after['links'];assert image(before,'seated')==image(after,'seated');assert page.locator('[data-act="undo"]').is_enabled();page.locator('[data-act="undo"]').click();assert state()==before;page.locator('[data-act="redo"]').click();assert state()==after
 test('Drag keeps normalized attachments, other images, and one-step undo/redo',moving)
 def transforms():
  before=state();page.locator('[data-select-image="standing"]').click();field('[data-image-field="width"]',340);field('[data-image-field="height"]',420);field('[data-image-field="rotation"]',37);after=state();assert after['links']==before['links'];i=image(after,'standing');assert (i['width'],i['height'],i['rotation'])==(340,420,37);actual=page.locator('[data-link="standing-06"]').get_attribute('transform');expected=page.evaluate('()=>{let s=diorama.getScene(),i=s.images.find(i=>i.id==="standing"),l=s.links.find(l=>l.id==="standing-06");return testEngine.toWorld(i,l.u,l.v)}');assert abs(float(actual.split('(')[1].split()[0])-expected['x'])<.005
 test('Non-uniform scale and rotation keep site attachments',transforms)
 def resizing():
  before=state();old=image(before,'standing');page.locator('[data-select-image="standing"]').click();drag(old['x']+old['width'],old['y']+old['height'],25,44);after=state();i=image(after,'standing');assert i['width']>old['width'];assert abs(i['width']/i['height']-old['width']/old['height'])<1e-6;assert after['links']==before['links']
 test('Resize handle retains aspect ratio and attachment coordinates',resizing)
 def marker():
  before=state();i=image(before,'standing');o=next(l for l in before['links'] if l['id']=='standing-06');drag(i['x']+o['u']*i['width'],i['y']+o['v']*i['height'],12,6);after=state();l=next(l for l in after['links'] if l['id']=='standing-06');old=next(l for l in before['links'] if l['id']=='standing-06');assert abs(l['u']-old['u']-12/i['width'])<.001;assert abs(l['v']-old['v']-6/i['height'])<.001;assert after['images']==before['images']
 test('Drag an individual marker edits only its local attachment',marker)
 def rows():
  field('[data-site-field="label"][data-site-id="site-06"]','Sacrum revised');field('[data-site-field="fieldKey"][data-site-id="site-06"]','form.sacrum');assert page.locator('[data-link="standing-06"]').get_attribute('aria-label').find('Sacrum revised')>=0;assert page.locator('[data-link="seated-06"]').get_attribute('aria-label').find('Sacrum revised')>=0;assert '6. Sacrum revised' in page.locator('text[data-site="site-06"]').text_content();keys=page.evaluate('()=>testEngine.toDrawerProject(diorama.getScene()).doc.anchors.filter(a=>a.mapping?.fieldKey==="form.sacrum").length');assert keys==2
 test('One table edit updates repeated labels and shared native mappings',rows)
 def filter_table():
  page.locator('[data-filter]').fill('wheelchair');assert page.locator('tbody tr').count()==5;page.locator('[data-filter]').fill('sacrum');assert page.locator('tbody tr').count()==1
 test('Table filters by site and connected image',filter_table)
 def adding():
  page.locator('[data-connect-site="site-06"]').click();p=coord(887,674);page.mouse.click(p['x'],p['y']);s=state();assert len(s['links'])==28;assert len([l for l in s['links'] if l['siteId']=='site-06'])==3;assert s['links'][-1]['imageId']=='lying'
 test('Table link-picker creates a third placement for the same site',adding)
 def reassign():
  page.evaluate('diorama.selectSite("site-06")');page.locator('[data-link-id="standing-06"][data-link-field="imageId"]').select_option('seated');s=state();assert next(l for l in s['links'] if l['id']=='standing-06')['imageId']=='seated';assert len(s['sites'])==22
 test('A connection can be reassigned through its image selector',reassign)
 def duplication():
  page.locator('[data-select-image="standing"]').click();page.locator('[data-act="duplicate"]').click();s=state();assert len(s['images'])==5;assert len(s['links'])==37;assert len(s['sites'])==22;assert len(s['assets'])==4;assert len(set(l['id'] for l in s['links']))==37
 test('Duplicate creates an image instance with links but shares site rows',duplication)
 def locking():
  page.locator('[data-select-image="standing"]').click();page.locator('[data-image-field="locked"]').check();s=state();assert page.locator('[data-image-field="width"]').is_disabled();drag(798,409,38,-16);assert state()==s
 test('Locked image cannot be moved and numeric transform fields are disabled',locking)
 def deleting():
  page.locator('[data-select-image="standing"]').click();page.locator('[data-act="delete-image"]').click();s=state();assert len(s['images'])==3;assert len(s['links'])==17;assert len(s['sites'])==22;assert 'warning' in page.locator('.inspector').text_content();page.locator('[data-act="undo"]').click();assert len(state()['links'])==27
 test('Delete cascades image placements, preserves rows, reports missing coverage',deleting)
 def security():
  reports=page.evaluate('''()=>{const cases=['<script>alert(1)</script>','<foreignObject><p>HTML</p></foreignObject>','<use href="https://example.com/a.svg#b"/>','<image href="data:image/svg+xml,xx"/>','<!DOCTYPE svg><path/>'];return cases.map(s=>{try{testEngine.sanitizeVectorMarkup(s);return false}catch{return true}})}''');assert all(reports);clean=page.evaluate('()=>testEngine.sanitizeVectorMarkup(`<path d="M0 0L10 10" id="same" onload="alert(1)" style="fill:red" fill="url(https://example.com)"/>`)');assert 'onload' not in clean and 'url(' not in clean and 'style=' not in clean and 'id=' not in clean
 test('Browser SVG sanitizer rejects active/external content and strips unsafe attrs',security)
 def scene_import():
  before=state();scene=json.dumps(before).encode();page.locator('[data-file="scene"]').set_input_files({'name':'scene.json','mimeType':'application/json','buffer':scene});page.wait_for_timeout(120);assert state()==before;page.locator('[data-file="scene"]').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"format":"wrong"}'});page.wait_for_timeout(120);assert state()==before;assert page.locator('.notice').get_attribute('class').find('error')>=0
 test('Source JSON roundtrip and malformed import leave document intact',scene_import)
 def vector_import():
  page.locator('[data-file="svg"]').set_input_files({'name':'test.svg','mimeType':'image/svg+xml','buffer':b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 7 50 60"><path d="M5 7L55 67" stroke="black"/></svg>'});page.wait_for_timeout(100);s=state();assert len(s['images'])==5;assert 'translate(-5 -7)' in s['assets'][-1]['inner'];page.locator('[data-file="svg"]').set_input_files({'name':'bad.svg','mimeType':'image/svg+xml','buffer':b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 60"><script>alert(1)</script></svg>'});page.wait_for_timeout(100);assert state()==s
 test('SVG import creates an independent asset; malicious SVG does not mutate scene',vector_import)
 def download(act,name):
  with page.expect_download() as info:page.locator(f'[data-act="{act}"]').click()
  d=info.value;dest=args.output/name;d.save_as(str(dest));return dest
 def downloads():
  field('[data-site-field="value"][data-site-id="site-06"]','PRIVATE-TEST-VALUE');page.locator('[data-setting="mode"]').select_option('values');page.locator('[data-act="reference"]').click();assert page.locator('svg image').count()==1
  svg=download('export-svg','export-check.svg').read_text();assert 'PRIVATE-TEST-VALUE' not in svg and '<image' not in svg and 'data-image-hit' not in svg
  scene=json.loads(download('save-scene','export-check.scene.json').read_text());assert all(r['value'] is None for r in scene['sites'])
  csv=download('export-csv','export-check.csv').read_text();assert 'PRIVATE-TEST-VALUE' not in csv
  native=json.loads(download('publish','export-check.drawer.json').read_text());assert native['format']=='drawer-project';assert len(native['doc']['anchors'])==38
  png=download('export-png','export-check.png');assert png.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
  page.locator('[data-setting="values"]').check();scene=json.loads(download('save-scene','value-opt-in.scene.json').read_text());assert next(r for r in scene['sites'] if r['id']=='site-06')['value']=='PRIVATE-TEST-VALUE'
 test('SVG, PNG, CSV and both JSON downloads work; values and overlay excluded by default',downloads)
 def page_and_legend():
  box=page.locator('.inspector details').filter(has=page.locator('summary',has_text='Legend & page layout'));box.locator('summary').click();field('[data-legend-field="x"]',1160);assert state()['legend']['x']==1160;field('[data-page-field="width"]',1700);assert state()['width']==1700
 test('Page size and legend position are editable',page_and_legend)
 def keyboard():
  before=image(state(),'standing');page.locator('[data-select-image="standing"]').click();page.locator('.board').focus();page.keyboard.press('ArrowRight');assert image(state(),'standing')['x']==before['x']+1;page.keyboard.press('Shift+ArrowDown');assert image(state(),'standing')['y']==before['y']+10;page.keyboard.press('Control+z');assert image(state(),'standing')['y']==before['y']
 test('Scoped keyboard movement and undo',keyboard)
 def library_import():
  before=state();options=page.locator('[data-library-asset] option').all_text_contents();assert 'Seated — wheelchair' in options and len(options)==5
  page.locator('[data-library-asset]').select_option('2');page.wait_for_function('diorama.getScene().images.length===5')
  s=state();assert s['images'][-1]['name']=='Seated — wheelchair';assert (s['assets'][-1]['width'],s['assets'][-1]['height'])==(519,719);assert s['links']==before['links'];assert s['sites']==before['sites']
  same=page.evaluate("()=>{let s=diorama.getScene();const ds=x=>Array.from(new DOMParser().parseFromString('<svg xmlns=\"http://www.w3.org/2000/svg\">'+x.inner+'</svg>','image/svg+xml').querySelectorAll('path'),p=>p.getAttribute('d'));return JSON.stringify(ds(s.assets.find(a=>a.id==='library-wheelchair')))===JSON.stringify(ds(s.assets.at(-1)))}")
  assert same
 test('Offline sample picker imports the exact Seated — wheelchair vector',library_import)
 def seated_drag():
  before=state();i=image(before,'seated');drag(i['x']+.75*i['width'],i['y']+.20*i['height'],18,-10);after=state();z=image(after,'seated');assert abs(z['x']-i['x']-18)<.05;assert abs(z['y']-i['y']+10)<.05;assert after['links']==before['links'];assert image(after,'standing')==image(before,'standing')
 test('Wheelchair body is independently draggable with all five attached markers',seated_drag)
 def asset_integrity():
  s=state();assert set(a['id'] for a in s['assets'])=={'library-divider','library-back','library-wheelchair','library-sideLying'}
  assert all(abs(i['width']/i['height']-next(a for a in s['assets'] if a['id']==i['assetId'])['width']/next(a for a in s['assets'] if a['id']==i['assetId'])['height'])<1e-8 for i in s['images'])
  assert s['id']=='skin-assessment-library';assert 'original paths unchanged' in s['provenance']['artwork']
  with page.expect_download() as info:page.locator('[data-act="save-scene"]').click()
  assert info.value.suggested_filename=='skin-assessment-library.scene.json'
 test('Correct native aspect ratios, provenance, variant ID and download name',asset_integrity)
 def mobile():
  page.set_viewport_size({'width':430,'height':932});page.wait_for_timeout(150);assert page.locator('.board svg').is_visible();assert page.locator('tbody tr').count()==22;page.screenshot(path=str(args.output/'mobile.png'),full_page=True);page.set_viewport_size({'width':1600,'height':1100})
 test('Narrow-screen layout keeps canvas and connection table accessible',mobile)
 reset();page.evaluate('diorama.selectImage("seated");diorama.selectSite("site-06")');page.locator('[data-setting="lines"]').check();page.screenshot(path=str(args.output/'editor-selected-site.png'),full_page=True)
 results.append({'name':'No uncaught browser exceptions across scenarios','passed':not errors,'errors':errors})
 b.close()
report={'passed':sum(r['passed'] for r in results),'total':len(results),'scope':'Offline/shared editor in Chromium. Not a React/Vite integration build. Browser storage denied in this sandbox, so persistent refresh restoration is not tested.','results':results}
(args.output/'browser-test-results.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='results'},indent=2));sys.exit(0 if report['passed']==report['total'] else 1)
