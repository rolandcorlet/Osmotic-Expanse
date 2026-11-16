import json, sys, os, subprocess
from playwright.sync_api import sync_playwright
FPS = 30; stills = '--stills' in sys.argv
cues = json.load(open('cues.json')); keys = [f[:-4] for f in os.listdir('img')]
os.makedirs('clips', exist_ok=True); os.makedirs('stills', exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + os.path.abspath('mv.html')); pg.wait_for_timeout(300)
    durs = pg.evaluate('([k,c]) => mv.load(k,c)', [keys, cues]); frame = 0
    for ci, d in enumerate(durs):
        n = int(round(d * FPS))
        if stills:
            for q in (.3, .75):
                pg.evaluate(f'mv.draw({ci},{d*q},{frame})'); pg.screenshot(path=f'stills/{ci:02d}_{int(q*100)}.jpg', type='jpeg', quality=80)
            frame += n; continue
        name = f'clips/{ci:02d}.mp4'; tmp = f'clips/{ci:02d}.part.mp4'
        ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-f', 'mp4', tmp], stdin=subprocess.PIPE)
        for f in range(n):
            pg.evaluate(f'mv.draw({ci},{f / FPS},{frame + f})'); ff.stdin.write(pg.screenshot(type='jpeg', quality=90))
        ff.stdin.close(); rc = ff.wait(); frame += n
        if rc == 0: os.replace(tmp, name); print('ok', name, flush=True)
    print('errors', errs[:3]); b.close()
