"""Can't Avoid the Membrane: an orchestral-EDM track rendered from the GM soundfont. 132 BPM, D minor, 66 bars."""
import numpy as np, soundfile as sf, tinysoundfont
SR = 48000; BPM = 132; BEAT = 60 / BPM; BAR = 4 * BEAT; NB = 66
EV = []  # (time, kind, ch, key, vel)
def note(t, ch, key, dur, vel=100):
    EV.append((t, 1, ch, key, vel)); EV.append((t + dur, 0, ch, key, 0))
def hit(t, key, vel=110): note(t, 9, key, .1, vel)
PROG = {0: 48, 1: 44, 2: 52, 3: 61, 4: 60, 5: 47, 6: 38, 7: 45, 8: 81, 10: 55, 11: 8, 12: 57, 13: 33}
# 0 strings, 1 tremolo, 2 choir, 3 brass, 4 horn, 5 timpani, 6 synth bass, 7 pizz, 8 saw lead, 10 orch hit, 11 celesta, 12 trombone, 13 finger bass
CH = {'Dm': (38, [62, 65, 69]), 'Bb': (34, [62, 65, 70]), 'F': (41, [60, 65, 69]), 'C': (36, [60, 64, 67]), 'Gm': (43, [62, 67, 70]), 'A': (45, [61, 64, 69])}
PROGR = ['Dm', 'Bb', 'F', 'C']
MEL = [(0, 74, 1.5), (1.5, 77, .5), (2, 76, 1), (3, 74, 1), (4, 70, 2), (6, 72, 1), (7, 74, 1), (8, 72, 1.5), (9.5, 77, .5), (10, 76, 1), (11, 72, 1), (12, 72, 2), (14, 69, 2),
       (16, 74, 1.5), (17.5, 77, .5), (18, 79, 1), (19, 81, 1), (20, 82, 2), (22, 81, 1), (23, 79, 1), (24, 77, 1.5), (25.5, 76, .5), (26, 74, 1), (27, 76, 1), (28, 74, 4)]
def bar_t(b): return b * BAR
def section(b):
    if b < 8: return 'intro'
    if b < 24: return 'verse'
    if b < 40: return 'chorus'
    if b < 48: return 'bridge'
    if b < 62: return 'final'
    return 'outro'
