import re, json, time, urllib.request, os
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8790'
K = re.search(r'key=([A-F0-9]+)', open('/tmp/srv3.log').read()).group(1)
def host(a):
    r = urllib.request.urlopen(urllib.request.Request(BASE + '/api/action', json.dumps({'role': 'host', 'key': K, 'action': a}).encode(), {'content-type': 'application/json'})).read()
    d = json.loads(r); 
    if not d.get('ok'): print('HOST REFUSED', a.get('type'), d)
    return d
def state():
    return json.loads(urllib.request.urlopen(f'{BASE}/api/poll?role=host&key={K}').read())
host({'type': 'session.new', 'vectorId': 'first-carve'})
OUT = '/home/claude/vid/ui'
n = [0]
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 430, 'height': 900}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    def shot(name, wait=700):
        pg.wait_for_timeout(wait); n[0] += 1; pg.screenshot(path=f'{OUT}/{n[0]:02d}-{name}.png')
    pg.goto(BASE + '/play?pid=pRoly'); pg.wait_for_timeout(1200)
    shot('join-empty')
    pg.fill('input[data-k="join.name"]', 'Roly'); shot('join-name', 300)
    pg.click('[data-act="join"]'); shot('zero')
    pg.click('[data-act="zero.agree"]'); shot('choose')
    pg.click('[data-act="claim.pick"][data-id="wall"]'); pg.wait_for_timeout(300)
    pg.fill('input[data-k="claim.name"]', 'Bresk of the Sixth Choir'); shot('choose-picked', 300)
    pg.click('[data-act="claim.go"]'); pg.wait_for_timeout(600)
    host({'type': 'narrate', 'text': 'You are third in a queue of skiffs at a wound the size of a town square. The current pulls through it like breath. A small folded official, a gate drone, has turned from its ledger and is looking straight at your skiff. How does the Cohort step up to the gate?'})
    shot('play-story', 1200)
    pg.fill('input[data-k="say"]', 'I go up to the drones at the gate and ask what it costs to get in.'); shot('play-typing', 300)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    host({'type': 'narrate', 'text': 'The drone tilts its fold toward Bresk. "Claim, licence or toll," it says. Bresk, will you look for a way past without paying? Push through the crowd at the lip.'})
    host({'type': 'request.check', 'organismId': 'wall', 'baseline': 'VSC', 'pathway': 'Membrane Penetration', 'at': 12, 'label': 'Shoulder through the crowd at the lip'})
    shot('ask', 1200)
    pg.click('[data-act="roll"]'); shot('result', 1600)
    pg.click('[data-act="own.start"]') if pg.query_selector('[data-act="own.start"]') else None
    host({'type': 'request.check', 'organismId': 'wall', 'baseline': 'OSM', 'pathway': 'Chemoreception', 'at': 12, 'label': 'Taste the water from the wound'})
    pg.wait_for_timeout(900); pg.click('[data-act="own.start"]'); pg.wait_for_timeout(300)
    for v in (5, 3, 6): pg.click(f'[data-act="own.add"][data-d="{v}"]'); pg.wait_for_timeout(150)
    shot('own-dice', 300)
    for v in (1,): pg.click(f'[data-act="own.add"][data-d="{v}"]')
    pg.wait_for_timeout(200)
    if pg.query_selector('[data-act="own.submit"]:not([disabled])'): pg.click('[data-act="own.submit"]')
    else:
        while pg.query_selector('[data-act="own.add"]:not([disabled])'): pg.click('[data-act="own.add"][data-d="4"]'); pg.wait_for_timeout(100)
        pg.click('[data-act="own.submit"]')
    pg.wait_for_timeout(800)
    for what in ('scene',):
        pg.click(f'[data-act="p.show"][data-what="{what}"]'); shot('where', 600); pg.click(f'[data-act="p.show"][data-what="{what}"]')
    pg.locator('[data-act="tab"][data-t="sheet"] >> visible=true').first.click(); shot('sheet', 800)
    pg.locator('[data-act="tab"][data-t="know"] >> visible=true').first.click(); shot('story-tab', 600)
    pg.locator('[data-act="tab"][data-t="words"] >> visible=true').first.click(); shot('words', 600)
    pg.locator('[data-act="tab"][data-t="rolls"] >> visible=true').first.click(); shot('rolls', 600)
    pg.locator('[data-act="tab"][data-t="colours"] >> visible=true').first.click(); shot('colours', 600)
    pg.locator('[data-act="tab"][data-t="play"] >> visible=true').first.click(); pg.wait_for_timeout(400)
    # a fight
    host({'type': 'fight.start', 'creatures': [{'blockId': 'gnaw-swarm', 'count': 2, 'band': 'near'}], 'ownDice': {}})
    s = state(); s = s.get('state', s)
    for _ in range(12):
        s = state(); s = s.get('state', s)
        if s['fight']['turn'] == 'org:wall': break
        t = s['fight']['turn']
        if t and t.startswith('cre:'):
            host({'type': 'turn.next'})
        else: host({'type': 'turn.next'})
    pg.wait_for_timeout(1000); pg.locator('section.card:has-text("Pulse War")').first.scroll_into_view_if_needed(); shot('fight', 600)
    pg.click('[data-act="strike.open"]'); pg.wait_for_timeout(400)
    tg = pg.query_selector('[data-act="strike.pick"]'); tg and tg.click(); pg.wait_for_timeout(300)
    pg.locator('[data-act="strike.go"]').scroll_into_view_if_needed(); shot('strike', 400)
    pg.click('[data-act="strike.go"]'); pg.wait_for_timeout(900); pg.evaluate('document.querySelectorAll("[data-scroll]").forEach(e=>e.scrollTop=0);window.scrollTo(0,0)'); shot('strike-ask', 400)
    pg.click('[data-act="roll"]'); shot('strike-roll', 1700)
    if pg.query_selector('[data-act="act"][data-a="reserve"]:not([disabled])'): pg.click('[data-act="act"][data-a="reserve"]'); pg.wait_for_timeout(300)
    if pg.query_selector('[data-act="turn.end"]:not([disabled])'): pg.click('[data-act="turn.end"]'); pg.wait_for_timeout(500)
    s = state(); s = s.get('state', s)
    cres = [c for c in s['creatures'].values() if not c.get('down')]
    if cres:
        host({'type': 'creature.strike', 'cid': cres[0]['cid'], 'targetId': 'wall'}); shot('incoming', 1200)
    b.close()
print(os.listdir(OUT))
