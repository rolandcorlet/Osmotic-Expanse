"""The Lexicon: one definition per term, shared by every document and both apps.
Fields: name, cat, def, aka (other forms, matched with exact case), rx (optional regex forms),
see (other term names), src (where in the books), level ("player" | "director"), scope (doc id, or None = everywhere).
Run:  python3 lexicon_src.py  ->  lexicon.json  (hand-written entries + the Core Rulebook's Appendix B glossary)"""
import json, re, sys

CATS = {
 "person":  {"label": "People",            "color": "#f2b36b"},
 "place":   {"label": "Places",            "color": "#6fc3df"},
 "time":    {"label": "Time",              "color": "#b49cf2"},
 "lineage": {"label": "Lineages & bodies", "color": "#7ee0a1"},
 "faction": {"label": "Factions & offices","color": "#f08a8a"},
 "society": {"label": "Society & custom",  "color": "#e5d36a"},
 "rule":    {"label": "Rules & mechanics", "color": "#5ee6d0"},
}
T = []
def t(name, cat, d, aka=(), see=(), src="", level="player", scope=None, rx=()):
    T.append({"name": name, "cat": cat, "def": d, "aka": list(aka), "rx": list(rx), "see": list(see), "src": src, "level": level, "scope": scope})

# ---------------- TIME ----------------
t("Metabolic Time", "time", "How the Expanse counts time — by what bodies do: a Pulse Cycle, a Fugue Interval, a Beat, a Drift Season, a Tide. Organisms call it the Rhythm.", ["the Rhythm"], ["Beat", "Osmotic Tide"], "CORE §8.1")
t("Pulse Cycle", "time", "About six seconds — one round of a fight, in which every organism takes its turn.", ["Pulse Cycles", "Cycle", "Cycles"], ["Metabolic Time"], "CORE §4.2, §8.1")
t("Fugue Interval", "time", "About an hour. A short rest, one leg of travel, or most of a scene takes one Fugue Interval.", ["Fugue Intervals", "Interval", "Intervals"], ["Beat"], "CORE §8.1")
t("Beat", "time", "A day: 24 Fugue Intervals, 20 of them lit and 4 of them dim. Wages, rent and rations are counted by the Beat.", ["Beats", "Metabolic Beat", "Metabolic Beats"], ["dim", "Fugue Interval"], "CORE §8.1")
t("dim", "time", "The four dark hours at the end of every Beat: curfew, sleep, and the time when smugglers, lovers and the night pumps move.", ["the dim", "this dim", "that dim", "a dim"], ["Beat"], "CORE §8.1; QUORUM §16.1")
t("Pulse Ten", "time", "Ten Beats — the colonies' week. Three Pulse Tens make a Drift Season.", ["Pulse Tens"], ["Drift Season"], "QUORUM §12.1 (an app and colony convention)")
t("Drift Season", "time", "About 30 Beats — a season. Currents reroute and contracts rewrite. Each phase of the Tide lasts one Drift Season.", ["Drift Seasons"], ["Osmotic Tide"], "CORE §8.1")
t("Osmotic Tide", "time", "The year: four Drift Seasons in which the whole world's saltiness swings — Isotonic Rise, Hypertonic Zenith, Isotonic Fall, Hypotonic Zenith — and every region changes with it.", ["Tide", "Tides", "Osmotic Tides"], ["Isotonic Rise", "Hypertonic Zenith", "Isotonic Fall", "Hypotonic Zenith"], "CORE §8.1; CODEX §5.3")
t("Great Cycle", "time", "Sixteen Tides — a generation. At its end comes the Rereading, when registers are purged and old debts re-read.", ["Great Cycles"], ["Rereading"], "CODEX §5.1")
t("Isotonic Rise", "time", "The spring of the Tide: the water is gentle, travel is cheap, and everyone signs contracts. Its festival is the Contract Fair.", ["Rise"], ["Contract Fair"], "CODEX §5.3")
t("Hypertonic Zenith", "time", "The salt season: the whole world turns salty and water leaves every body that cannot hold it. The dense rich thrive; the watery poor shrink. Its festival is the Salt Vigil.", ["Zenith", "Hypertonic"], ["Salt Vigil", "Dry", "Swollen"], "CODEX §5.3; QUORUM §5.3")
t("Isotonic Fall", "time", "The autumn of the Tide: recovery, harvest and mourning. Its festival is the Rendering.", ["Fall"], ["Rendering"], "CODEX §5.3")
t("Hypotonic Zenith", "time", "The wet season: water floods into every body. The poor grow strong, the rich bloat, raids and swarms spread. Its festival is the Swell.", ["Hypotonic"], ["Swell"], "CODEX §5.3; QUORUM §5.3")

