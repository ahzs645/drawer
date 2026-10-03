#!/usr/bin/env python3
"""Rebuild editable vector drafts from the user-provided scan; no OCR or external fonts.
Numbered badges are removed from the body layer and represented as semantic links.
Pixels hidden under original badges cannot be recovered; the trace is a draft.
"""
from pathlib import Path
import argparse,json,cv2,numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('--reference-output',type=Path);a=p.parse_args()
out=ROOT/'public/samples/diorama';out.mkdir(parents=True,exist_ok=True)
im=np.array(Image.open(a.source).convert('RGB').resize((1651,928),Image.Resampling.LANCZOS))
boxes={'overview':(173,140,530,739),'standing':(690,164,915,559),'seated':(883,290,1080,563),'lying':(666,610,1126,743)}
points={'standing':[(1,806,205),(2,823,261),(3,805,292),(4,861,307),(5,777,326),(6,806,340),(7,829,371),(8,779,494),(9,833,519),(10,774,529)],'seated':[(12,1061,380),(6,1048,427),(7,1025,449),(10,918,518),(22,963,446)],'lying':[(11,731,697),(12,788,725),(13,865,706),(14,896,720),(15,948,717),(16,990,701),(17,990,728),(18,1029,721),(19,1057,700),(20,1059,727),(21,1100,725),(22,991,673)]}
labels=['Occiput','Scapula','Spinous process','Elbow','Iliac crest','Sacrum','Ischial tuberosity','Achilles tendon','Heel','Sole','Ear','Shoulder','Anterior iliac spine','Trochanter','Thigh','Medial knee','Lateral knee','Lower leg','Medial malleolus','Lateral malleolus','Lateral edge of foot','Posterior knee']
scene={'format':'drawer-scene','version':1,'id':'skin-assessment','name':'Skin Assessment Flowsheet (Head-to-Toe)','width':1651,'height':928,'assets':[],'images':[],'sites':[{'id':f'site-{i+1:02}','number':i+1,'label':l,'fieldKey':'skin.'+l.lower().replace(' ','_'),'value':None} for i,l in enumerate(labels)],'links':[],'annotations':[],'texts':[],'legend':{'x':1198,'y':25,'width':400,'rowHeight':39.4,'fontSize':28,'heading':'Pressure injury sites','visible':True},'provenance':{'source':'User-provided image(2).png','review':'Unvalidated visual reconstruction; not a clinical assessment tool.','artwork':'Threshold contour traces; original badge regions masked. Hidden anatomy is not recovered.','baseCommit':'24b9ce6d933c8a8970e12997474c286ff6dc0e81'}}
for key,box in boxes.items():
 x0,y0,x1,y1=box;w=x1-x0;h=y1-y0
 crop=im[y0:y1,x0:x1].copy();Image.fromarray(crop).save(out/f'{key}-reference.png')
 gray=cv2.cvtColor(crop,cv2.COLOR_RGB2GRAY)
 if key=='overview':
  # Remove the printed labels without clipping any anatomical outline.
  for ax,ay,bx,by in [(173,137,276,165),(422,137,530,165),(185,212,264,244),(173,393,191,422),(178,516,249,548),(173,564,246,598),(440,179,530,214),(477,269,530,302),(491,320,530,350),(484,363,530,394),(473,619,530,650),(477,662,530,692)]:
   cv2.rectangle(gray,(max(0,ax-x0),max(0,ay-y0)),(min(w,bx-x0),min(h,by-y0)),255,-1)
  # Remove leader ink where it passes inside the anatomical crop.
  for p1,p2 in [((265,233),(324,239)),((188,417),(281,431)),((250,538),(302,540)),((245,582),(303,553)),((363,215),(440,198)),((398,283),(475,285)),((437,363),(490,337)),((363,380),(485,380)),((394,455),(537,502)),((430,651),(474,635)),((421,657),(477,675))]:
   cv2.line(gray,(p1[0]-x0,p1[1]-y0),(p2[0]-x0,p2[1]-y0),255,3,cv2.LINE_AA)
 else:
  for n,x,y in points[key]:cv2.circle(gray,(x-x0,y-y0),13,255,-1,cv2.LINE_AA)
 # Threshold only actual dark ink; preserve voids via even-odd nested contours.
 mask=(gray<190).astype(np.uint8)*255
 contours,hierarchy=cv2.findContours(mask,cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)
 paths=[]
 for c in contours:
  if abs(cv2.contourArea(c))<1.5:continue
  q=cv2.approxPolyDP(c,.32,True).reshape(-1,2)
  if len(q)<3:continue
  paths.append('M'+' L'.join(f'{int(x)},{int(y)}' for x,y in q)+' Z')
 inner='<path fill="#242424" fill-rule="evenodd" d="'+' '.join(paths)+'"/>'
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><title>{key} — reference contour draft</title>{inner}</svg>'
 (out/f'{key}.svg').write_text(svg)
 scene['assets'].append({'id':key,'name':{'overview':'Anterior / posterior','standing':'Standing back','seated':'Seated wheelchair','lying':'Side-lying'}[key],'width':w,'height':h,'inner':inner,'source':'Reference contour draft; marker-covered detail not recovered.'})
 scene['images'].append({'id':key,'assetId':key,'name':scene['assets'][-1]['name'],'x':x0,'y':y0,'width':w,'height':h,'rotation':0,'visible':True,'locked':False})
 for n,x,y in points.get(key,[]):scene['links'].append({'id':f'{key}-{n:02}','siteId':f'site-{n:02}','imageId':key,'u':(x-x0)/w,'v':(y-y0)/h,'radius':13,'visible':True})
