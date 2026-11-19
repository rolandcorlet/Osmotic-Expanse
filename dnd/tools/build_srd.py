#!/usr/bin/env python3
"""Builds dnd/data/srd.json, the compact D&D 5e rules data every D&D app reads.

Source: the 5e System Reference Document 5.1 as published in JSON by 5e-bits/5e-database
(https://github.com/5e-bits/5e-database). The SRD is (c) Wizards of the Coast and is released
under the Creative Commons Attribution 4.0 licence; the attribution goes into the file.

    git clone --depth 1 https://github.com/5e-bits/5e-database /tmp/srd/5e-database
    python3 dnd/tools/build_srd.py /tmp/srd/5e-database/src/2014/en

The text is cleaned for reading on a screen (doubled dashes, stray spaces, "GM" made "DM").
"""
import json, re, sys, os

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/srd/5e-database/src/2014/en'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'srd.json')
load = lambda n: json.load(open(os.path.join(SRC, f'5e-SRD-{n}.json'), encoding='utf-8'))

ATTRIB = ('This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of '
          'the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 '
          'is licensed under the Creative Commons Attribution 4.0 International License available at '
          'https://creativecommons.org/licenses/by/4.0/legalcode. Data via 5e-bits/5e-database.')

def clean(t):
    t = str(t or '')
    t = t.replace('--', '—').replace(' ,', ',').replace(' ', ' ')
    t = re.sub(r'\bGM\b', 'DM', t)
    t = re.sub(r'\bGMs\b', 'DMs', t)
    t = re.sub(r'[ \t]{2,}', ' ', t)
    t = t.replace('spell casting', 'spellcasting').replace(' . ', '. ')
    # Ability names are capitalised in the books ("a Dexterity saving throw"); some SRD text has them lower case.
    t = re.sub(r'\b(strength|dexterity|constitution|intelligence|wisdom|charisma)(?= (?:saving throw|check|modifier|score|\())',
               lambda m: m.group(1).capitalize(), t)
    return t.strip()

def para(lst):
    if isinstance(lst, str): return clean(lst)
    return '\n'.join(clean(x) for x in (lst or []) if str(x).strip())

AB = ['str', 'dex', 'con', 'int', 'wis', 'cha']
ABN = {'str': 'Strength', 'dex': 'Dexterity', 'con': 'Constitution', 'int': 'Intelligence', 'wis': 'Wisdom', 'cha': 'Charisma'}

out = {'attribution': ATTRIB, 'version': 'SRD 5.1'}

out['abilities'] = [{'id': a['index'], 'name': a['full_name'], 'short': a['name'], 'desc': para(a['desc'])} for a in load('Ability-Scores')]
out['skills'] = [{'id': s['index'], 'name': s['name'], 'ability': s['ability_score']['index'], 'desc': para(s['desc'])} for s in load('Skills')]
out['conditions'] = [{'id': c['index'], 'name': c['name'], 'desc': para(c['desc'])} for c in load('Conditions')]
out['damageTypes'] = [{'id': d['index'], 'name': d['name'], 'desc': para(d['desc'])} for d in load('Damage-Types')]
out['languages'] = [{'id': l['index'], 'name': l['name'], 'type': l.get('type', ''), 'script': l.get('script', '') or ''} for l in load('Languages')]
out['weaponProperties'] = [{'id': w['index'], 'name': w['name'], 'desc': para(w['desc'])} for w in load('Weapon-Properties')]
out['schools'] = [{'id': s['index'], 'name': s['name'], 'desc': clean(s.get('desc', ''))} for s in load('Magic-Schools')]

# ---- equipment
cats = load('Equipment-Categories')
catOf = {}
for c in cats:
    for e in c.get('equipment', []): catOf.setdefault(e['index'], []).append(c['name'])
