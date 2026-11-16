import json, sys, subprocess, os
film = sys.argv[1]; plan = json.load(open('plan.json'))[film]
title = {'life': 'the-osmotic-expanse-life-in-the-soup', 'quorum': 'quorum-a-history-of-the-air', 'ui': 'osmotic-expanse-how-the-player-screen-works'}[film]
open('list.txt', 'w').write(''.join(f"file '{os.path.abspath(f'out/{film}_{i:02d}.mp4')}'\n" for i in range(len(plan))))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', f'out/{film}_video.mp4'], check=True)
ins, filt, labs, t0, srt = [], [], [], 0.0, []
def ts(t):
    h, r = divmod(t, 3600); m, s = divmod(r, 60); return ('%02d:%02d:%06.3f' % (h, m, s)).replace('.', ',')
for i, r in enumerate(plan):
    st = t0 + r['lead']; ins += ['-i', r['wav']]; ms = int(st * 1000)
    filt.append(f'[{i + 2}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay={ms}|{ms}[v{i}]'); labs.append(f'[v{i}]')
    # captions: split long lines into ~2 cues by sentence
    words = r['say'].split(); n = max(1, round(len(words) / 18)); per = r['vo'] / n
    for k in range(n):
        chunk = ' '.join(words[k * len(words) // n:(k + 1) * len(words) // n])
        srt.append((st + k * per, st + (k + 1) * per, chunk))
    t0 += r['dur']
f = ';'.join(filt) + ';' + ''.join(labs) + f'amix=inputs={len(labs)}:normalize=0,apad,atrim=0:{t0:.3f},asplit=2[vo][sc];'
vol = .34 if film == 'quorum' else .11
f += f'[1:a]volume={vol}[mu];[mu][sc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[duck];[vo][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]'
out = f'{title}.mp4'; tmp = f'{title}.part.mp4'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'out/{film}_video.mp4', '-i', f'music_{film}.wav', *ins, '-filter_complex', f,
                '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest', '-f', 'mp4', tmp], check=True)
os.replace(tmp, out)
open(f'{title}.srt', 'w').write('\n'.join(f'{i + 1}\n{ts(a)} --> {ts(b)}\n{t}\n' for i, (a, b, t) in enumerate(srt)))
print(out)
