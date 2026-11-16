"""python3 render.py life|quorum [--stills] [--only i,j]  -> out/<film>_NN.mp4 per scene, then the film."""
import json, sys, os, subprocess
from playwright.sync_api import sync_playwright
FPS = 30
film = sys.argv[1]; stills = '--stills' in sys.argv
only = None
if '--only' in sys.argv: only = [int(x) for x in sys.argv[sys.argv.index('--only') + 1].split(',')]
plan = json.load(open('plan.json'))[film]
keys = sorted({v for r in plan for k, v in r['p'].items() if k in ('img', 'a', 'b')} | {c[0] for r in plan for c in r['p'].get('cards', [])})
os.makedirs('out', exist_ok=True); os.makedirs('stills', exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.goto('file://' + os.path.abspath('film.html')); pg.wait_for_timeout(300)
    info = pg.evaluate('([m,p,k]) => film.load(m,p,k)', [film, plan, keys]); print(info, flush=True)
    frame = 0
    for si, sc in enumerate(plan):
        n = int(round(sc['dur'] * FPS))
        if stills:
            for q in (.35, .8):
                pg.evaluate(f'film.draw({si},{sc["dur"]*q},{frame})'); pg.screenshot(path=f'stills/{film}_{si:02d}_{int(q*100)}.jpg', type='jpeg', quality=85)
            frame += n; continue
        if only is not None and si not in only: frame += n; continue
        name = f'out/{film}_{si:02d}.mp4'; tmp = f'out/{film}_{si:02d}.part.mp4'
        ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-f', 'mp4', tmp], stdin=subprocess.PIPE)
        for f in range(n):
            pg.evaluate(f'film.draw({si},{f / FPS},{frame + f})')
            ff.stdin.write(pg.screenshot(type='jpeg', quality=92))
        ff.stdin.close(); rc = ff.wait(); frame += n
        if rc == 0: os.replace(tmp, name); print('ok', name, flush=True)
        else: print('FAIL', name, flush=True)
    b.close()
