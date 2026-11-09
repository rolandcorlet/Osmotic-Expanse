import json,io,base64
from PIL import Image
im=json.load(open('../images.json'))
def uri(k,w):
    v=im[k]; b=base64.b64decode(v.split(',',1)[1] if v.startswith('data:') else v)
    i=Image.open(io.BytesIO(b)).convert('RGB'); i.thumbnail((w,w))
    o=io.BytesIO(); i.save(o,'WEBP',quality=80); return 'data:image/webp;base64,'+base64.b64encode(o.getvalue()).decode()
IMG={'gnaw':uri('m-gnaw-swarm',640),'flag':uri('lineage-flagellan',480),'banner':uri('banner-world',1280)}
css=open('engine.css').read(); js=open('engine.js').read(); pl=open('player.js').read()
html=f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Osmotic Expanse — How to Play</title><style>{css}
body.film .top,body.film .lessons,body.film .controls,body.film .try{{display:none}}body.film .shell{{padding:0;max-width:none}}body.film .viewer{{border:0;border-radius:0;width:1280px;height:720px}}
</style></head><body><div class="shell">
<div class="top"><div><h1>The Osmotic Expanse — How to Play</h1><p>Seven short animated lessons on the core loop. Use ← → or the buttons; Space pauses.</p></div></div>
<div class="lessons" id="lessons"></div>
<div class="viewer" id="viewer"><div class="scaler" id="scaler"><div class="stage" id="stage"></div></div></div>
<div class="controls"><button class="cbtn" id="bPrev">◀ Back</button><button class="cbtn" id="bReplay">↺ Replay</button><button class="cbtn" id="bNext">Next ▶</button>
<button class="cbtn" id="bAuto">▶ Auto-play</button><button class="cbtn" id="bSpeak">🔈 Read aloud</button><div class="dots" id="dots"></div><span class="small" id="count" style="color:var(--dim)"></span><div class="prog"><i id="bar"></i></div></div>
<div class="try" id="try"></div></div>
<script>window.LESSON_IMG={json.dumps(IMG)};</script><script>{js}</script><script>{pl}</script></body></html>'''
open('lessons.html','w').write(html); print(len(html))