weapons, armor, gear = [], [], []
def cost(c): return f"{c['quantity']} {c['unit']}" if c else ''
for e in load('Equipment'):
    base = {'id': e['index'], 'name': e['name'], 'cost': cost(e.get('cost')), 'weight': e.get('weight', 0)}
    if e.get('weapon_category'):
        d = e.get('damage') or {}
        w = dict(base, cat=e['weapon_category'], range=e.get('weapon_range', ''), dmg=d.get('damage_dice', ''),
                 type=(d.get('damage_type') or {}).get('index', ''), props=[p['index'] for p in e.get('properties', [])])
        r = e.get('range') or {}
        if r.get('long'): w['reach'] = f"{r.get('normal')}/{r.get('long')}"
        t = e.get('throw_range')
        if t: w['thrown'] = f"{t.get('normal')}/{t.get('long')}"
        if e.get('two_handed_damage'): w['versatile'] = e['two_handed_damage'].get('damage_dice', '')
        weapons.append(w)
    elif e.get('armor_category'):
        ac = e.get('armor_class') or {}
        armor.append(dict(base, cat=e['armor_category'], ac=ac.get('base', 0), dex=bool(ac.get('dex_bonus')),
                          max=ac.get('max_bonus'), str=e.get('str_minimum', 0), stealth=bool(e.get('stealth_disadvantage'))))
    else:
        g = dict(base, cat=(e.get('gear_category') or e.get('equipment_category') or {}).get('name', ''))
        if e.get('desc'): g['desc'] = para(e['desc'])
        if e.get('contents'): g['contents'] = [f"{x['quantity']} {x['item']['name']}" for x in e['contents']]
        gear.append(g)
out['weapons'], out['armor'], out['gear'] = weapons, armor, gear

out['magicItems'] = [{'id': m['index'], 'name': m['name'], 'rarity': (m.get('rarity') or {}).get('name', ''),
                      'cat': (m.get('equipment_category') or {}).get('name', ''),
                      'attune': 'attunement' in ' '.join(m.get('desc', [])[:1]).lower(),
                      'desc': para(m.get('desc'))} for m in load('Magic-Items') if not m.get('variant')]

# ---- spells
spells = []
for s in load('Spells'):
    x = {'id': s['index'], 'name': s['name'], 'level': s['level'], 'school': s['school']['name'],
         'time': s['casting_time'], 'range': s['range'], 'comp': ''.join(s.get('components', [])),
         'mat': clean(s.get('material', '')), 'dur': s['duration'], 'conc': bool(s.get('concentration')),
         'ritual': bool(s.get('ritual')), 'classes': [c['index'] for c in s.get('classes', [])],
         'desc': para(s.get('desc')), 'higher': para(s.get('higher_level'))}
    if s.get('attack_type'): x['attack'] = s['attack_type']
    if s.get('dc'): x['save'] = {'ability': s['dc']['dc_type']['index'], 'success': s['dc'].get('dc_success', 'none')}
    for dmg in (s.get('damage') or {},) if isinstance(s.get('damage'), dict) else []:
        if dmg.get('damage_type'): x['dmgType'] = dmg['damage_type']['index']
        if dmg.get('damage_at_slot_level'): x['dmgSlot'] = dmg['damage_at_slot_level']
        if dmg.get('damage_at_character_level'): x['dmgLevel'] = dmg['damage_at_character_level']
    if s.get('heal_at_slot_level'): x['heal'] = {k: v.replace(' ', '') for k, v in s['heal_at_slot_level'].items()}
    if s.get('area_of_effect'): x['area'] = f"{s['area_of_effect']['size']}-foot {s['area_of_effect']['type']}"
    spells.append(x)
out['spells'] = sorted(spells, key=lambda v: (v['level'], v['name']))

# ---- monsters
def acOf(m):
    a = (m.get('armor_class') or [{}])[0]
    note = a.get('type', '')
    if a.get('armor'): note = ', '.join(x['name'].lower() for x in a['armor'])
    return a.get('value', 10), ('' if note in ('dex', '') else note)
def act(a):
    r = {'n': a['name'], 'd': clean(a.get('desc', ''))}
    if a.get('attack_bonus') is not None: r['hit'] = a['attack_bonus']
    dm = [d for d in a.get('damage', []) if d.get('damage_dice')]
    if dm: r['dmg'] = [[d['damage_dice'].replace(' ', ''), (d.get('damage_type') or {}).get('index', '')] for d in dm]
    if a.get('dc'): r['dc'] = [a['dc']['dc_type']['index'], a['dc']['dc_value'], a['dc'].get('success_type', 'none')]
    if a.get('usage'):
        u = a['usage']
        r['use'] = (f"Recharge {u.get('min_value')}-6" if u.get('type') == 'recharge on roll' else
                    f"{u.get('times')}/{u.get('type', '').replace('per ', '')}" if u.get('times') else u.get('type', ''))
    return r