# ---------------- FESTIVALS & CUSTOM ----------------
t("Contract Fair", "society", "The Isotonic Rise festival (3 Beats): debts signed, Oaths sworn, couples conjugate, offices are chosen for the Tide. An Oath sworn here costs nothing to swear.", ["Fair"], ["Oath", "Conjugation"], "QUORUM §12.1")
t("Salt Vigil", "society", "The Hypertonic Zenith festival: fasting and rationing, water rights read aloud, the Deep Choir's long note, arrears audited and duels fought in the open.", ["Vigil"], ["Oath-duel", "Long note"], "QUORUM §12.1")
t("Rendering", "society", "The Isotonic Fall festival (2 Beats): the year's dead are read by the Ash and rendered, so nothing of them is wasted, and their last memories are honoured.", [], ["Reclaimers' Ash", "Reader"], "QUORUM §12.1")
t("Swell", "society", "The Hypotonic Zenith carnival (a Pulse Ten): masks are lawful, the poor rule the streets, current-races run, and every Issue the Pump backs starts stronger.", ["the Swell"], ["Hypotonic Zenith", "Pump"], "QUORUM §12.1")
t("Rereading", "society", "Once every Great Cycle, every register is purged and every old debt re-read. The Unlisted may ask to be listed again.", [], ["Great Cycle", "Unlisted"], "CODEX §5.1; QUORUM §12.1")
t("Hearth", "society", "The shared warm heart of a household, hab or colony: where meals are eaten together, Rites are breathed and news is shared. Lower-case, a hearth is a registered household.", ["Hearths", "hearth", "hearths"], ["Rite", "Chemotactic Rite"], "QUORUM §2.1")
t("Rite", "society", "A ritual with chemical weight — a shared meal, a naming, a registration, a mourning. Rites change Cohesion, moods and standing.", ["Rites"], ["Chemotactic Rite"], "CORE §11.6")
t("Chemotactic Rite", "society", "A shared meal of rendered Substrate at a Hearth (1 Fugue Interval): it clears everyone's Stress, builds Cohesion and warms moods.", ["shared meal"], ["Hearth", "Stress"], "CORE §11.6")
t("Oath-duel", "society", "A formal duel fought in the open to settle a sworn Motion. Killing either duellist is a crime, interrupting is a scandal, watching is a legal act.", ["duel", "duels", "Oath-duels"], ["Yield", "Salt Vigil"], "CODEX §5.5; QUORUM §12.4")
t("Long note", "society", "The Deep Choir's pressure-song: one note sustained by Barophil throats for a whole Beat, sung at the Salt Vigil.", ["long note"], ["Deep Choir", "Barophil"], "QUORUM §14.1")
t("Current-race", "society", "The Swell's great sport: riding a channel current through a marked course of three checkpoints, with big bets.", ["current-race", "current-races"], ["Swell"], "QUORUM §14.5")
t("Masks", "society", "Scent-masks hide what an organism is. Normally a crime against the Sacred Code's fourth Precept; lawful during the Swell.", ["masks", "masked"], ["Swell", "Sacred Code"], "QUORUM §12.1")

# ---------------- RULES & MECHANICS ----------------
t("Stress", "rule", "Metabolic Stress: the fraying of a body's chemistry, marked on a track of 8. Too much slows you down; at 8 the body starts eating itself. Rest, a Vent or a shared meal clears it.", ["Metabolic Stress"], ["Vent", "Chemotactic Rite"], "CORE §5.8")
t("Vent", "rule", "A hard exhalation of spent chemistry that clears some Stress at the cost of energy (ATP).", ["Vented", "Venting", "Vents"], ["Stress", "ATP"], "CORE §5.8")
t("ATP", "rule", "An organism's energy — what it burns to move, fight and work. Also a living currency: Host-Cities take their rent in it.", [], ["Vent", "Host-City"], "CORE §2.1")
t("Substrate", "rule", "Matter, and the Expanse's money, counted in S. A colonist's whole Beat of work is worth about 5 S.", ["S"], [], "CORE §2.2; QUORUM §9.5", rx=[r"(?<=\d )S\b"])
t("Cohesion", "rule", "How well a group's chemistry agrees, 0–10. A Cohort builds it by shared meals and kept promises; a colony has its own Colony Cohesion.", ["Colony Cohesion"], ["Hearth"], "CORE §2.5; QUORUM §2.4")
t("Oath", "rule", "A promise folded into your own chromatin, so breaking it damages your body. The Expanse's whole social contract.", ["Oaths"], ["Oath box", "Ledger"], "CORE §11.4")
t("Oath box", "rule", "Each organism can hold a few Oaths at once (one box each). An unspent box is a promise still waiting to be kept — and the Ash will not render a body with one.", ["Oath boxes"], ["Oath", "Reclaimers' Ash"], "CORE §11.4; CODEX §7.4")
t("Ledger", "rule", "One page of who owes whom: owed to you, you owe, and who witnessed it. Every line is one sentence.", ["Ledgers"], ["Oath", "Digestion Pact"], "QUORUM Ch. 6")
t("Quorum", "society", "How a colony decides: everyone who cares breathes signal into the Hearth air, and when the air is thick enough with one answer the whole colony knows it at once.", ["Quorums"], ["Quorum Speaker", "Signal", "Quench"], "QUORUM Ch. 4")
t("Signal", "rule", "The molecule organisms breathe into the air to argue a Quorum. The rich can pay for more of it — 'breathing heavily'.", ["signal", "breathing heavily", "Breathe heavily"], ["Quorum"], "QUORUM §4.2")
t("Quench", "rule", "A political crime: an enzyme breathed into the air that destroys the other side's signal, so the Quorum is stolen. It leaves a residue that can be hunted afterwards.", ["quench", "quenching", "quenched", "Quorum-quenching"], ["Quorum"], "QUORUM §4.5")
t("Issue", "rule", "A question before a colony's Quorum, argued on a track until the air reaches Quorum one way or the other.", ["Issues"], ["Quorum"], "QUORUM §4.1")
t("Convocation", "rule", "An argument in a room with three to six parties and one Motion on the table — a market, council, trial or treaty.", ["Convocations"], ["Reveal", "Walk"], "QUORUM §4.9")
t("Reveal", "rule", "A Convocation move: produce evidence — a witnessed line, a register entry, a memory — and win a step without arguing.", [], ["Convocation"], "QUORUM §4.10")
t("Walk", "rule", "A Convocation move: withdraw from the room in front of everyone, so all must answer why you left.", ["Walks"], ["Convocation"], "QUORUM §4.10")
t("Yield", "rule", "A chemical white flag an organism cannot fake. Whoever kills a yielding organism marks Stress on every witness — so fights and duels can end.", ["yield", "yielded", "yielding"], ["Oath-duel"], "CORE §4.14")
t("Assay", "rule", "A chemical trial: the Lysosome reads the accused's body for the truth, and the colony decides what the reading means.", ["assay", "assayed", "Assayed"], ["Lysosome", "Unlisted"], "QUORUM §10.2")
t("Unlisted", "society", "An organism struck from (or never written into) the registers: no rights, no water ration, no lawful contracts, and invisible to every tax — which is why rebels and smugglers move through them.", ["Unlisting", "unlisted"], ["Register", "Rereading"], "CODEX §7.2; QUORUM §5.5")
t("Register", "society", "A colony's living record of who is 'self' — who belongs, with what lineage and Oaths. To be listed is to have rights.", ["register", "registers", "registered", "listed"], ["Registrar", "Unlisted"], "CODEX §7.2")
t("Dormant Cycle", "rule", "Six hours of true sleep in a safe nest or cyst: the long rest that restores a body.", ["Dormant Cycles"], ["incubation"], "CORE §5.10")
t("Dormant", "rule", "Unconscious: an organism with no Membrane Integrity left. A Dormant body is alive but cannot act.", ["Dormancy"], [], "CORE §5.4")
t("Frailty", "lineage", "The weakness every lineage is born with, as much a social fact as a physical one.", ["Frailties"], ["Literal", "Obligate Drifter"], "ATLAS §2")
t("Literal", "lineage", "The Immunan Frailty: they cannot be deceived by words and cannot deceive. Asked a direct question, they must answer truthfully unless an Oath forbids it — and even refusing hurts.", [], ["Immunan"], "ATLAS §2")
t("Obligate Drifter", "lineage", "The Flagellan Frailty: a Flagellan that stops moving loses its strength. They cannot hold a still post, and long stillness brings 'the ache'.", ["the ache"], ["Flagellan"], "ATLAS §2")
t("Slow Reaction", "lineage", "The Barophil Frailty: always a beat behind a fast room or a fast fight.", [], ["Barophil"], "ATLAS §2")
t("Registered", "lineage", "The Lysosan Frailty: every ward and gate can see they are 'not quite standard', so Wardens distrust them.", [], ["Lysosan"], "ATLAS §2")

