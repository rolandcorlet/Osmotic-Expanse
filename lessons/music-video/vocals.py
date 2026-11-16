import subprocess, os, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
from lyrics import LY
SR = 48000; BAR = 4 * 60 / 132
k = Kokoro('/tmp/ttsprobe/kokoro-v1.0.int8.onnx', '/tmp/ttsprobe/voices-v1.0.bin')
os.makedirs('vox', exist_ok=True)
def tts(text, voice, speed):
    a, sr = k.create(text, voice=voice, speed=speed, lang='en-gb'); return a, sr
def ff(inp, out, af): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', inp, '-af', af, '-ar', str(SR), '-ac', '1', out], check=True)
total = 66 * BAR + 3; mix = np.zeros(int(total * SR)); cues = []
for i, (bar, slot, text, style) in enumerate(LY):
    layers = {'trailer': [('bm_george', .86, 'asetrate=24000*0.89,aresample=48000', 1.0)],
              'rap': [('bm_fable', 1.12, 'anull', 1.0)],
              'chant': [('bm_fable', 1.05, 'anull', .9), ('bf_emma', 1.05, 'anull', .55), ('bm_george', 1.05, 'asetrate=24000*0.84,aresample=48000', .6)],
              'deep': [('bm_george', .8, 'asetrate=24000*0.7,aresample=48000', 1.2)]}[style]
    tracks = []
    for j, (v, sp, af, g) in enumerate(layers):
        a, sr = tts(text, v, sp); raw = f'vox/{i:02d}_{j}.wav'; sf.write(raw, a, sr)
        out = f'vox/{i:02d}_{j}p.wav'; ff(raw, out, af + ',silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse')
        x, _ = sf.read(out); tracks.append((x, g))
    n = max(len(x) for x, _ in tracks); y = np.zeros(n)
    for x, g in tracks: y[:len(x)] += x * g
    maxlen = slot * BAR * .95
    d = n / SR
    if d > maxlen:  # squeeze to fit the slot
        sf.write('vox/tmp.wav', y, SR); ff('vox/tmp.wav', 'vox/tmp2.wav', f'atempo={min(2.0, d / maxlen):.4f}'); y, _ = sf.read('vox/tmp2.wav')
    st = int(bar * BAR * SR); mix[st:st + len(y)] += y[:len(mix) - st]
    cues.append((bar * BAR, bar * BAR + len(y) / SR, text))
sf.write('vox_dry.wav', mix / np.abs(mix).max() * .9, SR)
import json; json.dump(cues, open('cues.json', 'w'))
print('vocals ok', len(cues))
