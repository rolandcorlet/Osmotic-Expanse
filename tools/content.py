INTRO = "*The Expanse does not count hours; it counts the Rhythm of bodies — the Pulse, the Beat, the Tide.*"
INTRO2 = ("Every unit of time in the Expanse is named for something a body does: it pulses, it beats, it drifts into fugue, "
          "it goes dormant. The rules call this **Metabolic Time**; organisms simply call it **the Rhythm** "
          "(*“by the Rhythm, it is the third Beat of the Rise”*).")
HEAD = ["Unit", "Length", "Made of", "Felt as", "What it governs"]
ROWS = [
 ["Turn", "your share of a Cycle", "—", "your moment to act", "You receive Pulse Points (2 + DFF) and spend them; Split Frequency holds some to act later in the same Cycle (§4.2)"],
 ["Pulse Cycle", "6 seconds", "one turn for every organism, in Frequency order", "a combat round", "Combat; durations of “N Cycles”; one Reactive Osmosis per Cycle; −1 Stress after a quiet Cycle (§4.2, §5.8)"],
 ["Pulse War", "usually 3–6 Cycles (~18–36 s)", "a Detection Phase, then Cycles", "a fight", "“Once per Pulse War” abilities; a fight is one scene (§4.1, §4.14)"],
 ["Scene", "up to ~1 Fugue Interval", "as many Cycles or exchanges as it needs", "one situation, one purpose, one place", "“Once per scene” abilities (see What a scene is, below)"],
 ["Fugue Interval", "~1 hour", "600 Cycles", "an hour", "A Reconstitution; one travel segment; foraging; a Chemotactic Rite; hazards that tick every hour (§5.10, §8.2)"],
 ["Dormant Cycle", "6 hours", "6 Fugue Intervals", "a night's sleep", "Long rest: full MI, Lysis Countdown cleared, once-per-encounter features refreshed (§5.10)"],
 ["Metabolic Beat", "~1 day", "24 Fugue Intervals: 20 lit, 4 dim", "a day", "Downtime, rituals, Re-Synthesis (1d6 Beats); meals are chemical, not culinary"],
 ["Drift Season", "~30 Beats", "30 Beats", "a season", "Current routing changes; trade contracts rewrite; one phase of the Tide (Codex §5.3)"],
 ["Osmotic Tide", "~4 Drift Seasons (~120 Beats)", "Isotonic Rise → Hypertonic Zenith → Isotonic Fall → Hypotonic Zenith", "a year", "The world's grand tonicity swing: every region's numbers move; “once per Tide” abilities (Codex Ch. V)"],
 ["Great Cycle", "16 Tides (~1,900 Beats)", "64 Drift Seasons", "a generation", "Registers are purged; old debts are re-read (Codex §5.1)"],
]
CONV = ("**Conversions.** 10 Cycles = 1 minute · 600 Cycles = 1 Fugue Interval · 6 Fugue Intervals = 1 Dormant Cycle · "
        "24 Fugue Intervals = 1 Beat · 30 Beats = 1 Drift Season · 4 Drift Seasons (120 Beats) = 1 Osmotic Tide · 16 Tides = 1 Great Cycle.")
TIDES = ("**Two “Tides”.** “Once per Tide” always means the Osmotic Tide (a year). The Codex's mass-battle rules "
         "(Codex §3.6) also count a *battle* Tide of one Fugue Interval; that use stays inside mass conflict.")
GLOSS = "**Metabolic Time** — the Expanse's way of counting time, by what bodies do: Turn, Pulse Cycle, Fugue Interval, Beat, Drift Season, Osmotic Tide, Great Cycle (§8.1). Organisms call it *the Rhythm*. · "
def md_table():
    out = "| " + " | ".join(HEAD) + " |\n| " + " | ".join([":--"] * 5) + " |\n"
    for r in ROWS: out += "| **" + r[0] + "** | " + " | ".join(r[1:]) + " |\n"
    return out
def md_section():
    return "## 8.1 Metabolic Time\n\n" + INTRO + "\n\n" + INTRO2 + "\n\n" + md_table() + "\n" + CONV + "\n\n" + TIDES + "\n\n"