# ---------------- SOCIETY & BODIES ----------------
t("Budline", "society", "A family: everyone descended from one founding division. Budlines share a scent-root, a root name, debts and Oaths.", ["budline", "budlines", "Budlines"], ["Bud", "Root-elder", "Root name"], "QUORUM §7.1")
t("Bud", "society", "A new organism, made when a body divides. Buds are dependents until they come of age.", ["bud", "buds", "budded", "budding"], ["Division", "Budline"], "QUORUM §7.5")
t("Division", "society", "How organisms reproduce: one body becomes two, and both remember being one — every memory up to that moment.", ["divide", "divided", "divides", "divisions"], ["Bud"], "QUORUM §7.5")
t("Root-elder", "society", "The oldest living member of a budline, who can call any member home once a Tide.", ["root-elder"], ["Budline"], "QUORUM §7.1")
t("Root name", "society", "The ritual family part of a name — 'of the Seven Ladders' — given at the budline's Hearth.", ["root name"], ["Budline"], "QUORUM §7.2")
t("Ward", "society", "A dependent taken in by Rite (Wardship) and raised as one's own. At gates, 'wards' are also the living sensors that read who is self.", ["ward", "wards", "Wardship"], ["Register"], "QUORUM §7.6")
t("Plasmid", "society", "A small, giftable sequence — a knack or habit (like a lullaby that calms the frightened), passed body to body at a Hearth. Giving one is the deepest courtesy.", ["plasmid", "plasmids", "Plasmids"], ["Hearth"], "QUORUM §7.4")
t("Conjugation", "society", "Two organisms linking membranes and exchanging sequence: marriage, contract and shared inheritance at once, sworn at a Hearth before both budlines.", ["conjugate", "conjugated", "conjugating", "conjugation"], ["Budline", "Contract Fair"], "QUORUM §7.3")
t("Incubation", "society", "Keeping watch while another organism takes its Dormant Cycle in the open — an intimate favour, because a sleeping body cannot mask what it is.", ["incubation"], ["Dormant Cycle"], "QUORUM §7.6")
t("Cleaner Pact", "society", "A paid arrangement with a grooming guild that keeps parasites out of your membranes.", [], [], "QUORUM §7.6")
t("Brooding", "society", "Carrying a child, sequence or seed inside your own body across water it could not cross alone.", ["brooded", "brooder", "brooder's"], ["Bud"], "QUORUM §7.6")
t("Digestion Pact", "society", "Selling your own future body to the Ash while you live: half its harvest value now, and they read and render you when you die.", ["Digestion Pacts"], ["Reclaimers' Ash", "Rendering"], "QUORUM §7.6")
t("Memory strand", "society", "A sealed crystal of an organism's recorded memories, kept as an heirloom or a last message. Some open only once.", ["memory strand", "strand", "strands"], ["Reader"], "CORE §11.7; QUORUM §14.3")
t("Trail-script", "society", "Writing: scent laid down in sequence along a surface, read by following it.", ["trail-script"], [], "QUORUM §11.5")
t("Condition", "society", "Class, measured as concentration: the Dry (dense and rich), the Settled (the middle) and the Swollen (watery and poor).", [], ["Dry", "Settled", "Swollen"], "QUORUM Ch. 5")
t("Dry", "society", "The rich: dense, salted organisms living in sealed pockets kept steady by pumps others work.", ["the Dry"], ["Condition", "Hypertonic Zenith"], "QUORUM §5.1")
t("Settled", "society", "The middle condition: a trade, a Hearth, a little saved.", ["the Settled"], ["Condition"], "QUORUM §5.1")
t("Swollen", "society", "The poor: dilute, water-heavy organisms in the low, wet districts — strong in the wet season, shrinking in the salt.", ["the Swollen"], ["Condition", "Pump"], "QUORUM §5.1")
t("Hauler", "society", "A worker of the Pump who carries water and goods uphill. A hauler earns about 4 S a Beat.", ["hauler", "haulers", "Haulers"], ["Pump"], "QUORUM §9.3")
t("Nursery", "society", "Where a colony's young buds are cared for. In many colonies every hab must feed one nursery shift.", ["nursery"], ["Bud"], "QUORUM §2.8")
t("Hab", "place", "A dwelling cluster in a colony — a 'hab-hill' in the Mid-Strata can be the size of a hill.", ["hab", "habs", "hab-hill", "hab-hills"], [], "CODEX §6.3")
t("Sacred Code", "society", "Seven Precepts enforced as law across the Expanse — for example, nothing crosses a colony's membrane unread; the dead must be harvested; you may not lie about what you are.", ["Precept", "Precepts", "the Code"], [], "CODEX §8.2")
t("Charter", "society", "A colony's founding promises — or a licence that lets a band of adventurers work outside the membrane.", ["charter"], [], "QUORUM §2.6, Ch. 15")
t("Channel", "society", "An illegal pore in a colony's membrane that lets goods (or water) leak through unread. Smugglers are 'channel-makers'.", ["channel-maker"], ["Sacred Code"], "QUORUM §9.4")
t("Host-City", "place", "A Vast living organism that carries thousands of tenants in its body and migrates with the Tide. Rent is paid in ATP; its immune cells are the police.", ["Host-Cities"], ["Old Mother Brine", "Rent Well"], "QUORUM Ch. 13")
t("Rent Well", "place", "Where a Host-City's tenants feed it their rent, one ATP a Beat.", ["Rent Wells"], ["Host-City"], "QUORUM §13.2")