for b in range(NB):
    sec = section(b); t0 = bar_t(b); up = 2 if sec in ('final', 'outro') else 0
    chname = PROGR[b % 4] if sec != 'bridge' else ['Dm', 'Dm', 'Bb', 'A'][b % 4]
    root, tri = CH[chname]; root += up; tri = [k + up for k in tri]
    if sec == 'intro':
        for k in tri: note(t0, 2, k, BAR, 70 + b * 5)
        for k in tri: note(t0, 1, k - 12, BAR, 55 + b * 6)
        note(t0, 6, root - 12 + 12, BAR, 60)
        if b >= 6:
            for i in range(16): note(t0 + i * BEAT / 4, 5, 38 if b == 6 else 45, BEAT / 4, 60 + i * 3 + (b - 6) * 20)
        if b == 7:
            for i in range(16): hit(t0 + i * BEAT / 4, 38, 50 + i * 4)
    if sec in ('verse', 'chorus', 'final'):
        big = sec != 'verse'
        for i in range(4):  # drums
            bt = t0 + i * BEAT
            if big or i in (0, 2): hit(bt, 36, 120)
            if i == 2 and not big: pass
            if i in (1, 3): hit(bt, 38, 105); hit(bt, 39, 70 if big else 0)
            hit(bt, 42, 70); hit(bt + BEAT / 2, 42 if not big else 46, 60)
            if not big and i == 1: hit(bt + BEAT / 2, 36, 100)
        if b % 4 == 0: hit(t0, 49, 115)
        if big and b % 2 == 1: hit(t0 + 3.5 * BEAT, 38, 90)
        for i in range(8): note(t0 + i * BEAT / 2, 6, root, BEAT / 2 * .9, 112)  # driving bass
        for i in range(8): note(t0 + i * BEAT / 2, 13, root - 12, BEAT / 2 * .9, 90)
        arp = [tri[0], tri[1], tri[2], tri[1] + 12 if tri[1] + 12 < 90 else tri[1]]
        for i in range(16): note(t0 + i * BEAT / 4, 7, arp[i % 4] + 12, BEAT / 4, 80 if big else 92)
        if b % 2 == 0:
            for k in tri: note(t0, 3, k - 12, BEAT * .6, 115); note(t0 + 1.5 * BEAT, 3, tri[0] - 12, BEAT * .4, 100)
            for k in tri: note(t0, 12, k - 24, BEAT * .6, 100)
        for k in tri: note(t0, 0, k - 12, BAR, 75)
        if big:
            for k in tri: note(t0, 2, k, BAR, 95)
            for k in tri: note(t0, 1, k + 12, BAR, 60)
            beat_in = ((b - (24 if sec == 'chorus' else 48)) % 8) * 4
            for (o, k, d) in MEL:
                if beat_in <= o < beat_in + 4:
                    tt = t0 + (o - beat_in) * BEAT
                    note(tt, 4, k + up, d * BEAT * .95, 118); note(tt, 3, k + up, d * BEAT * .95, 108)
                    if sec == 'final': note(tt, 8, k + up + 12, d * BEAT * .9, 80)
        if b % 4 == 0: note(t0, 10, root + 12, BEAT, 110)
        if b % 4 == 0: note(t0, 5, root if root > 40 else root + 12, BEAT, 120)
    if sec == 'bridge':
        for k in tri: note(t0, 2, k, BAR, 85)
        note(t0, 6, root - 12 + 12, BAR, 80)
        for i, k in enumerate([tri[2] + 12, tri[1] + 12, tri[0] + 12, tri[1] + 12] * 2): note(t0 + i * BEAT / 2, 11, k, BEAT / 2, 90)
        if b in (40, 42, 44): hit(t0, 36, 127); note(t0, 5, 38, BEAT * 2, 127); note(t0, 10, 50, BEAT, 120)
        if b == 46:
            for i in range(16): hit(t0 + i * BEAT / 4, 38, 50 + i * 4)
        if b == 47:
            for i in range(32): hit(t0 + i * BEAT / 8, 38, 70 + i * 2)
            for i in range(8): note(t0 + i * BEAT / 2, 5, 45, BEAT / 2, 90 + i * 4)
    if sec == 'outro':
        if b == 62:
            hit(t0, 49, 127); hit(t0, 36, 127); note(t0, 10, 50, BEAT * 2, 127)
            for k in tri: note(t0, 2, k, BAR * 4, 110); note(t0, 0, k - 12, BAR * 4, 100); note(t0, 3, k - 12, BAR * 2, 110)
            note(t0, 6, root, BAR * 3, 110)
            for i in range(24): note(t0 + BAR * 2 + i * BEAT / 4, 5, 38 + up, BEAT / 4, 60 + i * 2)
        if b == 65: hit(t0 + BEAT * 0, 49, 127); hit(t0, 36, 127); note(t0, 10, 38 + up + 12, BEAT * 3, 127); note(t0, 5, 38 + up, BEAT * 2, 127)
EV.sort(key=lambda e: (e[0], e[1]))
s = tinysoundfont.Synth(samplerate=SR, gain=-3)
sfid = s.sfload('/usr/share/sounds/sf2/TimGM6mb.sf2')
for ch, p in PROG.items(): s.program_select(ch, sfid, 0, p)
s.program_select(9, sfid, 128, 0, is_drums=True)
total = NB * BAR + 3.0; N = int(total * SR); out = np.zeros((N, 2), np.float32); pos = 0
for (t, kind, ch, key, vel) in EV + [(total, 0, 0, 0, 0)]:
    n = int(t * SR) - pos
    if n > 0:
        out[pos:pos + n] = np.frombuffer(s.generate(n), dtype=np.float32).reshape(-1, 2); pos += n
    if kind == 1: s.noteon(ch, key, vel)
    elif key: s.noteoff(ch, key)
out = out / max(1e-6, np.abs(out).max()) * .89
sf.write('song_raw.wav', out, SR); print('song', round(total, 2), 's', len(EV), 'events')
