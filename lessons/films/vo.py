import json, sys, os
from kokoro_onnx import Kokoro
import soundfile as sf
from films import LIFE, QUORUM, UI
import json as _j
WHICH = sys.argv[1:] or ['life', 'quorum']
VOICE = os.environ.get('VOICE', 'bm_fable')
k = Kokoro('/tmp/ttsprobe/kokoro-v1.0.int8.onnx', '/tmp/ttsprobe/voices-v1.0.bin')
out = _j.load(open('plan.json')) if os.path.exists('plan.json') else {}
for name, film in [x for x in (('life', LIFE), ('quorum', QUORUM), ('ui', UI)) if x[0] in WHICH]:
    rows = []
    for i, (kind, say, p) in enumerate(film):
        f = f'vo/{name}_{i:02d}.wav'
        a, sr = k.create(say, voice=VOICE, speed=0.98 if name == 'quorum' else 1.04, lang='en-gb')
        sf.write(f, a, sr)
        d = len(a) / sr
        lead = 1.2 if kind in ('title', 'qtitle') else 0.6
        rows.append({'kind': kind, 'say': say, 'p': p, 'wav': f, 'vo': round(d, 3), 'lead': lead,
                     'dur': round(max(6.0, lead + d + (2.6 if kind in ('end', 'qend') else 1.1)), 3)})
    out[name] = rows
    print(name, round(sum(r['dur'] for r in rows), 1), 's')
json.dump(out, open('plan.json', 'w'), indent=1)