# ---------------- ORGANS & OFFICES ----------------
t("Organ", "society", "A colony is a body with six organs — the Membrane, Pump, Vacuole, Nucleolus, Hearth and Lysosome. Every organism belongs to one.", ["organ", "organs"], ["Pump", "Lysosome"], "QUORUM Ch. 2")
t("Membrane", "society", "The colony's border organ: gates, registers, and who is let in.", [], ["Porter", "Registrar"], "QUORUM §2.1")
t("Pump", "society", "The colony's labour organ: the haulers who carry goods and water uphill.", ["the Pump"], ["Hauler"], "QUORUM §2.1, §9.3")
t("Vacuole", "society", "The colony's stores: water rights, rations and the treasury.", [], ["Tally-Keeper", "Steward"], "QUORUM §2.1")
t("Nucleolus", "society", "The colony's council organ, which reads the Quorum and keeps the colony's sequence.", [], ["Assembly", "Quorum Speaker"], "QUORUM §2.1")
t("Lysosome", "society", "The colony's organ of waste, the dead and justice — where bodies are read, rendered and assayed.", [], ["Reader", "Assay"], "QUORUM §2.1")
t("Assembly", "faction", "The colony's seven office-holders deciding ordinary business: fifteen voices, eight to pass.", [], ["Nucleolus"], "QUORUM §3.3")
t("Porter", "faction", "The office that commands a colony's gates and decides who is read. Also a Warden rank.", [], ["Membrane"], "CODEX §7.2; QUORUM §3.1")
t("Registrar", "faction", "The office that keeps the register — entering and erasing who is listed — and witnesses every Oath.", [], ["Register"], "QUORUM §3.1")
t("Tally-Keeper", "faction", "The office that sets and audits the water tally. If the tally fails, the colony can default.", [], ["Tally"], "CODEX §12.2; QUORUM §3.1")
t("Tally", "society", "The colony's tax and water account, assessed by hearth.", ["tally", "water tally"], ["Tally-Keeper"], "CODEX §6.3; QUORUM §2.6")
t("Steward", "faction", "The office that feeds the colony from its store and can pay a poor household's arrears.", [], ["Vacuole"], "QUORUM §3.1")
t("Muster", "faction", "The office that calls the colony's militia.", [], [], "QUORUM §3.1")
t("Printwright", "faction", "The office holding a colony's leased Hegemony print shop.", [], ["Ribosome Hegemony"], "QUORUM §3.1")
t("Reader", "faction", "An Ash reader of the dead: they open their own body around a dead one and read its last memories.", ["Readers", "Ash Reader", "Ash Readers", "Reading"], ["Reclaimers' Ash", "Rendering"], "CODEX §7.4")
t("Quorum Speaker", "faction", "The organism trusted to taste the Hearth air and announce what the colony has decided. Not every Speaker is perfectly honest.", ["Speaker"], ["Quorum"], "QUORUM §4.4")

