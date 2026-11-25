// The Ashen Crown of Sundermark: Roly's three-act campaign for levels 1 to 10, set out for the AI
// Director. Act I is written in full (the in-media-res ambush, Oakhurst and its four nodes); Acts II
// and III give each node, its methods and its clues. Monsters are from the SRD 5.1 or are this
// adventure's own stat blocks (ids starting "ac-", written for this project), so the adventure
// plays without any book. If your private book library is installed, the Director can also look up
// and add the Monster Manual's creatures (a carrion crawler for the mill, say).

const MILESTONE = (lvl, xp) => `MILESTONE: when this is resolved, every character should reach level ${lvl} (${xp.toLocaleString('en')} XP). Use award_xp with each=true for what the least experienced character still needs.`;

export default {
  id: 'ashen-crown',
  name: 'The Ashen Crown of Sundermark',
  levels: '1 to 10',
  // The party it is written for (each place says its level). Fights are fitted to the party at the table.
  party: { size: 4, level: 1 },
  blurb: 'A frontier valley, a traitor in the town hall and a half-dragon warlord hunting three keystones. Begins mid-ambush on a burning bridge; every place has three ways in and three clues out.',
  intro: 'Cold autumn rain lashes the muddy ruts of the King\'s Way. For three days your caravan has climbed into the Sundermark, a frontier valley of towering pines, mist-choked crags and old dwarven ruins. Ahead, the road narrows across Highbridge Gorge: a hundred-foot stone span over a roaring whitewater canyon. Suddenly the lead wagon\'s horses scream. A bolt of green alchemical fire arcs out of the pines and slams into the bridge\'s wooden tollhouse, blowing it into flaming splinters. The iron portcullis at the far end crashes down, trapping the wagons over the gorge. From the treeline behind you goblins in branded iron masks charge out with crossbows raised, while on the bridge ahead a scarred mercenary captain pries an iron lockbox from the overturned lead wagon. Caravan Master Halia Vance takes an arrow in the shoulder and shouts over the roar of the flames: "Don\'t let them take the strongbox, and get that gate open before the bridge collapses!" Roll for initiative!',
  // How the whole campaign is run: given to the AI Director every turn.
  director: 'This campaign never railroads. THE THREE CLUE RULE: every place holds at least three clues pointing elsewhere; if the party kills a witness, skips a dungeon or sneaks past a fight, give the clue another way (a letter on the body, a rumour in town, a second witness). THREE METHODS: every big encounter can be won by fighting, by stealth or trickery, or by talk and leverage. Reward whichever the players choose and never force a fight they are talking their way out of. The players choose the order of the nodes. Bailiff Cedric Thorne is the secret traitor "B": never reveal it until the players find the proof (the promissory note at the mill, the dying hobgoblin at the barrow, or his own nerves under Insight). Ask each player early on why their character travels with the Last Autumn Supply Caravan: hired steel (paid 15 gp by Halia Vance), a personal letter from Father Lucan ("the graves are being robbed from the inside"), or a lost heirloom or the map to the dwarven vault of Karak-Tor. Weave those reasons in. Allies the party makes (Halia, Torgga, Snikt, the factions of Act II) come back to help at Thorne Keep, Brindol\'s gates and Cinderhelm.',
  quests: [
    'Save the caravan at Highbridge Gorge: keep the Iron Strongbox from the raiders and get the gate open before the bridge burns.',
    'See the Last Autumn Supply Caravan safely into Oakhurst.',
  ],
  // Where each quest can be finished. Quests the notes tell you to add use these words.
  questDone: [
    { match: 'highbridge', at: ['highbridge', 'oakhurst'], when: 'the strongbox is saved or the raiders driven off, and the gate is open' },
    { match: 'safely into oakhurst', at: ['oakhurst'], when: 'the wagons roll into Oakhurst' },
    { match: 'blackreed', at: ['blackreed', 'oakhurst'], when: 'the River Rats at Blackreed Mill are dealt with and the mill searched' },
    { match: 'saint vane', at: ['barrow-sanctum', 'oakhurst'], when: 'the First Keystone is in the party\'s hands' },
    { match: 'ironfang', at: ['ironfang', 'oakhurst'], when: 'the Ironfang foundry is stopped (Kragg beaten, driven out or overthrown)' },
    { match: 'anvil', at: ['oakhurst'], when: 'Torgga\'s Clan Anvil is back in the Anvil & Ember' },
    { match: 'thorne', at: ['thorne-keep', 'oakhurst'], when: 'Bailiff Thorne is captured, killed or exposed before the town, and Drazhul is beaten' },
    { match: 'karak-tor', at: ['karak-tor'], when: 'the Second Keystone is safe and Vorgath stopped' },
    { match: 'starfall', at: ['starfall'], when: 'the apprentices are free and the Third Keystone is safe' },
    { match: 'briarwood', at: ['briarwood'], when: 'the coven is dealt with, by bargain, theft or blade' },
    { match: 'elixir', at: ['briarwood'], when: 'the Blood-Ash Elixir is tainted with the coven\'s help' },
    { match: 'gates', at: ['brindol-gates'], when: 'the night assault on Brindol is broken' },
    { match: 'malakor', at: ['coronation'], when: 'Lord Malakor Vane is dead or broken' },
    { match: 'ashen crown', at: ['coronation'], when: 'the Crown is destroyed on the Runic Anvil' },
  ],
  sites: [
    // ------------------------------------------------------------------ Act I: Local heroes
    {
      id: 'highbridge', name: 'Highbridge Gorge', region: 'The King\'s Way', level: 1,
      read: 'A hundred-foot stone bridge in the rain, slick and narrow, over a whitewater gorge. The tollhouse at the near end is a bonfire of splintered beams. At the far end a rusted iron portcullis blocks the road, its winch house beside it. Wagons are slewed across the span, horses rearing; goblins in iron masks pour out of the pines behind you and a scarred captain crouches over the overturned lead wagon.',
      notes: 'START HERE: the game opens mid-ambush. Reveal the raiders and start combat at once. The Iron Brand captain is prying the Iron Strongbox open; at the end of round 2 (or when below half hit points) the captain flees through the side postern gate with whatever it holds (monster_flees), leaving the four goblins to hold the bridge. Tick the burning bridge clock at the end of every round of the fight. When the raiders are beaten or surrender, the rain wins: the fire dies back, Halia\'s teamsters crank the gate up together (no roll needed once nobody is shooting at them), clear both clocks with the clock tool, and the wagons roll on toward Oakhurst. THREE METHODS: (A) fight across the bridge and break the rusted winch chain (AC 15, 15 hit points: tick the winch clock for every 5 damage) or crank it with a DC 14 Athletics check (fills it); (B) climb along the stone arches under the bridge (DC 12 Athletics or Acrobatics) to flank the winch house unseen and drop burning tollhouse beams on the raiders (2d6 fire to those beneath); (C) once the captain flees, the goblins are paid mercenaries, not fanatics: Command, Sleep or a DC 13 Intimidation makes them throw down their crossbows and talk. Halia Vance is wounded but fights on with her cane. THE THREE CLUES (found in the wreckage once the fight ends, any order): 1) a waterproof wax-sealed ledger page listing shipments of "Alchemical Blasting Oil" through Blackreed Watermill downriver, signed with the initial "B"; 2) the Iron Strongbox has a false bottom holding a rubbing of a burial plaque from the Sunken Barrow of Saint Vane, marking where the First Runic Keystone rests; 3) the goblins\' iron masks bear the fresh maker\'s stamp of the old Ironfang copper mine, three miles north in the crags. When they find each clue, add its quest: "Follow the ledger signed B to the Blackreed Mill.", "Find out why the Iron Brand wants the Sunken Barrow of Saint Vane.", "Find the forge that stamps the Iron Brand masks: the old Ironfang mine." Captured goblins can confirm any one of these. Oakhurst is one mile past the bridge.',
      npcs: [
        { name: 'Halia Vance', who: 'the caravan master, a tough human veteran with a silver-topped cane and an arrow in her shoulder', voice: 'clipped orders over the noise, never panics', wants: 'the strongbox kept and every wagon over the bridge' },
        { name: 'Gex', who: 'a goblin raider in a branded iron mask, paid by the job', voice: 'whining, fast, bargains for his life', wants: 'to live, and to be paid by somebody' },
      ],
      checks: [
        { skill: 'athletics', dc: 14, find: 'The rusted winch chain grinds round: the portcullis rises.' },
        { skill: 'acrobatics', dc: 12, find: 'A path along the arches under the span reaches the winch house unseen.' },
        { skill: 'intimidation', dc: 13, find: 'With their captain gone, the goblins throw down their weapons and beg to talk.' },
        { skill: 'investigation', dc: 10, find: 'The strongbox has a false bottom: a rubbing of a burial plaque from the Sunken Barrow of Saint Vane.' },
        { skill: 'perception', dc: 12, find: 'A wax-sealed ledger page lies in the mud where the captain knelt, signed "B".' },
      ],
      foes: [
        { monster: 'goblin', count: 4, name: 'Iron Brand goblin', note: 'iron-masked mercenaries; surrender once the captain flees' },
        { monster: 'ac-iron-brand-captain', count: 1, name: 'Iron Brand captain', note: 'prying open the Iron Strongbox; flees at the end of round 2' },
      ],
      clocks: [
        { name: 'The burning bridge', size: 6, note: 'The burning near end of the span gives way: anyone still on it makes a DC 12 Dexterity save or falls 20 feet into the shallows (2d6 bludgeoning).' },
        { name: 'The portcullis winch', size: 3, note: 'The gate is open: the wagons can roll off the bridge.' },
      ],
      treasure: 'The Iron Strongbox (if saved) holds the caravan\'s pay chest: Halia gives each character 10 gp on arrival. The captain\'s dropped hand crossbow; 2 Potions of Healing in Halia\'s wagon, given to the party.',
      rules: [
        { id: 'ambush', when: 'enter', do: 'fight', say: 'The game opens mid-ambush: the raiders are in plain sight and the fight is on.' },
        { id: 'bridge-burns', when: 'round', do: 'tick', clock: 'The burning bridge' },
        { id: 'captain-runs', when: 'round 3', who: 'Iron Brand captain', do: 'flee', say: 'At the end of round 2 the captain slips out through the side postern gate with whatever the strongbox held.' },
        { id: 'captain-hurt', when: 'hurt', who: 'Iron Brand captain', do: 'flee', say: 'Badly hurt, the captain runs for the side postern gate.' },
        { id: 'goblins-yield', when: 'succeed intimidation', if: 'down Iron Brand captain', do: 'flee', target: 'Iron Brand goblin', say: 'With their captain gone, the goblins throw down their crossbows and beg to talk.' },
        { id: 'caravan-saved', when: 'cleared', do: 'quest', quest: 'highbridge', say: 'The raiders are beaten: the rain wins, the fire dies back and the teamsters crank the gate up. Clear both clocks.' },
      ],
      exits: [{ to: 'oakhurst', label: 'the King\'s Way, one mile on to Oakhurst' }],
    },
    {
      id: 'oakhurst', name: 'Oakhurst', region: 'Oakhurst', travelHours: 0.5, level: 1,
      read: 'A stockaded frontier town of six hundred souls in a bowl of pines. Smoke rises from the Anvil & Ember forge; the Boar & Barrel inn glows warm behind rain-streaked glass; a little whitewashed Shrine of the Dawn stands on the hill. Above the square looms Thorne Keep, the bailiff\'s fortified manor, its gates shut.',
      notes: 'THE HUB of Act I. The party can take the three leads in any order; Halia pays 50 gp for each node cleared and gives free rooms at the Boar & Barrel. Father Lucan heals for free and knows the legend: two hundred years ago the red dragon warlord Vaeloryx the Ash-King was slain, his soul bound in the Ashen Crown beneath the dwarven fortress of Cinderhelm, behind Three Runic Keystone Seals; he also teaches the dawn hymn that matters in the barrow. Bailiff Cedric Thorne is the traitor "B" (blackmailed over gambling debts by Lord Malakor Vane): he is pompous and helpful, twists his signet ring when lied to or pressed (DC 14 Insight notices; DC 16 he is terrified of someone). Do not let him be exposed without proof. Torgga Ironvein\'s clan anvil was stolen; if the party brings it back from Ironfang she reforges Iron Brand steel into +1 weapons (one for each character, at level 3 or 4). Once two of the three nodes are done, or the proof against Thorne is found, add the quest "Bring Bailiff Cedric Thorne to justice." and Thorne Keep opens up as the Act I climax. A long rest at the inn is safe until Thorne is exposed; after that, his guards may try something.',
      npcs: [
        { name: 'Halia Vance', who: 'caravan master and head of the Miners\' Exchange, LN human veteran', voice: 'dry, pragmatic, taps her cane when she is thinking', wants: 'whoever is selling out her caravans; she already suspects the bailiff takes bribes' },
        { name: 'Father Lucan', who: 'elderly, half-blind priest of the Shrine of the Dawn, NG', voice: 'gentle, slow, quotes hymns', wants: 'the robbed graves put right; he wrote to an old pupil that "the graves are being robbed from the inside"' },
        { name: 'Bailiff Cedric Thorne', who: 'the appointed town magistrate, LE human noble, secretly the traitor "B"', voice: 'pompous and over-friendly, twists his signet ring', wants: 'his debts gone and the party far away, chasing anything but him' },
        { name: 'Torgga Ironvein', who: 'master smith of the Anvil & Ember, LG dwarf of the lost Clan Ironvein', voice: 'gruff, few words, hammer never still', wants: 'her clan\'s stolen smithing anvil back' },
        { name: 'Mags Underbridge', who: 'landlady of the Boar & Barrel, a broad halfling who hears every rumour', voice: 'loud, motherly, gossip by the bucket', wants: 'paying guests and somebody to do something about the mill' },
      ],
      checks: [
        { skill: 'insight', dc: 14, find: 'Thorne twists his signet ring whenever the ambush or Blackreed comes up: he is hiding something.' },
        { skill: 'religion', dc: 12, find: 'Father Lucan\'s legend: the Three Runic Keystones seal the Ashen Crown in Cinderhelm; one rests in the Sunken Barrow of Saint Vane.' },
        { skill: 'history', dc: 13, find: 'Clan Ironvein lost Cinderhelm two centuries ago; the vault of Karak-Tor was its treasury.' },
        { skill: 'persuasion', dc: 12, find: 'Mags tells the party that River Rats from Blackreed Mill drink here on credit the bailiff pays.' },
      ],
      treasure: 'Halia pays 50 gp for each node cleared. Father Lucan gives the party a vial of holy water and teaches them the dawn hymn.',
      rules: [
        { id: 'safe-in-oakhurst', when: 'enter', do: 'quest', quest: 'safely into oakhurst' },
      ],
      exits: [
        { to: 'blackreed', label: 'downriver along the Silverrun to Blackreed Mill' },
        { to: 'barrow-crypt', label: 'south into the Greyfen Marsh, to the Sunken Barrow of Saint Vane' },
        { to: 'ironfang', label: 'north into the crags, to the old Ironfang copper mine' },
        { to: 'thorne-keep', label: 'up the hill to Thorne Keep (once the party moves against the bailiff)' },
        { to: 'brindol', label: 'the King\'s Way east to Brindol, the valley capital (Act II)' },
      ],
    },
    {
      id: 'blackreed', name: 'Blackreed Mill', region: 'The Silverrun River', travelHours: 3, level: 2,
      read: 'An abandoned watermill leans over the Silverrun, its great wheel still turning in the race. Lamplight leaks from a bunkhouse built against the mill, and a rowing boat is tied below the sluice. Somewhere under the wheel, something wet scrapes against iron bars.',
      notes: 'NODE A (level 2). The River Rats, smugglers in Thorne\'s pay: five bandits and their leader Riven the Eelskin (a spy). A sluice crawler is caged under the waterwheel sluice (it is not placed: if the party frees it, add_monsters ac-sluice-crawler named "Sluice crawler", or carrion-crawler if the DM\'s book library is installed; it attacks whoever is nearest). THREE METHODS: infiltration (swim in through the underwater mill-wheel intake, DC 12 Athletics; or creep across the roof shingles, DC 12 Stealth); deception (pose as buyers using the wax-sealed ledger page from the bridge, DC 12 Deception; Riven tests them with a question about "B"); sabotage (release the caged crawler into the bunkhouse: it fights the bandits; use deal_damage on them as it does). THE THREE CLUES: 1) crates of dwarven blasting powder stamped for delivery to the Ironfang foundry, "to open Saint Vane\'s Barrow"; 2) a signed promissory note in Bailiff Cedric Thorne\'s handwriting ordering the ambush of Halia\'s caravan (the proof against Thorne); 3) a map of a secret drainage tunnel that runs straight into the basement of Thorne Keep. Riven, if taken alive, will trade the name "Thorne" for her freedom. ' + MILESTONE(2, 300),
      npcs: [
        { name: 'Riven the Eelskin', who: 'leader of the River Rats, a wiry spy in an oilskin coat', voice: 'soft, mocking, always half a smile', wants: 'to get out of this alive and rich; loyal to coin, not to Thorne' },
      ],
      checks: [
        { skill: 'athletics', dc: 12, find: 'The underwater intake leads up into the mill floor, unseen.' },
        { skill: 'stealth', dc: 12, find: 'Across the roof to the loft hatch without a sound.' },
        { skill: 'deception', dc: 12, find: 'Riven believes they are buyers sent by "B" and talks shipments.' },
        { skill: 'investigation', dc: 12, find: 'The strongroom: blasting powder crates stamped for Ironfang, Thorne\'s promissory note, and the drainage tunnel map.' },
      ],
      foes: [
        { monster: 'bandit', count: 5, name: 'River Rat', note: 'smugglers; flee if Riven falls' },
        { monster: 'spy', count: 1, name: 'Riven the Eelskin', note: 'leader; bargains when cornered' },
      ],
      treasure: '60 gp in a strongbox, a Potion of Healing, and the three clues (blasting powder crates, Thorne\'s promissory note, the tunnel map).',
      rules: [
        { id: 'rats-scatter', when: 'down', who: 'Riven the Eelskin', do: 'flee', target: 'River Rat', say: 'With Riven down, the River Rats scatter for the boat.' },
        { id: 'mill-taken', when: 'cleared', do: 'quest', quest: 'blackreed' },
        { id: 'milestone', when: 'quest blackreed', do: 'xp', level: 2 },
      ],
      exits: [{ to: 'oakhurst', label: 'back upriver to Oakhurst' }, { to: 'thorne-keep', label: 'the secret drainage tunnel into the basement of Thorne Keep (with the map)' }],
    },
    {
      id: 'barrow-crypt', name: 'The Sunken Barrow of Saint Vane: the upper crypt', region: 'The Greyfen Marsh', travelHours: 4, level: 2,
      read: 'A half-drowned stone abbey rises from the reeds of the Greyfen, its bell tower leaning. Inside, the upper crypt is a forest of broken pillars. Torchlight and shouting: masked hobgoblins with picks and shields stand back to back around a robed woman, while yellowed skeletons and a hunched, grey-skinned thing close in on them from the burial niches.',
      notes: 'NODE B (level 2-3). A three-way standoff: four Iron Brand hobgoblin excavators and the cult fanatic Sister Morwen against six skeletons and a ghoul. They are fighting each other when the party arrives; let them (deal_damage between the sides as it goes). THREE METHODS: divide and conquer (let the undead and the excavators wear each other down, then mop up); bluff or bargain with Sister Morwen for a temporary truce (DC 13 Deception or Persuasion: she wants the Keystone and will betray the party in the sanctum); or simply fight. A dying hobgoblin confesses that Bailiff Thorne is preparing to open Oakhurst\'s gates to a warband (clue). Sister Morwen carries ciphered orders from Lord Malakor Vane naming the locations of the Second and Third Keystones (DC 13 Investigation or Arcana to decipher: Karak-Tor and Starfall Spire). The way down to the inner sanctum is a flooded stair.',
      npcs: [
        { name: 'Sister Morwen', who: 'a cult fanatic of the Iron Brand, sent to dig out the First Keystone', voice: 'fervent, sing-song, calls Malakor "the Heir"', wants: 'the Keystone, and anyone she can use to get it' },
      ],
      checks: [
        { skill: 'deception', dc: 13, find: 'Sister Morwen agrees to a truce "until the Keystone is found".' },
        { skill: 'investigation', dc: 13, find: 'Morwen\'s ciphered orders name the Dwarven Vault of Karak-Tor and Starfall Spire: the other two Keystones.' },
        { skill: 'medicine', dc: 10, find: 'A dying hobgoblin gasps that the bailiff will open Oakhurst\'s gates to a warband.' },
      ],
      foes: [
        { monster: 'hobgoblin', count: 4, name: 'Iron Brand excavator', note: 'fighting the undead when the party arrives' },
        { monster: 'cult-fanatic', count: 1, name: 'Sister Morwen', note: 'Iron Brand cultist; will bargain' },
        { monster: 'skeleton', count: 6, name: 'Barrow skeleton', note: 'attack the living nearest them, of either side' },
        { monster: 'ghoul', count: 1, name: 'Barrow ghoul', note: 'feeds on the fallen' },
      ],
      treasure: 'Burial offerings in the niches: 40 gp in old coins and a silver sun-disc (25 gp). Morwen\'s ciphered orders.',
      exits: [{ to: 'barrow-sanctum', label: 'down the flooded stair to the inner sanctum' }, { to: 'oakhurst', label: 'back through the marsh to Oakhurst' }],
    },
    {
      id: 'barrow-sanctum', name: 'The Sunken Barrow of Saint Vane: the inner sanctum', region: 'The Greyfen Marsh', travelHours: 0.1, level: 2,
      read: 'Waist-deep black water fills a round chamber. Three great bronze mirrors stand on pivots around a stone tomb carved with a rising sun, each turned away from a shaft of grey daylight. On the tomb kneels an armoured figure with a sword across its knees, eyes like cold lamps.',
      notes: 'The wight is Sir Garrick, the corrupted spirit of Saint Vane\'s bodyguard. THE PUZZLE (no fight needed): align the three sun-mirrors (DC 13 Religion or Investigation, one check per mirror, or one check with advantage if they recite Father Lucan\'s dawn hymn). When the light falls on the tomb, Sir Garrick is put to peaceful rest (use monster_flees to remove him, narrated as his spirit going to the dawn), and he leaves his +1 longsword Dawnwarden. Otherwise he fights to guard the tomb. The First Runic Keystone lies in the tomb. When they take it, the Saint Vane quest is done. ' + MILESTONE(3, 900),
      checks: [
        { skill: 'religion', dc: 13, find: 'The mirrors are a dawn rite: turned to the light in order while the hymn is sung, they lay the dead to rest.' },
        { skill: 'investigation', dc: 13, find: 'One mirror turns; the beam strikes the next. Two more and the light reaches the tomb.' },
      ],
      foes: [{ monster: 'wight', count: 1, name: 'Sir Garrick', note: 'Saint Vane\'s bodyguard; laid to rest by the sun-mirrors' }],
      treasure: 'The First Runic Keystone. Dawnwarden, a +1 longsword (sheds dim light at dawn). 2 Potions of Healing in a reliquary.',
      rules: [
        { id: 'milestone', when: 'quest saint vane', do: 'xp', level: 3 },
      ],
      exits: [{ to: 'barrow-crypt', label: 'up the flooded stair' }],
    },
    {
      id: 'ironfang', name: 'The Ironfang Goblin Foundry', region: 'The northern crags', travelHours: 2, level: 3,
      read: 'An old terraced copper mine has become a war-foundry. A great brick furnace chimney belches black smoke over the crags; mine-cart tracks hang on trestles between the terraces, over vats of glowing slag. Goblins in chains haul ore under the whip of a huge bugbear, and an ogre sits on a pile of finished iron masks, eating.',
      notes: 'NODE C (level 3). Taskmaster Kragg (a bugbear chief) runs it with a hired ogre and eight overworked goblins. The goblin shaman Snikt is locked in a punishment cage on the top terrace. THREE METHODS: goblin uprising (free Snikt, DC 12 Sleight of Hand or Athletics on the cage, then DC 12 Persuasion: Snikt rallies the eight goblins to revolt against Kragg and the ogre; the goblins then flee or fight on the party\'s side, so remove them with monster_flees and narrate them mobbing Kragg); demolition (alchemical blasting oil from the mill, or a DC 13 Investigation to find the cracked chimney flue, collapses the furnace chimney: 4d6 bludgeoning to everyone on the lower terrace, DC 13 Dexterity save for half); frontal assault across the suspended mine-cart tracks and slag vats (falling into a slag vat is 3d6 fire). Snikt is an NPC, not a monster: he becomes a friend in Oakhurst if freed. CLUES AND REWARDS: Torgga Ironvein\'s stolen Clan Anvil (add the quest "Return the Clan Anvil to Torgga Ironvein."), and an iron war-map showing the Iron Brand\'s muster camps across the valley and a red mark on Thorne Keep. ' + MILESTONE(4, 2700),
      npcs: [
        { name: 'Snikt', who: 'a goblin shaman in a punishment cage, clever and bitter', voice: 'hoarse whisper, talks about himself in the third person', wants: 'out, and Kragg humbled' },
        { name: 'Taskmaster Kragg', who: 'a bugbear chief with a chain whip', voice: 'slow, heavy, amused by pain', wants: 'his quota of masks and blades for the Iron Brand' },
      ],
      checks: [
        { skill: 'persuasion', dc: 12, find: 'Snikt shrieks the word, and eight goblins drop their tools and turn on their masters.' },
        { skill: 'investigation', dc: 13, find: 'A cracked flue at the chimney\'s base: one good blast would bring it down.' },
        { skill: 'acrobatics', dc: 12, find: 'Running the mine-cart trestles reaches the top terrace fast.' },
      ],
      foes: [
        { monster: 'ac-kragg', count: 1, name: 'Taskmaster Kragg', note: 'the foundry boss' },
        { monster: 'ogre', count: 1, name: 'Hired ogre', note: 'paid in meat; flees if Kragg falls and the goblins turn' },
        { monster: 'goblin', count: 8, name: 'Ironfang goblin', note: 'overworked slaves; revolt if Snikt rallies them' },
      ],
      treasure: 'Torgga\'s Clan Anvil (too heavy to carry far without a cart: the party can come back for it). The iron war-map. A chest with 80 gp and a Potion of Healing.',
      rules: [
        { id: 'ogre-quits', when: 'down', who: 'Taskmaster Kragg', do: 'flee', target: 'Hired ogre', say: 'With Kragg down, the hired ogre wants no more of it and lumbers off.' },
        { id: 'foundry-stopped', when: 'cleared', do: 'quest', quest: 'ironfang' },
        { id: 'milestone', when: 'quest ironfang', do: 'xp', level: 4 },
      ],
      exits: [{ to: 'oakhurst', label: 'down from the crags to Oakhurst' }],
    },
    {
      id: 'thorne-keep', name: 'Thorne Keep', region: 'Oakhurst', travelHours: 0.2, level: 4,
      read: 'Storm clouds boil over Oakhurst. Thorne Keep\'s gates are barred, torches move on the battlements, and through the rain you glimpse red-scaled shapes among the bailiff\'s guards: the Iron Brand is inside.',
      notes: 'NODE D, the Act I climax (level 4): the Night of Iron and Fire. Bailiff Cedric Thorne has locked himself in with his house guards and an Iron Brand strike team under Wyrm-Captain Drazhul, a half-red dragon veteran. THREE METHODS: rally the town (present the proof of Thorne\'s treason to Halia Vance: the town militia storms the front gates beside the party, which takes the house guards out of the fight; narrate the militia and remove the guards with monster_flees as the militia carries them off); sewer infiltration (the drainage tunnel map from the mill: DC 12 Stealth to come up in the keep\'s vault, behind the defenders); a rooftop duel (confront Drazhul on the storm-lashed battlements; Drazhul honours a one-on-one challenge, DC 14 Intimidation or Persuasion, and his soldiers stand back). Thorne begs, bribes (200 gp and the keep\'s deeds) and blames Malakor; he knows Malakor\'s name and that the Iron Brand gathers at Cinderhelm. REWARD: the town deeds Thorne Keep to the party as their home base, and the Act I story is done. ' + MILESTONE(5, 6500) + ' Then Halia sends word to Brindol: Act II begins.',
      npcs: [
        { name: 'Wyrm-Captain Drazhul', who: 'a half-red dragon veteran of the Iron Brand, scarred and proud', voice: 'deep, formal, a warrior\'s courtesy', wants: 'a worthy fight, and the bailiff alive for Malakor' },
        { name: 'Bailiff Cedric Thorne', who: 'the traitor "B", cornered', voice: 'shrill, wheedling, then sobbing', wants: 'to live' },
      ],
      checks: [
        { skill: 'stealth', dc: 12, find: 'Up through the drainage tunnel into the vault, unseen.' },
        { skill: 'intimidation', dc: 14, find: 'Drazhul accepts a duel on the battlements; his soldiers lower their blades and watch.' },
        { skill: 'persuasion', dc: 12, find: 'Halia believes the proof: the militia gathers at the gates.' },
      ],
      foes: [
        { monster: 'half-red-dragon-veteran', count: 1, name: 'Wyrm-Captain Drazhul', note: 'leads the strike team' },
        { monster: 'hobgoblin', count: 3, name: 'Iron Brand soldier', note: 'Drazhul\'s strike team' },
        { monster: 'guard', count: 4, name: 'Thorne\'s house guard', note: 'loyal to their pay; surrender to the militia' },
        { monster: 'noble', count: 1, name: 'Bailiff Cedric Thorne', note: 'hides in the vault; surrenders when cornered' },
      ],
      treasure: 'The deeds to Thorne Keep. Thorne\'s strongroom: 300 gp, a silver signet ring (50 gp), a Potion of Healing, and Malakor\'s letter naming Cinderhelm.',
      rules: [
        { id: 'milestone', when: 'quest thorne', do: 'xp', level: 5 },
      ],
      exits: [{ to: 'oakhurst', label: 'down to the town square' }],
    },
    // ------------------------------------------------------------------ Act II: Heroes of the realm
    {
      id: 'brindol', name: 'Brindol, the valley capital', region: 'Brindol', travelHours: 16, level: 5,
      read: 'Brindol\'s grey walls climb a hill above the Silverrun, banners snapping over the gatehouse. Inside, the streets are full of soldiers drilling, refugees from the outer farms and rumours of an iron army in the hills.',
      notes: 'THE HUB of Act II (levels 5 to 8). Add the quests: "Reach the Second Keystone in the Dwarven Vault of Karak-Tor.", "Save Starfall Spire and the Third Keystone.", "Deal with the Briarwood coven and its Blood-Ash Elixir.". The four factions: the Lords\' Council of Brindol (Lady Jarmaath: knighthoods, warhorses, troops); Clan Ironvein (Thane Durgan: wants Karak-Tor back, gives dwarven siege engineers and rune-forged armour for Act III); the Wardens of Starfall (Archmage Selari: griffon mounts and teleportation circles); and the Iron Brand Legion (Lord Malakor Vane, who sends his elite bounty hunters, the Ash Hounds, after the party). The nodes can be taken in any order. Tick the invasion clock once after each node the party finishes, and once for each long rest they spend idle; when it fills, Malakor attacks: move the party to Brindol\'s gates. The first night the party sleeps in Brindol, two Ash Hounds strike: add_monsters ac-ash-hound, count 2, named "Ash Hound". Each faction the party helps sends someone to fight at the gates and at Cinderhelm.',
      npcs: [
        { name: 'Lady Jarmaath', who: 'head of the Lords\' Council, LG human knight', voice: 'measured, courteous, iron underneath', wants: 'Brindol held, and proof the party can be trusted with troops' },
        { name: 'Thane Durgan Ironvein', who: 'exiled lord of Clan Ironvein, LG dwarf, Torgga\'s uncle', voice: 'booming, proud, swears by his ancestors', wants: 'the vault of Karak-Tor reclaimed' },
        { name: 'Archmage Selari', who: 'warden of the Starfall observatory, CG high elf mage (here by sending-stone)', voice: 'quick, precise, worried for her apprentices', wants: 'her apprentices freed from Venyx' },
      ],
      checks: [
        { skill: 'history', dc: 14, find: 'The three Keystones: one in Saint Vane\'s barrow, one in the Karak-Tor vault, one in Starfall Spire. All three open the vault of the Ashen Crown.' },
        { skill: 'insight', dc: 13, find: 'Lady Jarmaath suspects a saboteur inside Brindol\'s walls (the doppelgangers of the gates battle).' },
      ],
      clocks: [{ name: 'The invasion of Brindol', size: 8, global: true, note: 'Malakor attacks Brindol by night: go to Brindol\'s gates.' }],
      treasure: 'The Council pays 200 gp per Keystone secured; a knighthood and warhorses for saving the Third.',
      exits: [
        { to: 'karak-tor', label: 'into the mountains to the Dwarven Vault of Karak-Tor' },
        { to: 'starfall', label: 'up the crystal mountain to Starfall Spire' },
        { to: 'briarwood', label: 'into Witchwater Bog, to the Briarwood coven' },
        { to: 'brindol-gates', label: 'the city gates (when the Iron Brand attacks)' },
        { to: 'oakhurst', label: 'back along the King\'s Way to Oakhurst and Thorne Keep' },
        { to: 'cinderhelm', label: 'north to Cinderhelm Peak (Act III, once the gates are held)' },
      ],
    },
    {
      id: 'karak-tor', name: 'The Dwarven Vault of Karak-Tor', region: 'The Ironvein mountains', travelHours: 12, level: 5,
      read: 'A vast dwarven hall carved from black basalt, lit red by a river of magma behind a runic seal. A clanking drill-rig, hauled by a snorting iron-scaled beast, gnaws at the seal; grey-skinned dwarves shout orders over the din, while at the far end Thane Durgan\'s kin are pinned behind an overturned ore-cart.',
      notes: 'NODE E1 (levels 5-6). Vorgath the Earth-Shaker, Malakor\'s duergar sapper chief, drives a gorgon-hauled drill-rig at the magma-sealed vault that holds the Second Keystone. Four duergar sappers. THREE METHODS: reactivate the ancient dwarven steam-cannons (DC 14 Arcana or Athletics, two successes: each blast is 4d10 bludgeoning to the drill-rig and those by it); solve the runic weight-scale puzzle (DC 15 Investigation or History) to drop Vorgath\'s camp into the lava cistern (everyone in the camp makes a DC 15 Dexterity save or takes 6d10 fire); or bribe the underpaid duergar mercenaries with 500 gp from the vault\'s treasury (DC 13 Persuasion: the duergar walk away, use monster_flees). The Second Runic Keystone is behind the seal. Thane Durgan becomes a firm ally. ' + MILESTONE(6, 14000),
      npcs: [{ name: 'Vorgath the Earth-Shaker', who: 'a duergar warlord and siege engineer', voice: 'gravel and sneers', wants: 'the Keystone, and his pay, in that order' }],
      checks: [
        { skill: 'arcana', dc: 14, find: 'The steam-cannons wake: the runes glow and the boilers hiss.' },
        { skill: 'investigation', dc: 15, find: 'The weight-scale runes: shift the counterweights and the camp floor tips into the lava cistern.' },
        { skill: 'persuasion', dc: 13, find: 'The duergar sappers will take 500 gp and walk away.' },
      ],
      foes: [
        { monster: 'ac-vorgath', count: 1, name: 'Vorgath the Earth-Shaker', note: 'the sapper chief' },
        { monster: 'gorgon', count: 1, name: 'Drill-rig gorgon', note: 'yoked to the drill-rig' },
        { monster: 'duergar', count: 4, name: 'Duergar sapper', note: 'underpaid mercenaries; can be bribed' },
      ],
      treasure: 'The Second Runic Keystone. The vault treasury: 1,200 gp, a Potion of Greater Healing, and rune-forged dwarven armour promised for Act III.',
      rules: [
        { id: 'milestone', when: 'quest karak-tor', do: 'xp', level: 6 },
      ],
      exits: [{ to: 'brindol', label: 'back down to Brindol' }],
    },
    {
      id: 'starfall', name: 'Starfall Spire', region: 'The crystal mountain', travelHours: 14, level: 6,
      read: 'A tower of crystal and silver rises from a mountain peak, linked to lesser spires by bridges of glass over the clouds. Green mist coils around its crown, and a voice like rustling leaves calls down from above: "Visitors. How... delightful."',
      notes: 'NODE E2 (levels 6-7). Venyx the Whisperer, a young green dragon and Malakor\'s ally, holds Archmage Selari\'s apprentices hostage with three Iron Brand battle-mages. The Third Keystone is in the observatory dome. THREE METHODS: play to the dragon\'s vanity and paranoia by showing intercepted letters proving Malakor means to betray him (DC 15 Deception or Persuasion, advantage with the letters from Thorne\'s strongroom or Morwen\'s orders): Venyx abandons the mages, or turns on them; sneak in through the giant eagle rookery (DC 14 Stealth) to free the hostages; or battle across the glass sky-bridges (a creature knocked prone on a bridge makes a DC 13 Dexterity save or slides off, 6d6 falling damage onto a lower bridge). ' + MILESTONE(7, 23000),
      npcs: [{ name: 'Venyx the Whisperer', who: 'a young green dragon, vain and suspicious', voice: 'silky, amused, every sentence a little trap', wants: 'to be flattered, and never to be anyone\'s pawn' }],
      checks: [
        { skill: 'deception', dc: 15, find: 'Venyx believes Malakor means to betray him, and turns his poison on the mages.' },
        { skill: 'stealth', dc: 14, find: 'Through the eagle rookery to the apprentices\' cell, unseen.' },
      ],
      foes: [
        { monster: 'young-green-dragon', count: 1, name: 'Venyx the Whisperer', note: 'vain and paranoid; can be turned' },
        { monster: 'mage', count: 3, name: 'Iron Brand battle-mage', note: 'guard the hostages' },
      ],
      treasure: 'The Third Runic Keystone. Selari\'s thanks: griffon mounts for Act III, and a Wand of Magic Missiles.',
      rules: [
        { id: 'milestone', when: 'quest starfall', do: 'xp', level: 7 },
      ],
      exits: [{ to: 'brindol', label: 'back down the mountain to Brindol' }],
    },
    {
      id: 'briarwood', name: 'The Briarwood Hag Coven', region: 'Witchwater Bog', travelHours: 10, level: 7,
      read: 'Deep in Witchwater Bog a crooked cottage stands on roots like chicken legs, ringed by thornbushes hung with tiny bones. A cauldron the size of a cart bubbles in the yard, its smoke the colour of old blood, and three old women look up from it, smiling with too many teeth.',
      notes: 'NODE E3 (level 7). Auntie Grief (a night hag) and her two green hag sisters brew the Blood-Ash Elixir that Malakor needs to survive bonding with the Ashen Crown. THREE METHODS: strike a crooked fey bargain with Auntie Grief to taint the elixir (DC 15 Persuasion or Deception; she always asks a price: a memory, a name, a year of life, a favour owed); if they agree, add and complete the quest "Taint the Blood-Ash Elixir." (in Act III Malakor then has disadvantage on saves and loses 50 hit points, and the Crown sears him at the start of his second phase); steal the coven\'s Hag Eye (DC 15 Sleight of Hand or Stealth) to break their shared spellcasting; or ambush them. ' + MILESTONE(8, 34000),
      npcs: [{ name: 'Auntie Grief', who: 'a night hag, eldest of the coven', voice: 'sweet as honey, calls everyone "duckling"', wants: 'a bargain that costs the other party more than they know' }],
      checks: [
        { skill: 'persuasion', dc: 15, find: 'Auntie Grief agrees to taint the elixir, for a price.' },
        { skill: 'sleight-of-hand', dc: 15, find: 'The Hag Eye, a glass eye on a chain, is in your hand: the coven\'s shared magic breaks.' },
        { skill: 'arcana', dc: 14, find: 'The elixir binds a mortal to a dragon\'s soul; tainted, it would burn him from within.' },
      ],
      foes: [
        { monster: 'night-hag', count: 1, name: 'Auntie Grief', note: 'bargains first; fights only if robbed or attacked' },
        { monster: 'green-hag', count: 2, name: 'Coven sister', note: 'Auntie Grief\'s sisters' },
      ],
      treasure: 'The Hag Eye (if stolen). 3 Potions of Healing brewed by the coven (they work... probably). 400 gp in old coins in the cauldron ashes.',
      rules: [
        { id: 'milestone', when: 'quest briarwood', do: 'xp', level: 8 },
      ],
      exits: [{ to: 'brindol', label: 'out of the bog, back to Brindol' }],
    },
    {
      id: 'brindol-gates', name: 'The Battle of Brindol\'s Gates', region: 'Brindol', travelHours: 0, level: 8,
      read: 'Night, fire and drums. Wyverns scream over Brindol\'s walls with riders on their backs, two hill giants batter the great gate with an iron-shod ram, and inside the walls a cry goes up: "The captain of the gate is not the captain!"',
      notes: 'NODE E4 (level 8): Malakor\'s diversionary night assault. Wyvern riders over the walls, hill giants at the gate, doppelganger saboteurs inside. Every ally the party made in Acts I and II arrives to fight beside them: Halia and the Oakhurst militia, Torgga with the +1 weapons, Snikt and his goblins, Clan Ironvein\'s engineers, Selari\'s griffons, Lady Jarmaath\'s knights. Narrate the allies taking on the rest of the army; the party\'s fight is the heroes\' part of the battle. THREE METHODS: hold the gate against the giants; hunt the doppelgangers (DC 14 Insight unmasks one); take the fight to the wyverns from the towers. ' + MILESTONE(9, 48000) + ' Afterwards Lady Jarmaath gives the party command of the march on Cinderhelm: add the quests "Stop Lord Malakor Vane before he takes the Ashen Crown." and "Destroy the Ashen Crown on the Runic Anvil."',
      checks: [{ skill: 'insight', dc: 14, find: 'The captain of the gate blinks wrong: a doppelganger.' }],
      foes: [
        { monster: 'wyvern', count: 2, name: 'Iron Brand wyvern', note: 'ridden by Iron Brand lancers' },
        { monster: 'hill-giant', count: 2, name: 'Hill giant', note: 'battering the gate' },
        { monster: 'doppelganger', count: 3, name: 'Doppelganger saboteur', note: 'disguised as Brindol\'s officers' },
      ],
      treasure: 'The thanks of Brindol: 1,000 gp, and a +1 shield or +1 armour from the Council armoury.',
      rules: [
        { id: 'gates-held', when: 'cleared', do: 'quest', quest: 'gates' },
        { id: 'milestone', when: 'quest gates', do: 'xp', level: 9 },
      ],
      exits: [{ to: 'brindol', label: 'the city' }, { to: 'cinderhelm', label: 'the march north to Cinderhelm Peak' }],
    },
    // ------------------------------------------------------------------ Act III: The crucible
    {
      id: 'cinderhelm', name: 'Cinderhelm Peak', region: 'Cinderhelm', travelHours: 24, level: 9,
      read: 'Mount Cinderhelm smokes against a red sky. The old dwarven citadel is carved into its flank: a causeway of chains spans a chasm to the front gate, a dragon-roost chimney yawns in the caldera above, and far below, forgotten slag-tunnels breathe heat.',
      notes: 'ACT III (levels 9-10). Ask the party which approach they take (their choices in Acts I-II decide what they have): 1) THE ALLIED SIEGE, across the Causeway of Chains with the armies of Brindol and Clan Ironvein (needs those allies: the party fights the Iron Brand veterans at the gate while the army holds the causeway); 2) THE SKY-APPROACH, on Selari\'s griffons through the dragon-roost chimney into the upper spire (needs Starfall saved: the fire elemental guarding the chimney); 3) THE MAGMA-VENT INFILTRATION through the secret dwarven slag-tunnels from Karak-Tor (needs Karak-Tor: DC 15 Stealth for each of three stretches; failure draws the Ash Hounds). Nothing waits here until they choose: then add_monsters for that approach only. The allied siege: veteran, count 4, named "Iron Brand veteran". The sky-approach: fire-elemental, count 1, named "Chimney fire elemental". The magma-vent infiltration: ac-ash-hound, count 2, named "Ash Hound", only if a Stealth check fails. At the end of any approach, the way leads down into the vault of the Ashen Crown.',
      treasure: 'The garrison\'s pay chests: 900 gp, 2 Potions of Greater Healing.',
      exits: [{ to: 'coronation', label: 'down into the vault of the Ashen Crown' }, { to: 'brindol', label: 'back south to Brindol' }],
    },
    {
      id: 'coronation', name: 'The Coronation of Ash', region: 'Cinderhelm', travelHours: 1, level: 10,
      read: 'A circular forge-cathedral hangs over a lake of magma on four colossal iron chains, each wrapped in glowing runes. At its heart stands the great Runic Anvil of Cinderhelm. Before it, in black plate and red scales, Lord Malakor Vane lifts a crown of grey ash toward his brow, and fire swirls around him like a cloak.',
      notes: 'THE FINAL BATTLE (level 10). PHASE 1: Lord Malakor Vane, a half-red dragon warlord with legendary actions, wreathed in a fire shield while any of the four runic suspension chains stands. Each chain is AC 19 with 30 hit points, or a DC 18 Strength check with a tool or a 5th-level spell breaks one: tick the chains clock each time; when it is full the fire shield drops. PHASE 2: when Malakor drops to 0 hit points the Ashen Crown fuses to his brow. Remove him (monster_flees, narrated as the transformation) and add_monsters ac-ash-avatar named "Malakor, Avatar of the Ash-King". If the quest "Taint the Blood-Ash Elixir." is done, the Crown sears him: deal_damage 45 to the Avatar at once and add the stunned condition until the end of its first turn, and from the start Malakor has disadvantage on his saves and 50 fewer hit points (deal_damage 50 to him before the fight). VICTORY: the Crown can only be destroyed by plunging it onto the Runic Anvil and striking it with Torgga\'s warhammer or a 5th-level spell. Ending: the Ash-King\'s soul screams into the magma and Cinderhelm falls silent.',
      npcs: [{ name: 'Lord Malakor Vane', who: 'the half-dragon warlord of the Iron Brand, a fallen knight', voice: 'cold, patient, contemptuous; speaks of destiny', wants: 'the Crown on his brow and the valley at his feet' }],
      foes: [
        { monster: 'ac-malakor', count: 1, name: 'Lord Malakor Vane', note: 'phase 1; fire shield while the chains stand' },
        { monster: 'ac-ash-hound', count: 2, name: 'Ash Hound', note: 'Malakor\'s bodyguards' },
      ],
      clocks: [{ name: 'Runic suspension chains', size: 4, note: 'All four chains are broken: Malakor\'s fire shield drops.' }],
      treasure: 'Malakor\'s Ashbrand greatsword (a +2 greatsword that deals an extra 1d6 fire damage), the Iron Brand\'s war chest (5,000 gp), and the gratitude of the whole Sundermark.',
      exits: [{ to: 'cinderhelm', label: 'back up through the citadel' }],
    },
  ],
  ending: 'With the Ashen Crown shattered on the Runic Anvil, the Ash-King\'s soul is gone for good. Clan Ironvein returns to Cinderhelm, Brindol rebuilds, and in Oakhurst there is a keep with the party\'s banner over the gate.',

  // This adventure's own creatures, written for this project (not from any book).
  monsters: [
    {
      id: 'ac-iron-brand-captain', name: 'Iron Brand Captain', size: 'Medium', type: 'humanoid', sub: 'any race', align: 'lawful evil', ac: 15, acNote: 'studded leather', hp: 22, hd: '4d8', speed: '30 ft.',
      ab: [13, 16, 12, 11, 11, 13], saves: {}, skills: { Athletics: 3, Intimidation: 3 }, vuln: [], res: [], imm: [], cimm: [], senses: 'passive Perception 10', lang: 'Common, Goblin', cr: 1, xp: 200, pb: 2,
      traits: [{ n: 'Cut and Run', d: 'At the end of the second round of combat, or as soon as it drops below half its hit points, the captain flees through the postern gate with whatever it holds, leaving the goblins to hold the bridge.' }],
      actions: [
        { n: 'Multiattack', d: 'The captain makes two scimitar attacks.' },
        { n: 'Scimitar', d: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.', hit: 5, dmg: [['1d6+3', 'slashing']] },
        { n: 'Hand Crossbow', d: 'Ranged Weapon Attack: +5 to hit, range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.', hit: 5, dmg: [['1d6+3', 'piercing']] },
      ],
    },
    {
      id: 'ac-sluice-crawler', name: 'Sluice Crawler', size: 'Large', type: 'monstrosity', sub: '', align: 'unaligned', ac: 13, acNote: 'natural armour', hp: 45, hd: '6d10', speed: '30 ft., climb 30 ft., swim 20 ft.',
      ab: [15, 13, 14, 2, 12, 4], saves: {}, skills: { Perception: 3 }, vuln: [], res: [], imm: [], cimm: [], senses: 'darkvision 60 ft., passive Perception 13', lang: '—', cr: 2, xp: 450, pb: 2,
      traits: [
        { n: 'Amphibious', d: 'The crawler can breathe air and water.' },
        { n: 'Wall Crawler', d: 'The crawler climbs wet stone, beams and ceilings without needing an ability check.' },
        { n: 'Caged', d: 'While its cage is shut the crawler can reach no one. Whoever opens the cage is its first target unless they get clear with a DC 12 Dexterity save.' },
      ],
      actions: [
        { n: 'Multiattack', d: 'The crawler makes two attacks: one with its stinging feelers and one with its bite.' },
        { n: 'Stinging Feelers', d: 'Melee Weapon Attack: +4 to hit, reach 10 ft., one creature. Hit: 4 (1d4 + 2) poison damage, and the target must succeed on a DC 12 Constitution saving throw or be poisoned for 1 minute.', hit: 4, dmg: [['1d4+2', 'poison']] },
        { n: 'Bite', d: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage.', hit: 4, dmg: [['2d4+2', 'piercing']] },
      ],
    },
    {
      id: 'ac-kragg', name: 'Taskmaster Kragg', size: 'Medium', type: 'humanoid', sub: 'goblinoid', align: 'chaotic evil', ac: 17, acNote: 'chain shirt, shield', hp: 65, hd: '10d8', speed: '30 ft.',
      ab: [17, 14, 14, 10, 12, 11], saves: {}, skills: { Intimidation: 4, Stealth: 6 }, vuln: [], res: [], imm: [], cimm: [], senses: 'darkvision 60 ft., passive Perception 11', lang: 'Common, Goblin', cr: 3, xp: 700, pb: 2,
      traits: [
        { n: 'Heavy Hands', d: 'A melee weapon deals one extra die of its damage when Kragg hits with it (included below).' },
        { n: 'Ambusher', d: 'If Kragg surprises a creature and hits it with an attack in the first round of combat, the target takes an extra 7 (2d6) damage.' },
        { n: 'Whip-Crack Command', d: 'As a bonus action, Kragg cracks his chain whip and bellows an order: one goblin within 30 feet that can hear him can use its reaction to make one weapon attack. Goblins that have turned against him ignore it.' },
      ],
      actions: [
        { n: 'Multiattack', d: 'Kragg makes two attacks: two with his morningstar, or one with his morningstar and one with his chain whip.' },
        { n: 'Morningstar', d: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 12 (2d8 + 3) piercing damage.', hit: 5, dmg: [['2d8+3', 'piercing']] },
        { n: 'Chain Whip', d: 'Melee Weapon Attack: +5 to hit, reach 10 ft., one target. Hit: 6 (1d6 + 3) slashing damage, and the target must succeed on a DC 13 Strength saving throw or be knocked prone.', hit: 5, dmg: [['1d6+3', 'slashing']] },
        { n: 'Javelin', d: 'Ranged Weapon Attack: +5 to hit, range 30/120 ft., one target. Hit: 10 (2d6 + 3) piercing damage.', hit: 5, dmg: [['2d6+3', 'piercing']] },
      ],
    },
    {
      id: 'ac-snikt', name: 'Snikt the Goblin Shaman', size: 'Small', type: 'humanoid', sub: 'goblinoid', align: 'neutral', ac: 12, acNote: 'hide scraps', hp: 22, hd: '5d6', speed: '30 ft.',
      ab: [8, 14, 12, 11, 15, 10], saves: {}, skills: { Medicine: 4, Nature: 2 }, vuln: [], res: [], imm: [], cimm: [], senses: 'darkvision 60 ft., passive Perception 12', lang: 'Common, Goblin', cr: 1, xp: 200, pb: 2,
      traits: [
        { n: 'Nimble Escape', d: 'Snikt can take the Disengage or Hide action as a bonus action on each of its turns.' },
        { n: 'Spellcasting', d: 'Snikt is a 3rd-level spellcaster. Its spellcasting ability is Wisdom (spell save DC 12, +4 to hit with spell attacks). Snikt has the following druid spells prepared:\nCantrips (at will): produce flame, shillelagh\n1st level (4 slots): entangle, healing word, thunderwave\n2nd level (2 slots): flaming sphere' },
      ],
      actions: [{ n: 'Bone Staff', d: 'Melee Weapon Attack: +1 to hit, reach 5 ft., one target. Hit: 2 (1d6 - 1) bludgeoning damage.', hit: 1, dmg: [['1d6-1', 'bludgeoning']] }],
    },
    {
      id: 'ac-vorgath', name: 'Vorgath the Earth-Shaker', size: 'Medium', type: 'humanoid', sub: 'dwarf', align: 'lawful evil', ac: 18, acNote: 'scale mail, shield', hp: 97, hd: '13d8', speed: '25 ft.',
      ab: [18, 11, 17, 12, 12, 14], saves: { str: 7, con: 6 }, skills: { Athletics: 7, Intimidation: 5 }, vuln: [], res: ['poison'], imm: [], cimm: [], senses: 'darkvision 120 ft., passive Perception 11', lang: 'Common, Dwarvish, Undercommon', cr: 6, xp: 2300, pb: 3,
      traits: [
        { n: 'Deep-Born Resilience', d: 'Vorgath has advantage on saving throws against poison, spells and illusions, and against being charmed or paralyzed.' },
        { n: 'Sunlight Sensitivity', d: 'While in sunlight, Vorgath has disadvantage on attack rolls and on Wisdom (Perception) checks that rely on sight.' },
        { n: 'Swell (1/Day)', d: 'As a bonus action, Vorgath magically grows to Large size for 1 minute. While enlarged he deals one extra die of damage with his war pick and has advantage on Strength checks and saving throws.' },
      ],
      actions: [
        { n: 'Multiattack', d: 'Vorgath makes two war pick attacks.' },
        { n: 'War Pick', d: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) piercing damage.', hit: 7, dmg: [['1d8+4', 'piercing']] },
        { n: 'Javelin', d: 'Ranged Weapon Attack: +7 to hit, range 30/120 ft., one target. Hit: 7 (1d6 + 4) piercing damage.', hit: 7, dmg: [['1d6+4', 'piercing']] },
        { n: 'Quake Stomp', use: 'Recharge 5-6', d: 'Vorgath stamps and the ground bucks. Each creature within 15 feet of him must make a DC 15 Dexterity saving throw. On a failure a creature takes 13 (3d8) thunder damage and is knocked prone; on a success it takes half as much damage.', dc: ['dex', 15, 'half'], dmg: [['3d8', 'thunder']] },
      ],
    },
    {
      id: 'ac-ash-hound', name: 'Ash Hound', size: 'Medium', type: 'humanoid', sub: 'any race', align: 'neutral evil', ac: 15, acNote: 'studded leather', hp: 58, hd: '9d8', speed: '30 ft.',
      ab: [12, 17, 14, 11, 14, 10], saves: { dex: 6 }, skills: { Perception: 5, Stealth: 6, Survival: 5 }, vuln: [], res: [], imm: [], cimm: [], senses: 'passive Perception 15', lang: 'Common', cr: 4, xp: 1100, pb: 2,
      traits: [
        { n: 'Bounty Scent', d: 'The hound has advantage on Wisdom (Survival) checks to track a creature with a price on its head.' },
        { n: 'Pack Hunter', d: 'The hound has advantage on an attack roll against a creature if at least one of its allies is within 5 feet of that creature and is not incapacitated.' },
      ],
      actions: [
        { n: 'Multiattack', d: 'The hound makes two attacks with its ash-dipped shortswords or its longbow.' },
        { n: 'Ash-Dipped Shortsword', d: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) piercing damage plus 3 (1d6) fire damage.', hit: 6, dmg: [['1d6+3', 'piercing'], ['1d6', 'fire']] },
        { n: 'Longbow', d: 'Ranged Weapon Attack: +6 to hit, range 150/600 ft., one target. Hit: 7 (1d8 + 3) piercing damage.', hit: 6, dmg: [['1d8+3', 'piercing']] },
        { n: 'Choking Ash', use: 'Recharge 5-6', d: 'The hound bursts a pouch of cinders. Each creature within 10 feet of it must succeed on a DC 13 Constitution saving throw or be blinded until the end of its next turn.', dc: ['con', 13, 'none'] },
      ],
    },
    {
      id: 'ac-malakor', name: 'Lord Malakor Vane', size: 'Medium', type: 'humanoid', sub: 'half-dragon', align: 'lawful evil', ac: 19, acNote: 'black plate', hp: 150, hd: '20d8', speed: '30 ft.',
      ab: [20, 12, 18, 14, 13, 18], saves: { str: 9, con: 8, wis: 5, cha: 8 }, skills: { Athletics: 9, Intimidation: 8, Perception: 5 }, vuln: [], res: ['fire'], imm: [], cimm: ['frightened'], senses: 'blindsight 10 ft., darkvision 60 ft., passive Perception 15', lang: 'Common, Draconic', cr: 11, xp: 7200, pb: 4,
      traits: [
        { n: 'Legendary Resistance (2/Day)', d: 'If Malakor fails a saving throw, he can choose to succeed instead.' },
        { n: 'Shield of the Chains', d: 'While any of the four runic suspension chains stands, flame wreathes Malakor: he has resistance to bludgeoning, piercing and slashing damage, and a creature within 5 feet of him that hits him with a melee attack takes 7 (2d6) fire damage.' },
        { n: 'Tainted Elixir', d: 'If the Blood-Ash Elixir was tainted, Malakor has disadvantage on saving throws and starts the fight 50 hit points down.' },
      ],
      actions: [
        { n: 'Multiattack', d: 'Malakor makes three attacks with Ashbrand.' },
        { n: 'Ashbrand', d: 'Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) slashing damage plus 7 (2d6) fire damage.', hit: 9, dmg: [['2d6+5', 'slashing'], ['2d6', 'fire']] },
        { n: 'Heavy Crossbow', d: 'Ranged Weapon Attack: +5 to hit, range 100/400 ft., one target. Hit: 6 (1d10 + 1) piercing damage.', hit: 5, dmg: [['1d10+1', 'piercing']] },
        { n: 'Fire Breath', use: 'Recharge 5-6', d: 'Malakor exhales fire in a 30-foot cone. Each creature in that area must make a DC 16 Dexterity saving throw, taking 35 (10d6) fire damage on a failed save, or half as much damage on a successful one.', dc: ['dex', 16, 'half'], dmg: [['10d6', 'fire']] },
      ],
      reactions: [{ n: 'Parry', d: 'Malakor adds 4 to his AC against one melee attack that would hit him. He must see the attacker and be holding a melee weapon.' }],
      legendary: [
        { n: 'Strike', d: 'Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) slashing damage plus 7 (2d6) fire damage.', hit: 9, dmg: [['2d6+5', 'slashing'], ['2d6', 'fire']] },
        { n: 'Command the Brand', d: 'One Iron Brand ally that Malakor can see moves up to its speed and makes one weapon attack.' },
        { n: 'Ash Wing', use: 'Costs 2 Actions', d: 'Malakor beats wings of grey ash. Each creature within 10 feet of him must succeed on a DC 17 Dexterity saving throw or take 12 (2d6 + 5) bludgeoning damage and be knocked prone.', dc: ['dex', 17, 'none'], dmg: [['2d6+5', 'bludgeoning']] },
      ],
    },
    {
      id: 'ac-ash-avatar', name: 'Malakor, Avatar of the Ash-King', size: 'Large', type: 'dragon', sub: '', align: 'lawful evil', ac: 19, acNote: 'natural armour', hp: 170, hd: '20d10', speed: '40 ft., fly 60 ft.',
      ab: [23, 10, 21, 14, 13, 21], saves: { dex: 5, con: 10, wis: 6, cha: 10 }, skills: { Perception: 6 }, vuln: [], res: [], imm: ['fire'], cimm: ['charmed', 'frightened'], senses: 'blindsight 30 ft., darkvision 120 ft., passive Perception 16', lang: 'Common, Draconic', cr: 13, xp: 10000, pb: 5,
      traits: [
        { n: 'Legendary Resistance (2/Day)', d: 'If the Avatar fails a saving throw, it can choose to succeed instead.' },
        { n: 'The Crown Fuses', d: 'The Avatar is what Malakor becomes when he drops to 0 hit points with the Ashen Crown on his brow. If the Blood-Ash Elixir was tainted, the Crown sears it for 45 fire damage that ignores its immunity, and it is stunned until the end of its first turn.' },
        { n: 'Molten Blood', d: 'A creature within 5 feet of the Avatar that hits it with a melee attack takes 5 (1d10) fire damage.' },
      ],
      actions: [
        { n: 'Multiattack', d: 'The Avatar makes three attacks: one with its bite and two with its claws.' },
        { n: 'Bite', d: 'Melee Weapon Attack: +11 to hit, reach 10 ft., one target. Hit: 17 (2d10 + 6) piercing damage plus 7 (2d6) fire damage.', hit: 11, dmg: [['2d10+6', 'piercing'], ['2d6', 'fire']] },
        { n: 'Claw', d: 'Melee Weapon Attack: +11 to hit, reach 5 ft., one target. Hit: 13 (2d6 + 6) slashing damage.', hit: 11, dmg: [['2d6+6', 'slashing']] },
        { n: 'Breath of the Ash-King', use: 'Recharge 5-6', d: 'The Avatar exhales ash and fire in a 60-foot cone. Each creature in that area must make a DC 18 Dexterity saving throw, taking 56 (16d6) fire damage on a failed save, or half as much damage on a successful one.', dc: ['dex', 18, 'half'], dmg: [['16d6', 'fire']] },
      ],
      legendary: [
        { n: 'Tail', d: 'Melee Weapon Attack: +11 to hit, reach 15 ft., one target. Hit: 15 (2d8 + 6) bludgeoning damage.', hit: 11, dmg: [['2d8+6', 'bludgeoning']] },
        { n: 'Wing Attack', use: 'Costs 2 Actions', d: 'The Avatar beats its wings. Each creature within 10 feet of it must succeed on a DC 19 Dexterity saving throw or take 13 (2d6 + 6) bludgeoning damage and be knocked prone.', dc: ['dex', 19, 'none'], dmg: [['2d6+6', 'bludgeoning']] },
      ],
    },
  ],

  // Ten ready-made Sundermark characters. Each has one of the campaign's three reasons for travelling
  // with the caravan. Builder inputs like engine/pregen.js's; custom backgrounds, so no book is needed.
  pregens: [
    { id: 'bram', role: 'Front line', hook: 'Hired steel', blurb: 'Paid 15 gp by Halia Vance to guard the Last Autumn Supply Caravan. Shield up, sword out, never leaves a wagon behind.',
      input: { name: 'Bram Ostlund', race: 'human', class: 'fighter', alignment: 'Lawful neutral', style: 'defense', skills: ['athletics', 'perception'], background: '', bgName: 'Caravan Guard', bgSkills: ['survival', 'intimidation'], kit: [0, 0, 0, 1], weapons: ['longsword'] } },
    { id: 'hilde', role: 'Healer', hook: 'Heritage', blurb: 'A dwarf priest of Clan Ironvein, Torgga\'s cousin, seeking the lost map to the vault of Karak-Tor.',
      input: { name: 'Hilde Ironvein', race: 'dwarf', subrace: 'hill-dwarf', class: 'cleric', alignment: 'Lawful good', skills: ['medicine', 'history'], background: 'acolyte', kit: [1, 2, 0, 0, 0],
        spells: { cantrips: ['sacred-flame', 'guidance', 'thaumaturgy'], prepared: ['cure-wounds', 'healing-word', 'bless', 'guiding-bolt'] } } },
    { id: 'pell', role: 'Scout', hook: 'Heritage', blurb: 'A Silverrun barge-hand whose family compass was stolen by river raiders. Quick hands, quiet feet, sharp eyes.',
      input: { name: 'Pell Dunnock', race: 'halfling', subrace: 'lightfoot-halfling', class: 'rogue', alignment: 'Chaotic good', skills: ['stealth', 'sleight-of-hand', 'acrobatics', 'perception'], background: '', bgName: 'River-Barge Hand', bgSkills: ['athletics', 'persuasion'], expertise: ['stealth', 'perception'], kit: [0, 0, 0], weapons: ['rapier'] } },
    { id: 'nissa', role: 'Arcane magic', hook: 'Personal letter', blurb: 'A gnome tinker-alchemist and Father Lucan\'s old pupil, answering his frantic letter about the graves.',
      input: { name: 'Nissa Copperkettle', race: 'gnome', subrace: 'rock-gnome', class: 'wizard', alignment: 'Neutral good', skills: ['arcana', 'investigation'], background: '', bgName: 'Tinker-Alchemist', bgSkills: ['history', 'medicine'], kit: [0, 0, 0],
        spells: { cantrips: ['fire-bolt', 'mage-hand', 'light'], known: ['magic-missile', 'sleep', 'shield', 'burning-hands', 'detect-magic', 'mage-armor'], prepared: ['magic-missile', 'sleep', 'shield', 'mage-armor'] } } },
    { id: 'kesh', role: 'Holy warrior', hook: 'Heritage', blurb: 'An oath-sworn dragonborn who hunts the Iron Brand that burned his clan\'s hall and stole its silver relic.',
      input: { name: 'Kesh Varran', race: 'dragonborn', ancestry: 'silver', class: 'paladin', alignment: 'Lawful good', skills: ['athletics', 'persuasion'], background: '', bgName: 'Oath-Sworn Wanderer', bgSkills: ['history', 'survival'], kit: [0, 0, 0, 0], weapons: ['longsword'] } },
    { id: 'sylra', role: 'Archer', hook: 'Hired steel', blurb: 'A Warden of the Whispering Pines hired to scout ahead of the caravan. Never misses, rarely talks.',
      input: { name: 'Sylra Windmere', race: 'elf', subrace: 'high-elf', class: 'ranger', alignment: 'Neutral good', skills: ['perception', 'stealth', 'survival'], background: '', bgName: 'Warden of the Pines', bgSkills: ['nature', 'athletics'], kit: [1, 0, 1], weapons: ['shortsword'],
        spells: { raceCantrip: 'fire-bolt' } } },
    { id: 'corvin', role: 'Talker and support', hook: 'Hired steel', blurb: 'A tiefling minstrel who plays the caravan\'s camp-fires for coin and talks his way into, and out of, everything.',
      input: { name: 'Corvin Lark', race: 'tiefling', class: 'bard', alignment: 'Chaotic good', skills: ['persuasion', 'deception', 'performance'], background: '', bgName: 'Wandering Minstrel', bgSkills: ['insight', 'history'], kit: [0, 1, 0], weapons: ['rapier'],
        spells: { cantrips: ['vicious-mockery', 'minor-illusion'], known: ['healing-word', 'dissonant-whispers', 'charm-person', 'faerie-fire'] } } },
    { id: 'durga', role: 'Big damage', hook: 'Hired steel', blurb: 'A half-orc pit fighter turned caravan muscle. Hits like a falling tree, laughs in the rain.',
      input: { name: 'Durga Stonefist', race: 'half-orc', class: 'barbarian', alignment: 'Chaotic neutral', skills: ['athletics', 'intimidation'], background: '', bgName: 'Pit Fighter', bgSkills: ['survival', 'perception'], kit: [0, 0], weapons: ['greataxe'] } },
    { id: 'tamsin', role: 'Nature magic', hook: 'Personal letter', blurb: 'A half-elf druid of the Greyfen, summoned by Father Lucan: her grandmother\'s grave in the marsh was robbed.',
      input: { name: 'Tamsin Reedwater', race: 'half-elf', class: 'druid', alignment: 'Neutral good', raceChoice: ['wis', 'con'], raceSkills: ['perception', 'stealth'], skills: ['nature', 'medicine'], background: '', bgName: 'Fen Hermit', bgSkills: ['religion', 'survival'], kit: [0, 0, 0], weapons: ['scimitar'],
        spells: { cantrips: ['produce-flame', 'shillelagh'], prepared: ['cure-wounds', 'entangle', 'healing-word', 'thunderwave'] } } },
    { id: 'elias', role: 'Dark pact', hook: 'Heritage', blurb: 'A disgraced scholar with a fiendish patron and an obsession: the legend of the Ashen Crown.',
      input: { name: 'Elias Crowe', race: 'human', class: 'warlock', alignment: 'Neutral', skills: ['arcana', 'investigation'], background: '', bgName: 'Disgraced Scholar', bgSkills: ['history', 'deception'], kit: [0, 0, 0, 0], weapons: ['quarterstaff'],
        spells: { cantrips: ['eldritch-blast', 'chill-touch'], known: ['hellish-rebuke', 'charm-person'] } } },
  ],
};
