#!/usr/bin/env python3
"""Render source comparisons; the raster analysis never generates SVG geometry.

Requires Pillow, NumPy and CairoSVG. References remain outside the repository.
"""
import argparse
import io
import json
import shutil
from pathlib import Path

import cairosvg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--references', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
out = args.output.resolve()
for directory in ('references', 'previews', 'charts', 'assets', 'scenes'):
    (out / directory).mkdir(parents=True, exist_ok=True)

manifest = json.loads((ROOT / 'public/samples/clinical/manifest.json').read_text())
try:
    font = ImageFont.truetype('DejaVuSans.ttf', 23)
    small = ImageFont.truetype('DejaVuSans.ttf', 18)
except OSError:
    font = small = ImageFont.load_default()

def heading(image, title, subtitle=None):
    height = 84 if subtitle else 54
    canvas = Image.new('RGB', (image.width, image.height + height), '#edf1f5')
    canvas.paste(image, (0, height))
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 13), title, font=font, fill='#263646')
    if subtitle:
        draw.text((20, 46), subtitle, font=small, fill='#526476')
    return canvas

for chart in manifest['charts']:
    key = chart['id']
    src = args.references / chart['source']['filename']
    source = Image.open(src).convert('RGB')
    expected = (chart['source']['width'], chart['source']['height'])
    if source.size != expected:
        raise ValueError(f'{src.name}: expected {expected}, received {source.size}')
    vector_file = ROOT / f'public/samples/clinical/{key}-chart.svg'
    vector = Image.open(io.BytesIO(cairosvg.svg2png(url=str(vector_file)))).convert('RGB')
    source.save(out / 'references' / f'{key}.png')
    vector.save(out / 'previews' / f'{key}-reconstruction.png')
    pair = Image.new('RGB', (source.width * 2 + 20, source.height), '#edf1f5')
    pair.paste(source, (0, 0))
    pair.paste(vector, (source.width + 20, 0))
    pair = heading(pair, 'SUPPLIED REFERENCE')
    ImageDraw.Draw(pair).text((source.width + 40, 13), 'RECONSTRUCTED VECTORS', font=font, fill='#263646')
    pair.save(out / 'previews' / f'{key}-comparison.png')
    # Strict same-coordinate overlay. No fitting, warping, or registration step.
    reference_ink = np.array(source.convert('L')) < 160
    vector_ink = np.array(vector.convert('L')) < 160
    colour = np.full((source.height, source.width, 3), 255, dtype=np.uint8)
    colour[reference_ink & ~vector_ink] = (35, 118, 196)
    colour[vector_ink & ~reference_ink] = (221, 69, 68)
    colour[reference_ink & vector_ink] = (30, 35, 39)
    overlay = heading(Image.fromarray(colour), f'{key.upper()} · SOURCE / VECTOR OVERLAY', 'Blue: source only    Red: reconstruction only    Dark: both · original coordinates, no post-fit')
    overlay.save(out / 'previews' / f'{key}-overlay.png')
    shutil.copy2(vector_file, out / 'charts' / vector_file.name)

for src in (ROOT / 'public/samples/clinical/assets').glob('*.svg'):
    shutil.copy2(src, out / 'assets' / src.name)
for src in (ROOT / 'public/samples/clinical').glob('*.scene.json'):
    shutil.copy2(src, out / 'scenes' / src.name)
shutil.copy2(ROOT / 'public/samples/clinical/manifest.json', out / 'manifest.json')

