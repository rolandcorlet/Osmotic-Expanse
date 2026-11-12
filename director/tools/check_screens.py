"""Drive the prototype like a real table: a host, two phones and the table screen.

Start the host first on a test port with a known key, for example:
    node server.js --new --port 8791 --saves /tmp/oxd-saves --host-key TEST01
then run:
    python3 tools/check_screens.py http://localhost:8791 TEST01 /tmp/oxd-shots

It plays through joining, a roll with real dice typed in, and a Pulse War
Strike, then measures every wide screen for page scroll and clipped cards.
Needs Python Playwright and Chrome.
"""
import sys
import time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8791"
KEY = sys.argv[2] if len(sys.argv) > 2 else "TEST01"
OUT = sys.argv[3] if len(sys.argv) > 3 else "/tmp/oxd-shots"
STAMP = str(int(time.time()))
errors = []


def watch(page, name):
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: errors.append(f"{name} console: {m.text}") if m.type == "error" else None)


def shot(page, name):
    path = f"{OUT}/{name}-{STAMP}.png"
    page.screenshot(path=path)
    print("shot", path)


def measure(page, name):
    data = page.evaluate(
        """() => {
          const out = { page: document.documentElement.scrollHeight - window.innerHeight,
                        wide: document.documentElement.scrollWidth - window.innerWidth, cards: [] };
          document.querySelectorAll('#main .card').forEach((c) => {
            if (c.parentElement.closest('.scroll')) return; // inside a panel that scrolls on purpose
            const over = c.scrollHeight - c.clientHeight;
            const r = c.getBoundingClientRect();
            const off = Math.round(r.bottom - window.innerHeight);
            if (over > 1 || off > 0) out.cards.push((c.querySelector('h3') || c).textContent.trim().slice(0, 30) + ' over=' + over + ' off=' + off);
          });
          return out;
        }"""
    )
    flag = "OK " if data["page"] <= 0 and data["wide"] <= 0 and not data["cards"] else "BAD"
    print(f"{flag} {name}: page scroll {data['page']}, sideways {data['wide']}, clipped cards {data['cards']}")
    return flag == "OK "


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    import os
    os.makedirs(OUT, exist_ok=True)

    host = browser.new_context(viewport={"width": 1536, "height": 864}).new_page()
    watch(host, "host")
    host.goto(f"{BASE}/host?key={KEY}")
    host.wait_for_selector("text=Call for a roll")

    phones = []
    for pid, name, hand, org in [("p1", "Roly", "The Wall", "Bresk of the Sixth Choir"), ("p2", "Sam", "The Eyes", "Brost of the Third Current")]:
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ph = ctx.new_page()
        watch(ph, pid)
        ph.goto(f"{BASE}/play?pid={pid}")
        ph.fill('[data-k="join.name"]', name)
        ph.click('button:has-text("Join")')
        # Session zero comes first: nobody takes an organism before they have read it and agreed.
        ph.wait_for_selector("text=Session zero")
        if pid == "p1":
            shot(ph, "phone-session-zero")
            ph.fill('[data-k="zero.line"]', "Harm to children")
            ph.click('button:has-text("Add")')
            ph.wait_for_selector('.chip:has-text("Harm to children")')
        ph.click('button:has-text("I have read this, and I am ready to play")')
        ph.wait_for_selector(f'.hand:has-text("{hand}")')
        ph.click(f'.hand:has-text("{hand}")')
        ph.fill('[data-k="claim.name"]', org)
        ph.click("text=Play this organism")
        ph.wait_for_selector("text=Where you are")
        phones.append(ph)
    p1, p2 = phones

    table = browser.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    watch(table, "table")
    table.goto(f"{BASE}/table")
    table.wait_for_selector("text=Distance from the Cohort")

    # --- the host's side of session zero
    host.fill('[data-k="zero.pw"]', "Slack Water")
    host.fill('[data-k="zero.tone"]', "Body horror is in; cruelty to animals is out.")
    host.click('[data-act="h.zero"]')
    host.wait_for_selector('.card:has-text("Session zero") .chip.ok:has-text("all ready")')
    print("session zero: both players ready, line shared:",
          host.locator('.card:has-text("Session zero") .chip:has-text("Harm to children")').count() == 1)
    shot(host, "host-session-zero")

    # --- a roll with the player's own dice
    host.wait_for_selector('.seg button:has-text("Bresk")')
    host.select_option('[data-k="h.b"]', "VSC")
    host.select_option('[data-k="h.p"]', "Pressure Tolerance")
    host.fill('[data-k="h.label"]', "Cross the wound lip")
    host.click('button:has-text("Ask Bresk to roll")')
    p1.wait_for_selector("text=Your roll")
    shot(p1, "phone-ask")
    p1.click("text=I rolled my own")
    for d in [2, 2, 2, 2, 2, 1]:
        p1.click(f'.keypad button:has-text("{d}")')
    shot(p1, "phone-own-dice")
    p1.click('button:has-text("Record these dice")')
    p1.wait_for_selector("text=Short by 2")
    print("own dice recorded: 2,2,2,2,2,1 = 10 against 12 ->", p1.inner_text(".verdict"))
    shot(p1, "phone-result")

    # --- a typed field keeps its text and focus while another screen changes the Ledger
    host.fill('[data-k="h.label"]', "typing while the table changes")
    host.focus('[data-k="h.label"]')
    p2.click('#nav .tab:has-text("Play")')
    p2.screenshot(path=f"{OUT}/phone-folded-{int(__import__('time').time())}.png")
    # The "Where you are" and "Roll something" panels are folded away until asked for.
    assert p2.locator('section.scene').count() == 0, "the scene card should start hidden on a phone"
    p2.click('[data-act="p.show"][data-what="scene"]')
    p2.wait_for_selector('section.scene')
    p2.click('[data-act="p.show"][data-what="scene"]')
    # Session zero stays reachable during play, so a line can be added mid-scene.
    p2.click('[data-act="p.show"][data-what="zero"]')
    p2.wait_for_selector('.card:has-text("Off the page for this table")')
    p2.fill('[data-k="zero.line"]', "Drowning")
    p2.click('.card:has-text("Off the page") button:has-text("Add")')
    p2.wait_for_selector('.chip:has-text("Drowning")')
    p2.click('[data-act="p.show"][data-what="zero"]')
    p2.click('[data-act="p.show"][data-what="quick"]')
    p2.select_option('[data-k="q.p"]', "Chemoreception")
    p2.click('button:has-text("Roll 7 dice")')
    host.wait_for_function("document.querySelectorAll('.rolls .r, .result').length > 0")
    time.sleep(0.4)
    kept = host.input_value('[data-k="h.label"]')
    focused = host.evaluate("document.activeElement && document.activeElement.getAttribute('data-k')")
    print("field kept:", kept == "typing while the table changes", "focus kept:", focused == "h.label")
    host.fill('[data-k="h.label"]', "")

    # --- a Pulse War
    host.click("text=Bring them into the scene")
    host.wait_for_selector("text=Gnaw Swarm A")
    host.click("text=Start a Pulse War with what is in the scene")
    host.wait_for_selector("text=Next turn")
    for _ in range(12):
        if p1.locator(".turn.mine").count():
            break
        host.click("text=Next turn")
        time.sleep(0.25)
    p1.wait_for_selector(".turn.mine")
    shot(p1, "phone-your-turn")
    p1.click('button:has-text("Strike")')
    p1.click('.chip:has-text("Gnaw Swarm A")')
    p1.click('.card.ask button.primary:has-text("Strike")')
    p1.wait_for_selector("text=Roll the dice")
    shot(p1, "phone-strike-ask")
    p1.click("text=Roll the dice")
    p1.wait_for_selector("text=Your last roll")
    time.sleep(1.0)
    print("strike:", p1.inner_text(".result .verdict"), "| PP left shown:", p1.inner_text(".card h3 .right b"))
    shot(p1, "phone-strike-result")
    shot(p2, "phone-waiting")
    p1.click('#nav .tab:has-text("Sheet")')
    shot(p1, "phone-sheet")
    p1.click('#nav .tab:has-text("Rolls")')
    shot(p1, "phone-rolls")
    p1.click('#nav .tab:has-text("Colours")')
    shot(p1, "phone-colours")
    p1.click('#nav .tab:has-text("Play")')

    # a creature strikes back, in the open
    for _ in range(12):
        if host.locator('.cre.now button:has-text("Strike"):not([disabled])').count():
            break
        host.click("text=Next turn")
        time.sleep(0.25)
    host.click('.cre.now button:has-text("Strike")')
    host.wait_for_selector(".cre.now >> text=Roll")
    shot(host, "host-incoming")
    shot(table, "table-waiting")
    host.click('.card:has-text("Waiting for dice") button:has-text("Roll")')
    time.sleep(1.0)

    ok = True
    for w, h in [(1366, 768), (1536, 864), (1920, 1080)]:
        for page, name in [(host, "host"), (table, "table")]:
            page.set_viewport_size({"width": w, "height": h})
            time.sleep(0.3)
            ok = measure(page, f"{name} {w}x{h}") and ok
            shot(page, f"{name}-{w}x{h}")
    host.set_viewport_size({"width": 1536, "height": 864})
    for tab in ["Sheets", "Bestiary", "Rolls", "Colours"]:
        host.click(f'#head .tab:has-text("{tab}")')
        time.sleep(0.3)
        ok = measure(host, f"host {tab}") and ok
        shot(host, f"host-tab-{tab.lower()}")
    table.set_viewport_size({"width": 1366, "height": 768})
    table.click('#head .tab:has-text("Rolls")')
    ok = measure(table, "table Rolls") and ok

    # the secrets firewall, checked on the wire
    leak = p1.evaluate("fetch('/api/scenario?role=player').then(r => r.text())")
    print("player scenario has Director notes:", ("BSP" in leak) or ("Weakness" in leak))

    print("page errors:", errors if errors else "none")
    print("ALL OK" if ok and not errors else "PROBLEMS FOUND")
    browser.close()
