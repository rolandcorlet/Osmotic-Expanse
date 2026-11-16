import numpy as np, soundfile as sf, json, sys
SR = 48000
def note(n): return 440 * 2 ** ((n - 69) / 12)
def lp(x, a):  # one-pole low-pass
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s += a * (x[i] - s); y[i] = s
    return y
def env(n, a, d):
    t = np.arange(n) / SR; return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

def lounge(total):
    bpm = 112; beat = 60 / bpm; N = int(total * SR); L = np.zeros(N); Rr = np.zeros(N)
    roots = [40, 40, 43, 45, 40, 40, 46, 47]  # E E G A | E E Bb B (spy walk)
    chords = [[64, 67, 71, 74, 78], [69, 72, 76, 79, 83]]  # Em9, Am9
    t0 = 0; b = 0; rng = np.random.default_rng(3)
    while t0 < total:
        i = int(t0 * SR)
        # bass
        f = note(roots[b % 8]); n = int(beat * .95 * SR); t = np.arange(n) / SR
        sig = (np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) + .12 * np.sin(6 * np.pi * f * t)) * env(n, .005, .32)
        j = min(N, i + n); L[i:j] += .55 * sig[:j - i]; Rr[i:j] += .55 * sig[:j - i]
        # hats on swung 8ths
        for off, vel in ((0, .5), (beat * .66, .3)):
            k = int((t0 + off) * SR); n2 = int(.05 * SR); h = rng.standard_normal(n2) * env(n2, .001, .015)
            h = h - lp(h, .25); j = min(N, k + n2)
            if k < N: L[k:j] += .10 * vel * h[:j - k]; Rr[k:j] += .14 * vel * h[:j - k]
        # vibes every 2 bars
        if b % 8 == 0:
            ch = chords[(b // 8) % 2]; n3 = int(beat * 7 * SR); t = np.arange(n3) / SR
            v = sum(np.sin(2 * np.pi * note(m) * t) for m in ch) / len(ch) * env(n3, .01, 2.2) * (1 + .35 * np.sin(2 * np.pi * 5.2 * t))
            j = min(N, i + n3); L[i:j] += .30 * v[:j - i]; Rr[i:j] += .38 * v[:j - i]
        # rim click on 2 and 4
        if b % 2 == 1:
            n4 = int(.03 * SR); c = rng.standard_normal(n4) * env(n4, .0005, .006); j = min(N, i + n4)
            L[i:j] += .12 * c[:j - i]; Rr[i:j] += .09 * c[:j - i]
        t0 += beat; b += 1
    return np.stack([L, Rr], 1)

def pad(total):
    N = int(total * SR); out = np.zeros((N, 2)); prog = [[50, 53, 57, 62], [46, 50, 53, 58], [41, 45, 48, 53], [48, 52, 55, 60]]  # Dm Bb F C
    seg = 6.0; t0 = 0; k = 0
    while t0 < total:
        n = int((seg + 2) * SR); t = np.arange(n) / SR; sig = np.zeros(n)
        for m in prog[k % 4]:
            for det in (-.12, .12):
                ph = (note(m + det / 1) * t) % 1; sig += (2 * ph - 1) * .5
        sig = lp(sig / 8, .02) * np.minimum(1, t / 2.0) * np.minimum(1, (seg + 2 - t) / 2.0)
        i = int(t0 * SR); j = min(N, i + n)
        out[i:j, 0] += sig[:j - i]; out[i:j, 1] += np.roll(sig, 240)[:j - i]
        t0 += seg; k += 1
    return out

film = sys.argv[1]
total = sum(r['dur'] for r in json.load(open('plan.json'))[film])
m = lounge(total) if film == 'life' else pad(total)
m = m / np.max(np.abs(m)) * .9
fade = int(3 * SR); m[-fade:] *= np.linspace(1, 0, fade)[:, None]; m[:int(.5 * SR)] *= np.linspace(0, 1, int(.5 * SR))[:, None]
sf.write(f'music_{film}.wav', m, SR); print(film, round(total, 1))
