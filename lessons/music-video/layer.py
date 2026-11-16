import numpy as np, soundfile as sf
SR = 48000; BEAT = 60 / 132; BAR = 4 * BEAT; NB = 66
a, _ = sf.read('song_raw.wav'); N = len(a); L = np.zeros((N, 2))
rng = np.random.default_rng(1)
def add(i, sig, pan=0.0, g=1.0):
    j = min(N, i + len(sig))
    if i >= N: return
    L[i:j, 0] += sig[:j - i] * g * (1 - max(0, pan)); L[i:j, 1] += sig[:j - i] * g * (1 + min(0, pan))
def env(n, a, d): t = np.arange(n) / SR; return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
def hp(x, k=.9):  # crude high-pass
    y = np.copy(x); k = k[1:] if np.ndim(k) else k; y[1:] = x[1:] - k * x[:-1]; return y
def kick():
    n = int(.35 * SR); t = np.arange(n) / SR; f = 45 + 120 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(2.2 * np.sin(ph) * np.exp(-t * 7))
def snare():
    n = int(.25 * SR); return np.tanh(1.5 * (hp(rng.standard_normal(n), .7) * env(n, .001, .07) + .5 * np.sin(2 * np.pi * 190 * np.arange(n) / SR) * env(n, .001, .05)))
def hat(o=False):
    n = int((.18 if o else .05) * SR); x = hp(hp(rng.standard_normal(n), .95), .95); return x * env(n, .0005, .06 if o else .012) * .5
def saws(freqs, dur, cutoff_open=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for f in freqs:
        for d in (-.12, -.06, 0, .06, .12):
            out += 2 * ((t * f * 2 ** (d / 12) + rng.random()) % 1) - 1
    out /= (len(freqs) * 5)
    # one-pole lowpass with opening cutoff
    a = .05 + .35 * cutoff_open; y = np.zeros(n); s = 0.0
    for i in range(0, n, 64):
        seg = out[i:i + 64]; yy = np.empty_like(seg)
        for k in range(len(seg)): s += a * (seg[k] - s); yy[k] = s
        y[i:i + 64] = yy
    return y * env(n, .01, dur * .8)
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
CH = {'Dm': [50, 53, 57, 62], 'Bb': [46, 50, 53, 58], 'F': [41, 45, 48, 53], 'C': [48, 52, 55, 60]}
PRO = ['Dm', 'Bb', 'F', 'C']
K, S, H, HO = kick(), snare(), hat(), hat(True)
for b in range(NB):
    t0 = b * BAR; i0 = int(t0 * SR); up = 2 if b >= 48 else 0
    big = 24 <= b < 40 or 48 <= b < 62
    groove = 8 <= b < 40 or 48 <= b < 62
    if groove:
        for q in range(4):
            i = int((t0 + q * BEAT) * SR)
            if big or q in (0, 2): add(i, K, 0, .55)
            if q in (1, 3): add(i, S, 0, .35)
            add(i + int(BEAT / 2 * SR), HO if big else H, .3, .35)
            add(i, H, -.3, .25)
        if big:
            ch = [mtof(m + up + 12) for m in CH[PRO[b % 4]]]
            for q in range(8): add(int((t0 + q * BEAT / 2) * SR), saws(ch, BEAT / 2 * .9, .3 + .7 * (q % 2)), 0, .22)
    # risers into sections and impacts
    if b in (7, 23, 47, 61):
        n = int(BAR * SR); t = np.arange(n) / SR; x = hp(rng.standard_normal(n), .3 + .65 * t / BAR) * (t / BAR) ** 2
        add(i0, x * .35)
    if b in (8, 24, 40, 48, 62):
        n = int(1.6 * SR); t = np.arange(n) / SR; sub = np.sin(2 * np.pi * np.cumsum(60 * np.exp(-t * 1.5) + 30) / SR) * np.exp(-t * 2)
        add(i0, np.tanh(2 * sub) * .7 + hp(rng.standard_normal(n), .5) * np.exp(-t * 6) * .3)
mix = a * .8 + L
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
sf.write('song_mix.wav', mix / np.abs(mix).max() * .9, SR); print('ok')