mons = []
for m in load('Monsters'):
    ac, acn = acOf(m)
    saves, skills = {}, {}
    for p in m.get('proficiencies', []):
        i = p['proficiency']['index']
        if i.startswith('saving-throw-'): saves[i[13:]] = p['value']
        elif i.startswith('skill-'): skills[p['proficiency']['name'][7:]] = p['value']
    senses = ', '.join(f"{k.replace('_', ' ').replace('passive perception', 'passive Perception')} {v}" for k, v in (m.get('senses') or {}).items())
    x = {'id': m['index'], 'name': m['name'], 'size': m['size'], 'type': m['type'], 'sub': m.get('subtype') or '',
         'align': m.get('alignment', ''), 'ac': ac, 'acNote': acn, 'hp': m['hit_points'], 'hd': m.get('hit_points_roll') or m.get('hit_dice'),
         'speed': ', '.join((k + ' ' if k != 'walk' else '') + str(v) for k, v in (m.get('speed') or {}).items() if k != 'hover') + (' (hover)' if (m.get('speed') or {}).get('hover') else ''),
         'ab': [m[k] for k in ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']],
         'saves': saves, 'skills': skills, 'vuln': m.get('damage_vulnerabilities', []), 'res': m.get('damage_resistances', []),
         'imm': m.get('damage_immunities', []), 'cimm': [c['index'] for c in m.get('condition_immunities', [])],
         'senses': senses, 'lang': m.get('languages', '') or '—', 'cr': m['challenge_rating'], 'xp': m.get('xp', 0),
         'pb': m.get('proficiency_bonus', 2),
         'traits': [act(a) for a in m.get('special_abilities', [])], 'actions': [act(a) for a in m.get('actions', [])]}
    if m.get('legendary_actions'): x['legendary'] = [act(a) for a in m['legendary_actions']]
    if m.get('reactions'): x['reactions'] = [act(a) for a in m['reactions']]
    mons.append(x)
out['monsters'] = sorted(mons, key=lambda v: v['name'])

# ---- races
traits = {t['index']: t for t in load('Traits')}
def trait(i): t = traits.get(i, {}); return {'name': t.get('name', i), 'desc': para(t.get('desc'))}
subs = {}
for s in load('Subraces'):
    subs.setdefault(s['race']['index'], []).append({'id': s['index'], 'name': s['name'], 'desc': clean(s.get('desc', '')),
        'bonus': {b['ability_score']['index']: b['bonus'] for b in s.get('ability_bonuses', [])},
        'traits': [trait(t['index']) for t in s.get('racial_traits', [])]})
races = []
for r in load('Races'):
    races.append({'id': r['index'], 'name': r['name'], 'speed': r['speed'], 'size': r['size'],
                  'bonus': {b['ability_score']['index']: b['bonus'] for b in r.get('ability_bonuses', [])},
                  'bonusChoice': (r.get('ability_bonus_options') or {}).get('choose', 0),
                  'languages': [l['name'] for l in r.get('languages', [])], 'langDesc': clean(r.get('language_desc', '')),
                  'age': clean(r.get('age', '')), 'alignment': clean(r.get('alignment', '')), 'sizeDesc': clean(r.get('size_description', '')),
                  'traits': [trait(t['index']) for t in r.get('traits', [])], 'subraces': subs.get(r['index'], [])})
out['races'] = races

# ---- classes
feats = load('Features')
featDesc = {f['index']: f for f in feats}
levels = load('Levels')
subclasses = {s['index']: s for s in load('Subclasses')}
def opt_label(o):
    t = o.get('option_type')
    if t == 'counted_reference': return (f"{o['count']} " if o.get('count', 1) > 1 else '') + o['of']['name'], [[o['of']['index'], o.get('count', 1)]]
    if t == 'reference': return o['item']['name'], [[o['item']['index'], 1]]
    if t == 'multiple':
        labs, items = [], []
        for x in o.get('items', []):
            l, i = opt_label(x); labs.append(l); items += i
        return ' and '.join(labs), items
    if t == 'choice':
        c = o['choice']; f = c.get('from', {})
        cat = (f.get('equipment_category') or {}).get('name', 'item')
        return f"any {cat.lower()}" if c.get('choose', 1) == 1 else f"{c['choose']} {cat.lower()}", [['@' + (f.get('equipment_category') or {}).get('index', ''), c.get('choose', 1)]]
    return '?', []
classes = []
for c in load('Classes'):
    ci = c['index']
    lv = {}
    for L in levels:
        if L.get('class', {}).get('index') != ci or L.get('subclass'): continue
        sc = L.get('spellcasting') or {}
        lv[L['level']] = {'prof': L['prof_bonus'], 'asi': L.get('ability_score_bonuses', 0),
                          'features': [f['name'] for f in L.get('features', [])],
                          'slots': [sc.get(f'spell_slots_level_{i}', 0) for i in range(1, 10)] if sc else [],
                          'cantrips': sc.get('cantrips_known', 0), 'known': sc.get('spells_known', 0),
                          'extra': L.get('class_specific') or {}}
    sublv = {}
    for L in levels:
        if L.get('class', {}).get('index') == ci and L.get('subclass'):
            sublv.setdefault(L['subclass']['index'], []).append({'level': L['level'], 'features': [f['name'] for f in L.get('features', [])]})
    fdesc = {}
    for f in feats:
        if f.get('class', {}).get('index') == ci: fdesc[f['name']] = para(f.get('desc'))
    choice = (c.get('proficiency_choices') or [{}])[0]
    skillFrom = []
    for o in ((choice.get('from') or {}).get('options') or []):
        it = o.get('item') or {}
        if it.get('index', '').startswith('skill-'): skillFrom.append(it['index'][6:])
    kit = {'fixed': [[e['equipment']['index'], e['quantity']] for e in c.get('starting_equipment', [])], 'choices': []}
    for opt in c.get('starting_equipment_options', []):
        os_ = []
        for o in ((opt.get('from') or {}).get('options') or []):
            l, it = opt_label(o); os_.append({'label': l, 'items': it})
        if not os_ and (opt.get('from') or {}).get('equipment_category'):
            cat = opt['from']['equipment_category']; os_.append({'label': 'any ' + cat['name'].lower(), 'items': [['@' + cat['index'], opt.get('choose', 1)]]})
        # The page's own words ("(a) chain mail or (b) leather armor, longbow, and 20 arrows") read better than
        # labels pieced together from the item list, so they are used whenever they line up one to one.
        words = re.split(r'\s*(?:,\s*)?(?:or\s+)?\([a-z]\)\s*', clean(opt.get('desc', '')))
        words = [w.strip(' ,') for w in words if w.strip(' ,')]
        if len(words) == len(os_):
            for o, w in zip(os_, words): o['label'] = w[0].upper() + w[1:]
        kit['choices'].append({'desc': clean(opt.get('desc', '')), 'options': os_})
    sc = c.get('spellcasting') or {}
    classes.append({'id': ci, 'name': c['name'], 'hitDie': c['hit_die'], 'saves': [s['index'] for s in c.get('saving_throws', [])],
                    'profs': [p['name'] for p in c.get('proficiencies', []) if not p['index'].startswith('saving-throw')],
                    'skillChoose': choice.get('choose', 0), 'skillFrom': skillFrom, 'kit': kit,
                    'casting': (sc.get('spellcasting_ability') or {}).get('index', ''), 'castFrom': sc.get('level', 0),
                    'levels': lv, 'features': fdesc,
                    'subclasses': [{'id': s['index'], 'name': subclasses.get(s['index'], {}).get('name', s['name']),
                                    'flavor': subclasses.get(s['index'], {}).get('subclass_flavor', ''),
                                    'desc': para(subclasses.get(s['index'], {}).get('desc')), 'levels': sublv.get(s['index'], [])}
                                   for s in c.get('subclasses', [])]})
    # subclass feature text
    for f in feats:
        if f.get('subclass') and f['class']['index'] == ci: classes[-1]['features'][f['name']] = para(f.get('desc'))
out['classes'] = classes

bgs = []
for b in load('Backgrounds'):
    bgs.append({'id': b['index'], 'name': b['name'], 'skills': [p['index'][6:] for p in b.get('starting_proficiencies', []) if p['index'].startswith('skill-')],
                'languages': (b.get('language_options') or {}).get('choose', 0), 'gold': (b.get('starting_gold') or {}).get('quantity', 0),
                'items': [[e['equipment']['index'], e['quantity']] for e in b.get('starting_equipment', [])],
                'feature': {'name': b['feature']['name'], 'desc': para(b['feature']['desc'])}})
out['backgrounds'] = bgs
out['feats'] = [{'id': f['index'], 'name': f['name'], 'desc': para(f.get('desc'))} for f in load('Feats')]

out['rules'] = [{'id': r['index'], 'name': r['name'], 'text': clean(r['desc'])} for r in load('Rule-Sections')]

# ---- tables that are plain game numbers
out['xpTable'] = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
out['encounter'] = {  # per character: easy, medium, hard, deadly
    'thresholds': [[25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
                   [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
                   [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
                   [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700]],
    'multipliers': [[1, 1], [2, 1.5], [3, 2], [7, 2.5], [11, 3], [15, 4]],
}

json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(OUT, os.path.getsize(OUT), {k: len(v) for k, v in out.items() if isinstance(v, list)})
