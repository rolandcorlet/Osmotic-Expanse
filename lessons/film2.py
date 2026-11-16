"""Render the How-to-Play lessons to narrated MP4s for YouTube.
   python3 film2.py [lesson numbers...]   (default: all)  ->  video/NN-title.mp4 + .srt, plus video/ALL.srt
Needs: playwright, ffmpeg, kokoro-onnx + soundfile and its two model files (see MODEL below)."""
import subprocess, os, sys, re, json, html, wave
from playwright.sync_api import sync_playwright
FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get('KOKORO_DIR', '/tmp/ttsprobe')
VOICE = os.environ.get('VOICE', 'bf_emma')
OUT = os.path.join(HERE, 'video'); os.makedirs(OUT, exist_ok=True)
plain = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()
def ts(t):
    t = float(t)
    h, r = divmod(t, 3600); m, s = divmod(r, 60); return ('%02d:%02d:%06.3f' % (h, m, s)).replace('.', ',')

def narrate(li, steps, tts):
    import soundfile as sf
    paths = []
    for si, st in enumerate(steps):
        p = f'{OUT}/.a{li+1}_{si}.wav'
        txt = plain(st['say'])
        if txt and not os.path.exists(p):
            a, sr = tts.create(txt, voice=VOICE, speed=0.97, lang='en-gb'); sf.write(p, a, sr)
        paths.append(p if txt else None)
    return paths

def dur_of(p):
    with wave.open(p) as w: return w.getnframes() / w.getframerate()

def main(which):
    from kokoro_onnx import Kokoro
    tts = Kokoro(f'{MODEL}/kokoro-v1.0.int8.onnx', f'{MODEL}/voices-v1.0.bin')
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 720})
        pg.goto('file://' + HERE + '/lessons.html?film=1'); pg.wait_for_timeout(600)
        data = pg.evaluate('window.LESSONS.map(l=>({title:l.title,steps:l.steps.map(s=>({dur:s.dur,say:s.say||""}))}))')
        for li in which:
            l = data[li]; steps = l['steps']; wavs = narrate(li, steps, tts)
            durs = []
            for st, w in zip(steps, wavs):
                d = st['dur']
                if w: d = max(d, dur_of(w) + 0.9)   # hold each scene until the line has finished
                durs.append(round(d * FPS) / FPS)
            pg.evaluate('(a)=>{const [li,d]=a;window.LESSONS[li].steps.forEach((s,i)=>s.dur=d[i])}', [li, durs])
            slug = f"{li+1:02d}-{re.sub(r'[^a-z0-9]+','-',l['title'].lower()).strip('-')}"
            name = f'{OUT}/{slug}.mp4'; tmp = f'{OUT}/{slug}.part.mp4'
            # soundtrack: each line starts 0.35s into its scene
            ins, filt, lab, t0, srt = [], [], [], 0.0, []
            for si, (w, d) in enumerate(zip(wavs, durs)):
                if w:
                    ins += ['-i', w]; k = len(lab)
                    filt.append(f'[{k+1}:a]adelay={int((t0+0.35)*1000)}|{int((t0+0.35)*1000)}[a{k}]'); lab.append(f'[a{k}]')
                    srt.append((t0 + 0.35, t0 + 0.35 + dur_of(w), plain(steps[si]['say'])))
                t0 += d
            mix = ''.join(f for f in [';'.join(filt)]) + ';' + ''.join(lab) + f'amix=inputs={len(lab)}:normalize=0,apad,atrim=0:{t0:.3f}[aout]'
            ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-', *ins,
                '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS),
                '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', '-f', 'mp4', tmp], stdin=subprocess.PIPE)
            for si, d in enumerate(durs):
                pg.evaluate(f'lessonAPI.show({li},{si})')
                for f in range(int(round(d * FPS))):
                    pg.evaluate(f'lessonAPI.seek({f/FPS})')
                    ff.stdin.write(pg.screenshot(type='jpeg', quality=92))
            ff.stdin.close(); rc = ff.wait()
            if rc == 0:
                os.replace(tmp, name)
                open(name[:-4] + '.srt', 'w').write('\n'.join(f'{i+1}\n{ts(a)} --> {ts(z)}\n{t}\n' for i, (a, z, t) in enumerate(srt)))
                print('ok', name, round(t0), 's', flush=True)
            else: print('FAIL', name, flush=True)
        b.close()

if __name__ == '__main__':
    main([int(x) - 1 for x in sys.argv[1:]] or range(7))