html = '''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clinical vectors · source comparison</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f1f4f7;color:#203244;font:15px/1.5 system-ui,sans-serif}header{background:#142c40;color:white;padding:34px max(24px,5vw)}h1{margin:0;font-size:32px}header p{color:#c7d7e5;max-width:850px}main{max-width:1550px;margin:auto;padding:25px}button,select{font:inherit;padding:9px 14px;border:1px solid #bacbd9;border-radius:6px;background:white;color:#193c56;cursor:pointer}button[aria-pressed=true]{background:#195979;color:white;border-color:#195979}nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:20px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{margin:0;background:white;border:1px solid #d8e0e8;border-radius:8px;overflow:hidden}.panel h2{font-size:15px;background:#e7eef4;padding:10px 14px;margin:0}.panel img{display:block;width:100%;height:auto}.overlay{display:none}.overlay img{width:100%;background:white;border:1px solid #d8e0e8}section{margin-bottom:28px}.note{background:#e4eef3;padding:14px 18px;border-radius:7px;max-width:1080px}a{color:#185d82}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;padding:12px;border-bottom:1px solid #d7e1ea}th{background:#e5edf3}.asset-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.asset{border:1px solid #d7e1ea;background:white;border-radius:8px;padding:12px}.asset img{width:100%;height:190px;object-fit:contain}.asset a{display:block;font-weight:600;font-size:13px}.asset small{color:#687c8c}footer{color:#657888;padding:20px 0}@media(max-width:850px){.comparison{grid-template-columns:1fr}.asset-grid{grid-template-columns:repeat(2,1fr)}header{padding:24px}h1{font-size:25px}}
</style>
<header><h1>Clinical vectors · Drawer dioramas</h1><p>Twenty reconstructed views, with editable contours, named anatomy details and independently placeable images. This review compares the finished vectors with all three supplied charts.</p></header>
<main><nav aria-label="Comparison controls"><select id="chart" aria-label="Choose chart"><option value="body">Body · 4 views</option><option value="hands">Hands · 4 views</option><option value="feet">Feet · 12 views</option></select><button id="pair" aria-pressed="true">Side by side</button><button id="overlay" aria-pressed="false">Colour overlay</button><a id="download" href="charts/body-chart.svg" download>Download this SVG</a></nav>
<section class="comparison" id="comparison"><figure class="panel"><h2>Supplied reference</h2><img id="reference" src="references/body.png" alt="Supplied body chart"></figure><figure class="panel"><h2>Reconstructed editable SVG</h2><img id="vector" src="charts/body-chart.svg" alt="Reconstructed body chart"></figure></section>
<section class="overlay" id="overlay-panel"><img id="overlay-image" src="previews/body-overlay.png" alt="Source and reconstruction colour overlay"></section>
<section class="note"><strong>How to read the comparison.</strong> The overlays use the source's original coordinates without post-fitting: blue is source-only ink, red is reconstruction-only ink, and dark is shared ink. The artwork uses manually authored curves. Fine body details remain approximate, and paired views use explicit mirrored masters. Source captions are editable text. Landmark positions are illustration attachment points requiring review before clinical use.</section>
<section><h2>Open as editable Drawer compositions</h2><p>Use <strong>Open project</strong> in the updated Drawer to open a scene, or choose it from <strong>Clinical charts &amp; dioramas</strong>. The <code>projects/</code> folder includes full browser-tested project files.</p><table><thead><tr><th>Composition</th><th>Views</th><th>Landmarks</th><th>Example sites / placements</th></tr></thead><tbody><tr><td><a href="scenes/body-chart.scene.json" download>Body chart</a></td><td>4</td><td>58</td><td>Landmark catalog</td></tr><tr><td><a href="scenes/hands-chart.scene.json" download>Hand chart</a></td><td>4</td><td>52</td><td>12 / 24</td></tr><tr><td><a href="scenes/feet-chart.scene.json" download>Foot chart</a></td><td>12</td><td>78</td><td>4 / 18</td></tr><tr><td><a href="scenes/clinical-atlas.scene.json" download>Combined atlas</a></td><td>20</td><td>188</td><td>16 / 42</td></tr></tbody></table></section>
<section><h2>Individual vector views</h2><div class="asset-grid" id="assets"></div></section><footer>Geometry and integration instructions are in README.txt and docs/clinical-vectors.md. Detailed source rectangles, target IDs and landmarks: <a href="manifest.json">manifest.json</a>. Everything in this review runs offline.</footer></main>
<script>
const assets=ASSET_DATA;
const input=document.getElementById('chart');
function change(){const id=input.value;document.getElementById('reference').src='references/'+id+'.png';document.getElementById('reference').alt='Supplied '+id+' chart';document.getElementById('vector').src='charts/'+id+'-chart.svg';document.getElementById('vector').alt='Reconstructed '+id+' chart';document.getElementById('overlay-image').src='previews/'+id+'-overlay.png';document.getElementById('download').href='charts/'+id+'-chart.svg';}
input.addEventListener('change',change);
for(const mode of ['pair','overlay'])document.getElementById(mode).addEventListener('click',()=>{const over=mode==='overlay';document.getElementById('comparison').style.display=over?'none':'grid';document.getElementById('overlay-panel').style.display=over?'block':'none';document.getElementById('pair').setAttribute('aria-pressed',String(!over));document.getElementById('overlay').setAttribute('aria-pressed',String(over));});
for(const asset of assets){const card=document.createElement('article');card.className='asset';const img=document.createElement('img');img.src='assets/'+asset.id+'.svg';img.alt=asset.name;img.loading='lazy';const a=document.createElement('a');a.href=img.src;a.download='';a.textContent=asset.name;const info=document.createElement('small');info.textContent=asset.landmarks.length+' landmarks · '+asset.pathCount+' vector paths';card.append(img,a,info);document.getElementById('assets').append(card);}
</script></html>'''
assets = [a for chart in manifest['charts'] for a in chart['assets']]
html = html.replace('ASSET_DATA', json.dumps(assets).replace('<', '\\u003c'))
(out / 'comparison.html').write_text(html, encoding='utf-8')
print(f'Created comparisons for all {len(manifest["charts"])} source charts in {out}')