# Unnumbered callouts in figure A are image-local; they follow the overview image.
a_calls=[('Chin',327,239,256,230,'end'),('Trochanter',281,431,187,412,'end'),('Knee',302,540,243,535,'end'),('Pretibial crest',303,553,243,584,'end'),('Occiput',365,215,449,197,'start'),('Scapula',398,284,480,286,'start'),('Elbow',438,362,498,337,'start'),('Spinous process',363,380,488,380,'start'),('Ischium',395,455,541,504,'start'),('Malleolus',429,651,478,636,'start'),('Heel',421,657,484,678,'start')]
x0,y0,x1,y1=boxes['overview']
for i,(label,x,y,lx,ly,align) in enumerate(a_calls):scene['annotations'].append({'id':f'anatomy-{i}','imageId':'overview','label':label,'u':(x-x0)/(x1-x0),'v':(y-y0)/(y1-y0),'labelU':(lx-x0)/(x1-x0),'labelV':(ly-y0)/(y1-y0),'align':align,'fontSize':25})
for id,text,x,y,size,bold in [('title','Skin Assessment Flowsheet (Head-to-Toe)',30,45,28,True),('anterior','Anterior',170,155,25,True),('posterior','Posterior',426,155,25,True),('figure-a','A',59,731,30,False),('figure-b','B',670,857,30,False),('credit-1','Modified from Trelease CC: Developing standards for wound care. Ostomy Wound Manage 20, 46 1988.',247,893,16,False),('credit-2','Adapted 1988 Trelease CC. Used with permission May 2016 British Columbia Provincial Interprofessional Skin & Wound Committee.',167,918,16,False)]:
 item={'id':id,'text':text,'x':x,'y':y,'fontSize':size,'bold':bold}
 if id in ['anterior','posterior','figure-a']:
  item['imageId']='overview';item['x']=x-x0;item['y']=y-y0
  if id=='anterior': item['ruleWidth']=192;item['ruleOffsetX']=-92
  if id=='posterior': item['ruleWidth']=192;item['ruleOffsetX']=0
 scene['texts'].append(item)
(out/'skin-assessment.scene.json').write_text(json.dumps(scene,indent=2))
# Keep the user-supplied source local to the downloadable kit, not in the source patch.
if a.reference_output:
 a.reference_output.parent.mkdir(parents=True,exist_ok=True)
 Image.fromarray(im).save(a.reference_output)
print('Built',len(scene['assets']),'assets;',len(scene['sites']),'sites;',len(scene['links']),'numbered links;',len(scene['annotations']),'anatomy labels')
