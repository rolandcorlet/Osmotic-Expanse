"""Re-bake the Director's Assistant from the current books (17 Nov 2026, the v3 rulings pass).

Replaces, in place and nothing else:
  * dm-data.world_books: the four rulebooks' sections and contents, split exactly as the original
    build did (headings # to ###, body = the lines after the heading, trailing blank lines dropped);
  * the three Vector packs' `sections` (OSMO_PACKS: headings # and ##, emphasis stripped from titles);
  * the character generator baked into dm-data.chargen (htmlBase64), from chargen/osmotic-generator.html;
  * Compendium cards: the Protean Folding line the Atlas now prints.
The same pass runs on the Players Assistant (players/index.html), which has the books and the
generator but no Vector packs. (players/build_players.py no longer applies to today's Director's
file, so the Players Assistant is re-baked in place.)

    python3 tools/rebake_assistants.py
"""
import base64, json, re, sys
ROOT = __file__.rsplit('/tools/', 1)[0] + '/'
DM = ROOT + 'DMAssistant_Osmotic_Expanse.html'
BOOKS = {'core': 'The Osmotic Expanse - CORE RULEBOOK.md', 'atlas': "The Osmotic Expanse - PLAYER'S ATLAS.md",
         'codex': "The Osmotic Expanse - DIRECTOR'S CODEX.md", 'bestiary': 'The Osmotic Expanse - LYTIC BESTIARY.md'}
VECTORS = {'first-carve': 'The Osmotic Expanse - THE FIRST CARVE.md', 'ninth-shift': 'The Osmotic Expanse - THE NINTH SHIFT.md',
           'long-swallow': 'The Osmotic Expanse - THE LONG SWALLOW.md'}
# The Assistants have no Engine: lines that speak of the AI Director's Engine doing a roll are dropped.
ENGINE_ONLY = [" The AI Director's Engine makes this roll for you."]

def read(p):
    t = open(ROOT + p, encoding='utf-8').read().lstrip('﻿').replace('\r\n', '\n')
    for x in ENGINE_ONLY: t = t.replace(x, '')
    return t

def split_book(md):
    secs, cur, inside, buf = [], None, False, []
    def close():
        if cur is not None:
            cur['body'] = '\n'.join(buf).rstrip('\n'); secs.append(cur)
    for line in md.split('\n'):
        if line.startswith('```'): inside = not inside
        m = None if inside else re.match(r'^(#{1,3})\s+(.*)$', line)
        if m:
            close(); cur = {'id': f's{len(secs) + 1}', 'heading': m.group(2).strip(), 'depth': len(m.group(1)), 'body': ''}; buf = []
        elif cur is not None: buf.append(line)
    close(); return secs

def split_vector(md):
    secs, cur, inside, buf = [], None, False, []
    def close():
        if cur is not None:
            cur['md'] = '\n'.join(buf).strip('\n'); secs.append(cur)
    for line in md.split('\n'):
        if line.startswith('```'): inside = not inside
        m = None if inside else re.match(r'^(#{1,2})\s+(.*)$', line)
        if m:
            close(); cur = {'level': len(m.group(1)), 'title': m.group(2).strip().replace('*', '')}; buf = []
        elif cur is not None: buf.append(line)
    close(); return secs

def bake(path):
  s = open(path, encoding='utf-8').read()
  dec = json.JSONDecoder()
  compact = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
  spaced = lambda o: json.dumps(o, ensure_ascii=False)

  def replace_value(s, start_key_pos, key, new_json):
      """Replace the JSON value that follows `"key":` at or after start_key_pos."""
      k = s.index(f'"{key}":', start_key_pos) + len(f'"{key}":')
      while s[k] == ' ': k += 1
      _, end = dec.raw_decode(s, k)
      return s[:k] + new_json + s[end:], k + len(new_json)

  # 1. the four rulebooks
  for bid, f in BOOKS.items():
      at = s.index(f'"id":"{bid}","title":"The Osmotic Expanse')
      secs = split_book(read(f))
      toc = [{'sectionId': x['id'], 'heading': x['heading'], 'depth': x['depth']} for x in secs]
      s, _ = replace_value(s, at, 'chars', str(sum(len(x['body']) for x in secs)))
      s, _ = replace_value(s, at, 'sections', compact(secs))
      s, _ = replace_value(s, at, 'toc', compact(toc))
      print(bid, len(secs), 'sections')

  # 2. the Vector packs
  for vid, f in VECTORS.items():
      if f'{{"id": "{vid}", "title": "The ' not in s: continue  # the Players Assistant has no Vectors
      at = s.index(f'{{"id": "{vid}", "title": "The ')
      secs = split_vector(read(f))
      s, _ = replace_value(s, at, 'sections', spaced(secs))
      print(vid, len(secs), 'sections')

  # 3. the character generator
  gen = open(ROOT + 'chargen/osmotic-generator.html', encoding='utf-8').read()
  i = s.index('"htmlBase64":"') + len('"htmlBase64":"'); e = s.index('"', i)
  s = s[:i] + base64.b64encode(gen.encode('utf-8')).decode('ascii') + s[e:]
  print('generator', len(gen), 'chars')

  # 4. Compendium cards: the Atlas's Protean Folding line
  n = s.count('Protean Folding 1 · ')
  s = s.replace('Protean Folding 1 · ', 'Protean Folding 1 (rolled with RTC) · ')
  print('Protean Folding lines', n)
  # 5. Compendium cards: the 17 Nov readings of Chemical Literacy and Pressure Nerves
  for x, y in [('learn one Burst free', 'learn one Burst (it still costs a Synthesis Choice)'),
               ('; +2 Pressure Tolerance', '; +2 dice on Pressure Tolerance rolls'),
               ('"Ignore the first hazard or environmental damage each scene", "+2 Pressure Tolerance"]', '"Ignore the first hazard or environmental damage each scene", "+2 dice on Pressure Tolerance rolls"]')]:
      s = s.replace(x, y)

  open(path, 'w', encoding='utf-8').write(s)


for target in [DM, ROOT + 'players/index.html']:
  print('==', target.rsplit('/', 1)[1])
  bake(target)
