"""Growth in play on phones: a Hand earns Codon, rests, and Grows (one choice; two at a Stage).
    node server.js --new --vector ninth-shift --port 8794 --saves /tmp/oxd-g --host-key TEST01
    python3 tools/check_grow.py
"""
import json, time
from playwright.sync_api import sync_playwright
BASE='http://localhost:8794'; errs=[]
def host(ph, action):
    return ph.evaluate("""async (a) => (await (await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'host',key:'TEST01',action:a})})).json())""", action)
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    for w,h in [(360,740),(390,844)]:
        ph=b.new_context(viewport={'width':w,'height':h},device_scale_factor=2,is_mobile=True,has_touch=True).new_page()
        ph.on('pageerror',lambda e: errs.append(str(e)))
        pid=f'g{w}'
        ph.goto(f'{BASE}/play?pid={pid}'); ph.fill('[data-k="join.name"]','Roly'+str(w)); ph.click('button:has-text("Join")')
        ph.click('button:has-text("I have read this, and I am ready to play")')
        hand = 'The Wall' if w==360 else 'The Eyes'
        ph.click('.hand:not(.build) >> nth=%d' % (0 if w==360 else 3)); ph.fill('[data-k="claim.name"]','Gorm'+str(w)); ph.click('text=Play this organism')
        ph.wait_for_selector('text=Where you are')
        print(host(ph,{'type':'award','codon':240 if w==360 else 120,'substrate':100,'why':'test'+str(w)}))
        print(host(ph,{'type':'rest'}))
        ph.wait_for_selector('.grow-card',timeout=5000); ph.wait_for_timeout(300)
        ph.screenshot(path=f'/tmp/grow-{w}-a.png')
        if w==360:
            ph.click('[data-act="grow.pick"][data-kind="grown"][data-k="VSC"]'); ph.wait_for_timeout(100)
            ph.click('[data-act="grow.go"]'); ph.wait_for_timeout(500)
            ph.wait_for_selector('.grow-card:has-text("Level 6")'); ph.screenshot(path=f'/tmp/grow-{w}-a2.png')
            ph.click('[data-act="grow.tab"][data-v="bursts"]'); ph.wait_for_timeout(100)
            ph.click('[data-act="grow.pick"][data-kind="burst"] >> nth=0')
            ph.click('[data-act="grow.tab"][data-v="adapt"]'); ph.wait_for_timeout(100)
            ph.click('[data-act="grow.pick"][data-kind="adapt"][data-k="Denser Wall"]')
        else:
            ph.click('[data-act="grow.tab"][data-v="skills"]'); ph.wait_for_timeout(100)
            ph.click('[data-act="grow.pick"][data-kind="rank"] >> nth=0')
        ph.wait_for_timeout(150); ph.screenshot(path=f'/tmp/grow-{w}-b.png')
        ph.click('[data-act="grow.go"]'); ph.wait_for_timeout(500)
        print(w, 'card gone:', ph.locator('.grow-card').count()==0)
        ph.click('#nav .tab:has-text("Sheet")'); ph.wait_for_timeout(200); ph.screenshot(path=f'/tmp/grow-{w}-c.png')
        print(w, ph.locator('.card').first.inner_text()[:120].replace('\n',' | '))
        sh = ph.evaluate("()=>({page:document.documentElement.scrollHeight-innerHeight, wide:document.documentElement.scrollWidth-innerWidth})"); print(sh)
    print('errors',errs)