# ---------------- FACTIONS ----------------
t("Ribosome Hegemony", "faction", "The industrial power: foundries, licences and loans. It never breaks a contract in writing — it reinterprets one.", ["Hegemony"], ["Brine Office"], "CODEX §7.1")
t("Brine Office", "faction", "The Hegemony's waste-logistics desk — quietly its most powerful, because it decides who gets feedstock. It also lends money.", [], ["Ribosome Hegemony"], "CODEX §7.1")
t("Warden Circles", "faction", "The gate-keepers and register-keepers: 'nothing enters a colony that has not been read'. To be unlisted is to be outside their law.", ["Wardens", "Warden"], ["Register"], "CODEX §7.2")
t("Flow Guilds", "faction", "The Flagellan currents-people: couriers, tolls and open water. They run the Currentpost.", ["Flow Guild", "Guild", "Guilds"], ["Currentpost"], "CODEX §7.3")
t("Reclaimers' Ash", "faction", "The faith and trade of the dead: they harvest and read bodies, believing an unharvested body is a soul wasted. They will not render a body with an unkept Oath.", ["the Ash", "Ash"], ["Reader", "Rendering", "Lipidpost"], "CODEX §7.4")
t("Sequence Underground", "faction", "The Lysosan-founded network of secrets, forgeries and hidden hosts.", [], ["Unlisted"], "CODEX §7.5")
t("Deep Choir", "faction", "The Barophil faith of the world's slow hardening; they sing the long note.", ["Choir"], ["Long note"], "CODEX §7.6")
t("Currentpost", "society", "The Flow Guilds' messages and passage along charted currents: one region a Beat, for a toll.", [], ["Flow Guilds"], "QUORUM §11.1")
t("Lipidpost", "society", "The Ash's corpse-wagons: slow (a region a Tide) but impossible to search or stop, because censoring a funeral breaks the Sacred Code.", [], ["Reclaimers' Ash"], "QUORUM §11.1")
t("Bridge post", "society", "The Hegemony's registered mail on the Ribbon Bridges — reliable, and read.", [], ["Ribosome Hegemony"], "QUORUM §11.1")

# ---------------- LINEAGES & PHENOTYPES ----------------
t("Lineage", "lineage", "One of the six peoples of the Expanse, each a body plan and a politics: Amoeban, Epithalian, Flagellan, Lysosan, Immunan, Barophil.", ["lineage", "lineages"], ["Frailty"], "ATLAS §2")
t("Amoeban", "lineage", "'The Unfinished': shapeless, flowing chemists, digesters and actors. Useful, never quite trusted.", ["Amoebans"], ["Lineage"], "ATLAS §2")
t("Epithalian", "lineage", "'The Walled': sheet-bodied builders, architects and contract-signers — the lineage others call civilisation.", ["Epithalians"], ["Lineage"], "ATLAS §2")
t("Flagellan", "lineage", "'The Rowed': finned, lashed swimmers born in the Great Flows — couriers, navigators, smugglers. They cannot keep still.", ["Flagellans"], ["Obligate Drifter"], "ATLAS §2")
t("Lysosan", "lineage", "'The Latent': library-bodies that carry sequences not their own — brokers, spies, archivists, distrusted by Wardens.", ["Lysosans"], ["Registered"], "ATLAS §2")
t("Immunan", "lineage", "'The Registered': the lineage of recognising — wardens, registrars, witnesses. They cannot lie.", ["Immunans"], ["Literal"], "ATLAS §2")
t("Barophil", "lineage", "'The Hardened': dense, slow, pressure-proof extremophiles who outlast everyone; the Deep Choir's singers.", ["Barophils"], ["Slow Reaction", "Deep Choir"], "ATLAS §2")
t("Phenotype", "lineage", "An organism's trade or calling — one of 24, like a class.", ["Phenotypes"], [], "ATLAS §3")
t("Pheromological Messenger", "lineage", "A Flagellan calling: carrier of words and scents across the water, and often a storyteller.", [], ["Flagellan"], "ATLAS §3")
t("Pathogen Scout", "lineage", "A Lysosan calling: a scout who can slip through a region's defences unread.", [], ["Lysosan"], "ATLAS §3")
t("Kinetic Striker", "lineage", "A Flagellan fighter whose speed seems to let it arrive twice: it turns Momentum into impact, and is the reason walls have short lives.", ["Kinetic Strikers", "Striker", "Strikers"], ["Flagellan", "Momentum"], "ATLAS §3")
t("Organism", "lineage", "Every person in the Expanse is an organism — a single living cell-being.", ["organism", "organisms"], ["Lineage"], "CORE")

# ---------------- PLACES ----------------
t("The Osmotic Expanse", "place", "The world: an interior ocean of living chemistry — the Great Vesicle — where every person is a cell-being and every law is also physics.", ["the Expanse", "Expanse"], [], "CORE")
t("Sump Nine", "place", "A poor salvage settlement of about 1,800 organisms at a channel mouth on the Fork of the Second Flow, where wrecks wash up.", [], ["Fork of the Second Flow"], "CORE §8.2; QUORUM §17.2")
t("Second Flow", "place", "A colony of 14,000 in the Mid-Strata, run by a water-tally council — and the name of the current it sits on.", [], ["Fork of the Second Flow"], "CODEX §6.3")
t("Fork of the Second Flow", "place", "A branch of the Second Flow's current, running down to Sump Nine.", [], ["Sump Nine"], "CORE §8.2")
t("Ash Rows", "place", "Where a colony's dead hang in their husks, waiting for the Ash to read and render them.", [], ["Reclaimers' Ash", "Rendering"], "CODEX §6.3")
t("Gel moat", "place", "A colony defence of thick gel; in Sump Nine the nursery sits at the warm bottom of it.", ["gel moat"], [], "CORE §7.5")
t("Somatic gate", "place", "A living gate that reads who passes and can be talked to.", ["somatic gate"], ["Porter"], "CORE §7.5")
t("Cytoplasmic Mid-Strata", "place", "The heartland: suspended colony-habs tethered by cables, home to most living organisms.", ["Mid-Strata"], [], "CODEX §6.3")
t("Lysosomal Wastes", "place", "The render-pit deserts where the Ash are strong and the dead are processed.", ["the Wastes", "Wastes"], [], "CODEX §6.7")
t("Lipid Plateaus", "place", "A desert of fat: pale congealed plateaus walked by Barophil herds.", ["Plateaus"], [], "CODEX §6.2")
t("Tallow Market", "place", "A floating bazaar on the Lipid Plateaus with no registers, where you can buy someone else's Oath — and be bound by it.", [], ["Oath", "Ledger"], "CODEX §6.2")
t("Great Flows", "place", "The great nutrient currents of the Expanse; the Flagellans' birthplace.", [], ["Flagellan"], "CODEX §6.4")
t("Peri-Membrane Rim", "place", "The edge of the world, where the outer membrane is close enough to feel.", ["the Rim", "Rim"], [], "CODEX §6.1")
t("Knot Nine", "place", "A city where seven Ribbon Bridges cross: a market and a courtroom.", [], [], "CODEX §6.5")
t("Ribbon Bridges", "place", "Protein highways spun across thousands of Drifts; on a bridge, an Oath is enforced by the bridge.", [], ["Knot Nine"], "CODEX §6.5")
t("Old Mother Brine", "place", "A great Host-City: a slow, motherly saline giant carrying thirty thousand tenants and the Flow Guilds' headquarters.", [], ["Host-City"], "QUORUM §13.5")

