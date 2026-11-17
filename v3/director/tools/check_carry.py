"""A campaign on a phone: play First Carve, move the table on to The Ninth Shift with organisms carried,
and catch up from Level 1 to Level 4 with three Growths.
    node server.js --new --port 8795 --saves /tmp/oxd-c --host-key TEST01
    python3 tools/check_carry.py
"""
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8795'; errs = []
def host(ph, action):
    return ph.evaluate("""async (a) => (await (await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'host',key:'TEST01',action:a})})).json())""", action)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    ph = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    ph.on('pageerror', lambda e: errs.append(str(e)))
    ph.goto(f'{BASE}/play?pid=c1'); ph.fill('[data-k="join.name"]', 'Roly'); ph.click('button:has-text("Join")')
    ph.click('button:has-text("I have read this, and I am ready to play")')
    ph.click('.hand:not(.build) >> nth=0'); ph.fill('[data-k="claim.name"]', 'Gorm the Unmoved'); ph.click('text=Play this organism')
    ph.wait_for_selector('text=Where you are')
    print(host(ph, {'type': 'award', 'codon': 40, 'substrate': 25, 'why': 'the carve'}))
    print(host(ph, {'type': 'session.new', 'vectorId': 'ninth-shift', 'keepPlayers': True}))
    ph.wait_for_selector('.grow-card', timeout=8000); ph.wait_for_timeout(300)
    ph.screenshot(path='/tmp/carry-a.png')
    for i in range(3):
        ph.wait_for_selector('.grow-card'); ph.wait_for_timeout(200)
        ph.click('[data-act="grow.pick"][data-kind="grown"] >> nth=%d' % i); ph.wait_for_timeout(100)
        ph.click('[data-act="grow.go"]'); ph.wait_for_timeout(500)
    print('growth card left:', ph.locator('.grow-card').count())
    ph.click('#nav .tab:has-text("Sheet")'); ph.wait_for_timeout(200); ph.screenshot(path='/tmp/carry-b.png')
    print(ph.locator('.card').first.inner_text()[:160].replace('\n', ' | '))
    print('errors', errs)
