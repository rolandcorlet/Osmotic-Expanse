import re, sys
rev1 = open('quorum-rev1.md', encoding='utf-8').read()
# --- parse rev1 ---
lines = rev1.split('\n'); sec = {}; chap = {}; cur = None; curc = None
for L in lines:
    if L.startswith('# ') :
        curc = L[2:].strip(); chap[curc] = []; cur = None; continue
    if L.startswith('## '):
        cur = L[3:].strip(); sec[cur] = []; continue
    if cur: sec[cur].append(L)
    elif curc: chap[curc].append(L)
def clean(body):
    t = '\n'.join(body).strip('\n')
    t = re.sub(r'\n*---\s*$', '', t).strip('\n')
    return t
SEC = {'1.1':'2.1','1.2':'2.2','1.3':'2.3','1.4':'2.4','1.5':'2.5','1.6':'2.7',
 '2.1':'4.1','2.2':'4.2','2.3':'4.3','2.4':'4.4','2.5':'4.5','2.6':'4.6','2.7':'4.7','2.8':'4.8',
 '3.1':'7.1','3.2':'7.2','3.3':'7.3','3.4':'7.4','3.5':'7.5',
 '4.1':'5.1','4.2':'5.2','4.3':'5.3','4.4':'5.4',
 '5.1':'9.1','5.2':'9.2','5.3':'9.3','5.4':'9.4','5.5':'9.5','5.6':'9.6',
 '6.1':'10.1','6.2':'10.2','6.3':'10.3','6.4':'10.4','6.5':'10.5',
 '7.1':'8.1','7.2':'8.3','7.3':'8.4',
 '8.1':'13.1','8.2':'13.2','8.3':'13.3','8.4':'13.4','8.5':'13.5',
 '9.1':'12.3','10.1':'11.5','10.2':'11.6','10.3':'14.1','10.4':'14.2','10.5':'14.3','10.6':'14.4','10.7':'14.5',
 '11.1':'15.1','11.2':'15.2','11.3':'15.3','11.4':'15.4','11.5':'15.5',
 '12.1':'16.1','12.2':'16.2','14.3':'17.6','14.4':'13.5','14.5':'17.7','16.1':'18.1','16.2':'18.3','16.3':'18.4'}
CH = {'1':'2','2':'4','3':'7','4':'5','5':'9','6':'10','7':'8','8':'13','9':'12','10':'14','11':'15','12':'16','13':'16','14':'17','15':'17','16':'18'}
EXT = re.compile(r'(Core|Codex|Atlas|Bestiary|CORE|CODEX|ATLAS|BESTIARY)')
def external(t, i):
    j = max(t.rfind('(', 0, i), t.rfind(';', 0, i), t.rfind('\n', 0, i), i - 40)
    seg = t[j:i]
    # the nearest preceding token decides: an external book name after the last 'Ch.'/'§'-free gap
    m = list(EXT.finditer(seg))
    if not m: return False
    last = m[-1].end()
    between = seg[last:]
    # "Core §4.2, §5.8" -> the second is still Core's; "Core §4.2; see §2.2" handled by ';' cut
    return True
def remap(t):
    def fs(m):
        if external(t, m.start()): return m.group(0)
        k = m.group(1) + '.' + m.group(2)
        return '§' + SEC.get(k, '??' + k)
    t = re.sub(r'§(\d+)\.(\d+)', fs, t)
    def fc(m):
        if external(t, m.start()): return m.group(0)
        return 'Ch. ' + CH.get(m.group(1), '??' + m.group(1))
    t = re.sub(r'Ch\. (\d+)', fc, t)
    t = t.replace('trail-script (Ch. 14)', 'trail-script (Ch. 11)').replace('trail-script, Ch. 14', 'trail-script, Ch. 11')
    t = t.replace("The **Porters' Pumps**", "The **haulers of the Pump**").replace("Porters' Pumps", "haulers' Pump")
    t = re.sub(r'\bporters\b', 'haulers', t); t = re.sub(r'\bporter\b', 'hauler', t)
    t = t.replace('Gradient Economy', 'Uphill Economy')
    return t
out = []
for part in 'ABCD':
    s = open(part + '.md', encoding='utf-8').read()
    def rep(m):
        kind, key = m.group(1), m.group(2).strip()
        if kind == 'R':
            if key not in sec: sys.exit('missing section ' + key)
            return remap(clean(sec[key]))
        if key not in chap: sys.exit('missing chapter ' + key)
        return remap(clean(chap[key]))
    s = re.sub(r'\{\{(RI|R):([^}]+)\}\}', rep, s)
    out.append(s)
book = '\n'.join(out)
open('quorum2.md', 'w', encoding='utf-8').write(book)
print('words', len(book.split()))
print('unmapped', re.findall(r'\?\?[\d.]+', book))
# check internal refs resolve
heads = set(re.findall(r'^## (\d+\.\d+)', book, re.M)); chaps = set(re.findall(r'^# (\d+) ·', book, re.M))
bad = []
for m in re.finditer(r'§(\d+\.\d+)', book):
    if not external(book, m.start()) and m.group(1) not in heads: bad.append((m.group(1), book[m.start()-50:m.start()+10].replace('\n',' ')))
for m in re.finditer(r'Ch\. (\d+)', book):
    if not external(book, m.start()) and m.group(1) not in chaps: bad.append(('Ch'+m.group(1), book[m.start()-40:m.start()+10]))
print('bad refs', len(bad)); [print(' ', b) for b in bad[:30]]
print('leftovers', [w for w in ['porter','Porters','Gradient','{{'] if w in book.replace('Porter (','').replace('Porter-','').replace('**Porter**','')])