t("Momentum", "rule", "The charge an organism builds by moving fast: +1 die and a stronger push on its next Strike.", [], ["Kinetic Striker"], "CORE §4.3")
t("Vat Crew", "faction", "The Ash's hard-harvest labourers: unionised, dangerous work in the render vats. Rivals of the scholarly Ash Readers.", ["Vat Crews"], ["Reclaimers' Ash"], "CODEX §7")
t("Motion", "society", "The one question on the table in a Convocation or Quorum — the thing the room must decide.", ["Motions"], ["Convocation", "Oath"], "QUORUM §4.9")
t("Pressure", "rule", "A Convocation move: lean on someone with threat or status. It can win a rung — but if it fails, the room turns toward Hostile and the colony's Clock advances.", [], ["Convocation", "Walk"], "QUORUM §4.10")
t("Interior", "society", "A colony's unrest, 0–8: its Stress. It climbs when organs die, when a Quorum is stolen, when strikes begin.", [], ["Cohesion"], "QUORUM §2.6")
t("Room mood", "rule", "A Convocation room has a mood — Hungry, Grieving, Hostile and so on — that helps moves which suit it and hinders moves which don't.", ["Hungry", "Hostile", "Grieving"], ["Convocation"], "QUORUM §4.9; CORE §11.3")

t("Standing", "rule", "A faction's memory of you, 0\u201310: Hostile, Wary, Neutral, Obliging, Confided, Bound. One step up with a power means one step down with its rival.", ["Standings", "Wary", "Obliging", "Confided", "Obliging Standing"], ["Ledger"], "CORE \u00a78.7; QUORUM \u00a71.1")
t("Total Dissolution", "rule", "Being dissolved completely, leaving no harvest, no legacy and no memory: the most feared sentence in the Expanse.", [], ["Assay"], "QUORUM \u00a710.4; ATLAS \u00a73")
t("Curators", "faction", "Faceless guardians of the Nucleoid and the Sequence Forest, who act when the Code itself is rewritten.", ["Curator"], ["Sacred Code"], "CODEX \u00a78.1")
t("Homeostatists", "faction", "Those who hold the world's good is stability: correct tonicity, honest registers, harvested dead. Most colonies, the Wardens, the Hegemony's public face.", ["Homeostatist"], ["Entropists"], "CODEX \u00a78.3")
t("Entropists", "faction", "Those who hold the world is already ending and the only dignity is choosing how: the Deep Choir and many Lysosan hermits.", ["Entropist"], ["Homeostatists"], "CODEX \u00a78.3")
t("Sequence Forest", "place", "The oldest library in the world. Precept 5 forbids cutting it, so nobody may edit the oldest record there is.", [], ["Sacred Code"], "CODEX \u00a78.2; QUORUM \u00a711.6")
t("Body Sovereignty", "faction", "A heresy that runs underground railroads for the Unlisted.", [], ["Unlisted"], "CODEX \u00a78.4")
t("Hanging Market of Nine Tolls", "place", "A market strung between cables in the Mid-Strata, where every stall prices in Substrate, specimens, Oath boxes or Cohesion.", ["Hanging Market"], ["Tallow Market"], "QUORUM \u00a79.7")
t("The Fade", "society", "The Sequence Underground's message network: decaying molecules passed hand to hand; fast, deniable, and every relay knows the message.", ["Fade"], ["Sequence Underground"], "QUORUM \u00a711.1")
t("Mourning Rite", "society", "A Beat spent at a place of the dead: it clears Stress and honours the dead. A public one for a beloved dead raises a colony's Cohesion.", [], ["Rite"], "CORE \u00a711.6")
t("Induction", "society", "The Rite of changing organs: a Fugue Interval, 30 S and a sponsor. You lose your old Hearth and its gossip.", ["Induction Rite", "Induced"], ["Organ"], "QUORUM \u00a72.5")
t("Lineage quarter", "place", "In a large colony, each lineage's district with its own Hearth, house rule and taboo: the Melt, the Terraces, the Wake, the Shelves, the Ranks, the Deep End.", ["Melt", "Terraces", "Wake", "Shelves", "Ranks", "Deep End", "quarter", "quarters"], ["Hearth"], "QUORUM \u00a78.3")
t("Bond", "society", "A lasting chemical tie between two organisms, made by conjugation or by Rite.", ["Bonds"], ["Conjugation"], "CORE \u00a711.5")

