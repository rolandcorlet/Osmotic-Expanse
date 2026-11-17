"""Walk the Build-your-own builder on phones (360x740, 390x844, 430x932).

    node server.js --new --port 8792 --saves /tmp/oxd-gen --host-key TEST01
    python3 tools/check_gen.py http://localhost:8792 /tmp/oxd-gen-shots
"""
import sys, time, os
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8792"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/oxd-gen-shots"
STAMP = str(int(time.time()))
os.makedirs(OUT, exist_ok=True)
errors = []

def measure(page, tag):
    d = page.evaluate("""() => ({ page: document.documentElement.scrollHeight - innerHeight, wide: document.documentElement.scrollWidth - innerWidth,
      foot: (() => { const f = document.querySelector('.gfoot'); if (!f) return null; const r = f.getBoundingClientRect(); return Math.round(r.bottom - innerHeight); })() })""")
    ok = d["page"] <= 0 and d["wide"] <= 0 and (d["foot"] is None or d["foot"] <= 0)
    print(("OK " if ok else "BAD"), tag, d)

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    for i, (w, h) in enumerate([(360, 740), (390, 844), (430, 932)]):
        ph = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
        ph.on("pageerror", lambda e: errors.append(str(e)))
        ph.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pid = f"g{i}"
        ph.goto(f"{BASE}/play?pid={pid}")
        ph.fill('[data-k="join.name"]', f"Tester{i}")
        ph.click('button:has-text("Join")')
        ph.click('button:has-text("I have read this, and I am ready to play")')
        ph.click('.hand.build')
        tag = f"{w}x{h}"
        seat = ["wall", "ledger", "eyes"][i]
        def step(name):
            ph.wait_for_timeout(150)
            measure(ph, f"{tag} {name}")
            if w == 390 or name in ("baselines", "kit"):
                ph.screenshot(path=f"{OUT}/{tag}-{name}-{STAMP}.png")
        step("seat")
        ph.click(f'[data-act="gen.seat"][data-id="{seat}"]'); ph.click('[data-act="gen.next"]')
        if i == 0:
            ph.click('[data-act="gen.set"][data-v="Barophil"]')
        else:
            ph.click('[data-act="gen.suggest"]')
        step("lineage"); ph.click('[data-act="gen.next"]')
        ph.click('[data-act="gen.suggest"]'); step("phenotype"); ph.click('[data-act="gen.next"]')
        if i == 0:
            for v, k in [(4, "VSC"), (4, "AFF"), (3, "RTC"), (3, "OSM"), (2, "DFF")]:
                ph.click(f'[data-act="gen.pick"][data-v="{v}"] >> nth=0'); ph.click(f'[data-act="gen.place"][data-k="{k}"]')
        else:
            ph.click('[data-act="gen.suggest"]')
        step("baselines"); ph.click('[data-act="gen.next"]')
        ph.click('[data-act="gen.suggest"]'); step("pathways"); ph.click('[data-act="gen.next"]')
        ph.click('[data-act="gen.starter"]'); step("kit"); ph.click('[data-act="gen.next"]')
        ph.click('[data-act="gen.random"]'); step("name")
        print(tag, "problems shown:", ph.locator('.gwarn').all_inner_texts())
        ph.click('[data-act="gen.go.build"]')
        ph.wait_for_selector("text=Where you are", timeout=5000)
        ph.screenshot(path=f"{OUT}/{tag}-played-{STAMP}.png")
        ph.click('#nav .tab:has-text("Sheet")')
        ph.wait_for_timeout(200)
        ph.screenshot(path=f"{OUT}/{tag}-sheet-{STAMP}.png")
        print(tag, "built:", ph.locator('.card h3').first.inner_text()[:80])
    print("errors:", errors or "none")
