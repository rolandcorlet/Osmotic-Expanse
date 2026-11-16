import json, sys, os
from kokoro_onnx import Kokoro
import soundfile as sf
from films import LIFE, QUORUM
VOICE = os.environ.get('VOICE', 'bm_fable')
k = Kokoro('/tmp/ttsprobe/kokoro-v1.0.int8.onnx', '/tmp/ttsprobe/voices-v1.0.bin')
out = {}
for name, film in (('life', LIFE), ('quorum', QUORUM)):
    rows = []
    for i, (kind, say, p) in enumerate(film):
        f = f'vo/{name}_{i:02d}.wav'
        a, sr = k.create(say, voice=VOICE, speed=1.04 if name == 'life' else 0.98, lang='en-gb')
        sf.write(f, a, sr)
        d = len(a) / sr
        lead = 1.2 if kind in ('title', 'qtitle') else 0.6
        rows.append({'kind': kind, 'say': say, 'p': p, 'wav': f, 'vo': round(d, 3), 'lead': lead,
                     'dur': round(max(6.0, lead + d + (2.6 if kind in ('end', 'qend') else 1.1)), 3)})
    out[name] = rows
    print(name, round(sum(r['dur'] for r in rows), 1), 's')
json.dump(out, open('plan.json', 'w'), indent=1)