t("Cohort", "rule", "The players' group: the organisms the players run, travelling and working together. A Cohort shares one Cohesion track.", ["Cohorts", "Cohort's"], ["Cohesion"], "CORE \u00a72.5")
t("Director", "rule", "The game's referee and world-builder: the person who runs the Expanse for the players.", ["Directors", "Director's"], ["Cohort"], "CORE")
t("Clock", "rule", "A countdown of segments that fills as something comes closer: a colony's trouble, an office's patience, a Host-City's temper. When it fills, it happens.", ["Clocks", "Colony Clock", "Response Clock", "Response Clocks", "Table Clock", "Temper Clock", "Order Clock", "Core Clock"], ["Vector"], "CODEX \u00a75.2; QUORUM \u00a71.2")
t("Organ health", "rule", "Each colony organ has four boxes: Sound, Strained, Failing, Necrotic, then Excised. A failing organ charges more, cannot back a side in a Quorum, and drags the colony down.", ["Sound", "Strained", "Failing", "Necrotic", "Excised"], ["Organ"], "QUORUM \u00a72.3")
t("Colony size", "society", "Colonies come in four sizes: Hamlet (20\u2013200), Settlement (200\u20132,000), Colony (2,000\u201350,000) and Metropolis (50,000+). Bigger colonies need thicker air to reach Quorum.", ["Hamlet", "Hamlets", "Settlement", "Settlements", "Metropolis"], ["Quorum"], "QUORUM \u00a72.2")
t("Speech registers", "rule", "The three ways to talk someone round: Semantic (facts, trade), Affective (status, threat, comfort) and Deceptive (masking, forgery). Each is resisted differently.", ["Semantic", "Affective", "Deceptive"], ["Stakes Ladder"], "CORE \u00a711.1")
t("Stakes Ladder", "rule", "How far a conversation moves someone, a rung at a time: from Refusal toward Concession and Compliance. Strong arguments buy rungs; nobody skips a rung they would not cross.", ["Refusal", "Concession", "Compliance"], ["Speech registers"], "CORE \u00a711.2")
t("Pathway skill", "rule", "One of the trained skills a body rolls with, such as Signal Discourse (speech), Chemoreception (reading scent), Pressure Tolerance, Concealment or Sequence Reading.", ["Signal Discourse", "Chemoreception", "Pressure Tolerance", "Concealment", "Sequence Reading", "Fluid Navigation", "Synthesis"], ["Pathway"], "CORE Ch. 3")
t("Memory Vial", "rule", "A crystal of memory drawn from a body, living or dead. Pulling one is hard and hurts everyone involved, and Oaths limit what can be taken.", ["Memory Vials", "Vials"], ["Memory strand"], "CORE \u00a711.7")
t("Argument", "rule", "Precept 6 as a legal weapon: an organism whose body was altered without consent may contest any claim the violator makes, anywhere, once.", [], ["Sacred Code"], "CODEX \u00a78.2")
t("Antigen Rite", "society", "25 S and a witness: for one Tide, one faction's wards read you as 'self'.", ["Antigen Rites"], ["Register"], "CORE \u00a711.6")
t("Naming Rite", "society", "100 S: your chemical name becomes known across a region. Friends can find you; so can enemies.", ["Naming Rites"], ["Rite"], "CORE \u00a711.6")
t("Niche", "society", "A Cohort's home base in a colony: a place to sleep and store, which halves living costs. Its upkeep includes the tally.", ["Niches"], ["Cohort"], "CORE \u00a78.4")
t("Mass Conflict", "rule", "War: battle lines of hundreds, fought in Battle Points (about 10 organisms each). A duel exists to avoid one.", [], ["Oath-duel"], "CODEX \u00a73.6")
t("Recession", "rule", "The opposite of a Bloom: nothing grows, nothing heals, the dead stay dead, and refugees come to the gates.", ["Recessions", "Bloom", "Blooms"], ["Osmotic Tide"], "CODEX \u00a75.4")
t("Foundry Belt", "place", "The Ribosome Hegemony's industrial heartland, where licensed grafts are printed.", [], ["Ribosome Hegemony"], "CODEX \u00a76.6")
t("Vacuolar Abyss", "place", "The deep, pressured region of salt and minerals where the Deep Choir and the Barophils are at home.", ["Abyss", "the Abyss"], ["Deep Choir"], "CODEX \u00a76.8")
t("Lodge", "society", "The house of a trade: every Phenotype keeps one in each colony, with a bunk, a meal and gossip for members. Its master, the Source, teaches for a Ledger line.", ["Lodges"], ["Phenotype"], "QUORUM \u00a714.2")
t("Encystment", "rule", "A sentence: sealed in a cyst under the Lysosome for a set time.", ["Encysted"], ["Assay"], "QUORUM \u00a710.4")
t("Dilution", "rule", "A sentence: exile into open water for a Tide, falling one condition, arrested on sight if you come back early. To be ruined is to be 'diluted'.", ["Diluted", "diluted"], ["Assay"], "QUORUM \u00a710.4")
t("Indenture", "rule", "A sentence: your labour is owed to an organ or a creditor for a set time.", [], ["Assay"], "QUORUM \u00a710.4")
t("Line Purists", "faction", "Those who oppose conjugation across lineages.", [], ["Conjugation"], "QUORUM \u00a74.7")
t("Mood", "rule", "How a creature, or a room, smells tonight: one of twelve moods (Wary, Hungry, Grieving, Hostile, Terrified and so on). It changes every exchange, unlike Standing, which is history.", ["mood", "moods", "Terrified"], ["Standing"], "CORE \u00a711.3")
t("Apoptotic Oath", "society", "A condemned organism's own choice to dissolve and be harvested, which clears its budline's debts and shame.", [], ["Total Dissolution"], "QUORUM \u00a710.4")
t("The Tessellate", "place", "A cold, lattice-bodied Host-City between the Lipid Plateaus and the Foundry Belt: Hegemony licence courts and the cleanest registers in the Expanse.", ["Tessellate"], ["Host-City"], "QUORUM \u00a713.5")
t("Kettle", "place", "A boiling Barophil Host-City between the Vacuolar Abyss and the Lysosomal Wastes: Deep Choir pilgrims and hard, honest tenants.", [], ["Host-City"], "QUORUM \u00a713.5")
Q = ["quorum"]
t("Ossune", "person", "Second Flow's Tally-Keeper, whose secret is that the outer rings' biomass rights were sold three Tides ago.", ["Tally-Keeper Ossune"], ["Second Flow"], "CODEX \u00a712.2", scope=Q)
t("Foreman Ock", "person", "Union boss of the Ash's Vat Crew, who wants legal recognition for his crew.", ["Ock"], ["Vat Crew"], "CODEX \u00a77", scope=Q)
t("Siss-of-the-Nine-Smells", "person", "The Atlas's example character: the ninth smell of the Siss root, a Flagellan.", ["Siss"], ["Budline"], "ATLAS \u00a71", scope=Q)

# ---------------- PEOPLE of What the Water Owed ----------------
S = ["what-the-water-owed", "society-rules"]  # story people also appear in the society reference
t("Lisk-of-the-Seven-Ladders", "person", "The narrator: a young Flagellan messenger who tells this tale at the Rendering.", ["Lisk"], ["Oro"], scope=S)
t("Oro", "person", "Oro-of-the-Seven-Ladders: a Swollen Flagellan hauler of Sump Nine's Pump, ward of Sefa.", ["Oro-of-the-Seven-Ladders"], ["Sefa", "Mesk"], scope=S)
t("Sefa", "person", "Old Sefa: root-elder of the Seven Ladders budline, who leads the haulers' Hearth Rite.", ["Sefa-of-the-Seven-Ladders", "Old Sefa"], ["Oro"], scope=S)
t("Seven Ladders", "person", "A hauling budline of Sump Nine; its founder cut seven ladders up the sump's north wall.", [], ["Budline"], scope=S)
t("Mesk", "person", "Mesk-of-the-Clean-Count: an Immunan, apprentice to the Registrar — and unable to lie.", ["Mesk-of-the-Clean-Count"], ["Literal", "Quell"], scope=S)
t("Quell", "person", "Sump Nine's Registrar: a Lysosan struck from the register in a purge, who went on keeping it anyway.", [], ["Registrar", "Unlisted"], scope=S)
t("Varrow", "person", "An Amoeban Ash Reader of great age and kindness.", [], ["Reader"], scope=S)
t("Yarrow", "person", "Yarrow-who-went-ahead: a Lysosan Pathogen Scout whose body washes into Sump Nine's channel.", ["Yarrow-who-went-ahead"], ["Pathogen Scout"], scope=S)
t("Corvane", "person", "Corvane of the Sealed Pocket: a Dry Epithalian who wants the empty Steward's office.", ["Corvane of the Sealed Pocket"], ["Steward", "Dry"], scope=S)
t("Henn", "person", "Sump Nine's frightened Tally-Keeper, behind on the colony's loan.", [], ["Tally-Keeper"], scope=S)
t("Grue", "person", "Sump Nine's Muster: a vast, slow Barophil who sings the long note.", [], ["Muster", "Barophil"], scope=S)
t("Dunmore", "person", "A scarred old Barophil hauler of the Pump.", [], ["Hauler"], scope=S)
t("Tannet", "person", "The Epithalian keeper of Sump Nine's nursery.", [], ["Nursery"], scope=S)
t("Ket", "person", "Sump Nine's Porter: a stiff Immunan at the somatic gate.", [], ["Porter"], scope=S)
t("Wend", "person", "Sump Nine's Quorum Speaker: an old Lysosan, honest enough most of the time.", [], ["Quorum Speaker"], scope=S)
t("Lune", "person", "A Hegemony factor from the Brine Office.", [], ["Brine Office"], scope=S)
t("Archivist Dol", "person", "A register-keeper at Knot Nine, rumoured to erase entries for the Sequence Underground.", ["Dol"], ["Register"], "CODEX §7.2")

# ---------------- import the Core Rulebook's Appendix B glossary (never overrides the above) ----------------
def core_glossary(path):
    s = open(path, encoding="utf-8").read()
    i = s.find("**Activation Threshold (AT)** —")
    line = s[i:s.find("\n", i)]
    out = []
    for item in line.split(" · "):
        m = re.match(r"\*\*(.+?)\*\*\s*(?:—|→)\s*(.*)", item.strip())
        if not m: continue
        head, d = m.group(1).strip(), m.group(2).strip().rstrip(".").strip()
        if d.startswith("**"): continue                      # a redirect ("A → B")
        names = [x.strip() for x in re.split(r"\s*\(|\)\s*|→", head) if x.strip()]
        if "→" in head: names = names[::-1]
        out.append((names[0], names[1:], d[0].upper() + d[1:] + "."))
    return out
have = {x["name"].lower() for x in T} | {a.lower() for x in T for a in x["aka"]}
if len(sys.argv) > 1:
    for name, aka, d in core_glossary(sys.argv[1]):
        if name.lower() in have: continue
        T.append({"name": name, "cat": "rule", "def": d, "aka": [a for a in aka if a.lower() not in have and len(a) > 2 and a not in ("Total", "Homeostatic", "Concentration")], "rx": [], "see": [], "src": "CORE Appendix B", "level": "player", "scope": None})
        have.add(name.lower())
ids = {}
for x in T:
    x["id"] = re.sub(r"[^a-z0-9]+", "-", x["name"].lower()).strip("-")
    assert x["id"] not in ids, x["id"]; ids[x["id"]] = x
byname = {x["name"]: x["id"] for x in T}
for x in T: x["see"] = [byname[s] for s in x["see"] if s in byname]
json.dump({"version": 1, "cats": CATS, "terms": T}, open("lexicon.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(T), "terms")
