// The Director's kit for The First Carve (v3). The scenario file says what is THERE and what
// things cost. This file says how a good Director RUNS it: how each scene opens, who the people
// are and what they want, what is worth finding out and three ways to find it, what failure can
// cost, and how to get a stalled table moving. Nothing here changes a number.
import { GLOSSARY } from './glossary.js';

export const kit = {
  id: 'first-carve',
  title: 'The First Carve',
  levels: 'For two to six new organisms, Level 1',
  runnable: true,
  glossary: GLOSSARY,

  // One paragraph a new player can follow, read at the very start.
  pitch: 'A whale the size of a town has died across a river channel, and everyone wants a piece before it rots. You are a small crew with one day to get in, cut something valuable, get it weighed and stamped so it is legally yours, and get out. Three things are against you: the whale is going bad (CARCASS), the authorities are going to blow it up on a schedule (TOLL), and every hungry thing for miles can smell it (HUNGER). And something inside this whale is not whale.',

  // Each ready-made character in plain words, for the screen where a player chooses one.
  hands: {
    wall: 'The tough one. You stand in front and take the hits so your friends do not. Strong, hard to hurt, slow. Pick this if you like protecting people.',
    ledger: 'The clever one. You make and mend things, patch up the wounded, and know what everything is worth. Pick this if you like solving problems and getting paid.',
    rider: 'The fast one. You move through moving water like nobody else, act first and get out of trouble quickly. Fragile. Pick this if you like daring moves.',
    eyes: 'The sharp one. You notice what others miss, sneak, and smell a lie. Pick this if you like finding things out.',
  },

  // What the adventure is about underneath. The Director steers by these, never says them.
  truths: [
    'The whale did not die by accident. It was herding something into the Reach, and its gut locked around it.',
    'The "something" is a canister of ancient Lattice machinery. It is still running a print job: a brood of not-whales.',
    'Nobody here is a villain. The drones want the brood made legal. The Hegemony team wants its canister back. The brood wants to live.',
  ],

  // Secrets: things worth learning. `must` secrets need three leads in different places.
  secrets: [
    { id: 'legal', must: true, text: 'A cut is worth nothing unless a Tally Post has weighed and stamped it.',
      leads: [{ site: 'toll-vent', how: 'The toll board prints it under the prices.' }, { site: 'soft-field', how: 'The clerk says it before anything else.' }, { site: 'toll-vent', how: 'A skiff crew in the queue is turned away with an unstamped load.' }] },
    { id: 'first-crew', must: true, text: 'A crew came before you. Their claim was voided and they did not come out. The ledger says CLAIM VOID - SEE NETH.',
      leads: [{ site: 'soft-field', how: 'The last entry in the post\'s ledger.' }, { site: 'soft-field', how: 'A tally-sled on the cable, loaded with tools and nothing else.' }, { site: 'render-hall', how: 'Four bodies in the still, wearing harvest gear.' }] },
    { id: 'drones-inward', must: true, text: 'The drones are not guarding the whale from thieves. They are guarding something inside it.',
      leads: [{ site: 'toll-vent', how: 'The customs gate faces inward.' }, { site: 'soft-field', how: 'A drone escort is moving into the whale, not out.' }, { site: 'brood', how: 'Nine-Folds has set up a second customs post at the nursery gate.' }] },
    { id: 'sweet', must: true, text: 'A warm, sweet current runs up from deep in the gut. Dead whales are not warm or sweet.',
      leads: [{ site: 'soft-field', how: 'Anyone who tastes the water notices it.' }, { site: 'render-hall', how: 'One plug in the stomach wall is warm; the current starts there.' }, { site: 'brood', how: 'The nursery is where it comes from.' }] },
    { id: 'stone-where', must: true, text: 'The Gut Stone, the richest thing in the whale, sits in the far curve of the gut past the stomach.',
      leads: [{ site: 'render-hall', how: 'It can be seen from the still.' }, { site: 'render-hall', how: 'Pump-Hand Osk will say where the hose is headed, if helped.' }, { site: 'brood', how: 'Nine-Folds\' forms name it as the "source parcel".' }] },
    { id: 'not-whale', must: true, text: 'The brood are not whale young. Their chemistry matches the warm slag, not the whale. Something printed them.',
      leads: [{ site: 'brood', how: 'A careful smell or taste (the Eyes is best at this).' }, { site: 'brood', how: 'Nine-Folds will say it in exchange for a registration signature.' }, { site: 'gut-stone', how: 'The canister in the stone is still warm and still working.' }] },
    { id: 'charge', must: true, text: 'The Hegemony will fire a Render Charge to destroy the carcass when the TOLL clock fills. It cannot be survived, only outrun.',
      leads: [{ site: 'toll-vent', how: 'The toll board lists a "clearance schedule".' }, { site: 'render-hall', how: 'The pump crew are counting down out loud.' }, { site: 'gut-stone', how: 'The Warden says so, as a courtesy, before anything else.' }] },
    { id: 'serial', must: false, text: 'The canister carries a serial number in a format older than any living lineage. The Hegemony will pay for it to be reported.',
      leads: [{ site: 'gut-stone', how: 'Reading the stone face up close.' }, { site: 'gut-stone', how: 'The Warden asks whether anyone has read it.' }] },
    { id: 'neth', must: false, text: 'Neth is a Guild fixer who voids honest claims and resells them. Tallow Ring sold this whale twice.',
      leads: [{ site: 'soft-field', how: 'The clerk, if pressed or paid.' }, { site: 'toll-vent', how: 'Gossip in the skiff queue.' }] },
  ],

  sites: {
    'toll-vent': {
      start: 'You are third in a queue of skiffs at a wound the size of a town square, and the queue has just stopped: a small folded official has turned to look straight at you.',
      question: 'How does the Cohort get in: pay, promise, talk, sneak or fight?',
      senses: ['the current pulling in through the torn flank', 'a taste of old blood and salt', 'the toll board ticking as prices change', 'bare patches on the wound lip where something has been grazing', 'a low hum under the lip, felt more than heard'],
      people: [
        { id: 'gate-drone', name: 'the gate drone (a Fold Sentinel)', want: 'to see a valid claim before anyone passes', fear: 'being blamed for an unregistered entry', voice: 'Clipped, formal, reads from a form. Never raises its voice.', knows: ['legal', 'charge', 'drones-inward'], trade: 'Accepts a toll, a licence, or a witnessed promise.', wont: 'Will not start a fight. Will not be bribed, but will be persuaded.' },
        { id: 'skiff-crew', name: 'a skiff crew ahead of you', want: 'to get their load stamped and go home', fear: 'the schedule', voice: 'Tired, chatty, bitter about the Guild.', knows: ['legal', 'neth'], trade: 'Gossip for a kind word or a drink.', wont: '' },
      ],
      approaches: [
        { say: 'Pay the toll', ruling: 'No roll. It is printed: Specimens or Substrate per body. TOLL eases.' },
        { say: 'Promise instead of paying', ruling: 'An Oath, witnessed by the drone. No roll to swear it; the cost comes later.' },
        { say: 'Talk their way through', ruling: 'A roll on AFF, ordinary difficulty. Failing costs time or a worse price, never a locked door.' },
        { say: 'Slip past', ruling: 'A roll on DFF with Concealment, hard. Failing means being seen, and the drone asks for the claim in front of everyone.' },
        { say: 'Fight through', ruling: 'It is their choice. Say first that it is loud and the law will notice, then run the Pulse War.' },
      ],
      costs: ['time (the queue grows restless)', 'a worse price', 'being noticed by the drones', 'the swarms come for whoever is wet and bleeding'],
      threats: [{ what: 'the gas pocket under the lip', tell: 'the floor hums; a careful organism can feel it', strike: 'any hard blow sets it off' }, { what: 'the Gnaw Swarms', tell: 'bare grazed patches; a shimmer at the edge of the wound', strike: 'they come for anything thrashing' }],
      leads: ['The drone repeats its question, more slowly, and holds out a form.', 'The skiff behind bumps yours: "Pay it or move."', 'The toll board ticks to a higher price.'],
      moments: { wall: 'Your name is on the manifest: the drone knows it and says so.', ledger: 'You can read the toll board\'s small print faster than anyone.', rider: 'You know the current at this wound: you rode this whale.', eyes: 'You are the first to feel the hum under the lip.' },
    },
    'soft-field': {
      start: 'The cut-lane opens into a hanging forest of pale fat, and somebody has been here: the lanes are marked, a sled waits on its cable, and the scale at the Tally Post is still swinging.',
      question: 'Does the Cohort get a cut, and can they make it legal?',
      senses: ['sheets of fat swaying like curtains', 'a sweet taste in the water that does not belong', 'the creak of the sled cable', 'a glassy shimmer in one panel (the Medusa nest)', 'soft ground that sucks at you'],
      people: [
        { id: 'clerk', name: 'the Tally Post clerk', want: 'a quiet shift and a clean ledger', fear: 'Neth, and being caught between two claims', voice: 'Dry, exact, quotes prices. Warms up if treated as a person.', knows: ['legal', 'first-crew', 'neth'], trade: 'A stamp at the price the post rolls. Gossip costs extra.', wont: 'Will not stamp something that has not been on the scale.' },
      ],
      approaches: [
        { say: 'Cut the far panels and avoid the nest', ruling: 'The harvest rule, as printed. No fight.' },
        { say: 'Drive the Medusa off first', ruling: 'A Pulse War, or a clever trick: clouding the water blinds them.' },
        { say: 'Read the ledger', ruling: 'No roll if the clerk allows it; otherwise OSM or AFF, ordinary.' },
        { say: 'Haggle with the clerk', ruling: 'AFF, ordinary. Failure fixes the price where it is.' },
      ],
      costs: ['the whale goes further off (CARCASS)', 'a spoiled cut, one grade lower', 'the nest wakes', 'a debt to the clerk'],
      threats: [{ what: 'the Glaze Medusa nest', tell: 'a glassy shimmer, and a panel nobody has cut', strike: 'they glaze whoever comes close' }, { what: 'slough patches', tell: 'ground that looks wet and slack', strike: 'it slows and, later, burns' }],
      leads: ['The clerk clears its throat: "Are you cutting or looking?"', 'A drone escort drifts past, heading deeper in.', 'The sweet current gets stronger from the far lane.'],
      moments: { wall: 'Stand between the nest and whoever is cutting.', ledger: 'This is your room: the cut and the price are yours to get right.', rider: 'Cross on the hanging panels where nobody else can.', eyes: 'Spot the nest, and the sled loaded with nothing but tools.' },
    },
    'render-hall': {
      start: 'The stomach is still working. A pump barge is roaring at the near side, nine crew are shouting over it, and as you arrive one of them loses their footing at the edge of the churn.',
      question: 'Can the Cohort cross the stomach, and what do they do about the stranger in the water?',
      senses: ['a pull on your skin from the too-salty water', 'the pump\'s roar, felt in the body', 'a sheen on the haze over the middle of the floor', 'dry ribs along the wall like a walkway', 'one warm spot in a cold room'],
      people: [
        { id: 'osk', name: 'Pump-Hand Osk', want: 'to get out alive and finish the shift', fear: 'the churn', voice: 'Young, loud, swears cheerfully, grateful.', knows: ['stone-where', 'charge'], trade: 'Owes a life: tells everything, lends the pump.', wont: '' },
        { id: 'foreman', name: 'the barge foreman', want: 'the chamber drained on schedule', fear: 'losing a hand on her watch', voice: 'Flat, practical, counts things.', knows: ['charge', 'stone-where'], trade: 'Lets the Cohort use the dry ribs or the pump in return for help.', wont: 'Will not stop the pump for strangers.' },
      ],
      approaches: [
        { say: 'Walk the dry ribs', ruling: 'No roll to walk. Safe from the haze. Slower.' },
        { say: 'Cross through the middle', ruling: 'The haze is a printed hazard. Say the sheen first.' },
        { say: 'Save Osk', ruling: 'The stabilising roll as printed (RTC with Synthesis).' },
        { say: 'Take over or open the pump', ruling: 'Talk the foreman round (AFF) or seize it. Printed prices: loud, but it drains the room.' },
      ],
      costs: ['dragged a band by the churn', 'noise (the hungry things hear it)', 'armour eaten by the haze', 'Osk gets worse'],
      threats: [{ what: 'the Enzyme Field', tell: 'a sheen on the haze over the mid floor', strike: 'it burns whoever enters or fights inside it' }, { what: 'the Bleeders', tell: 'ribbons of red moving against the current', strike: 'they latch on and drink' }, { what: 'the churn', tell: 'loose things spiral toward the middle', strike: 'it drags you a band each Cycle' }],
      leads: ['Osk shouts for help.', 'The foreman points at the ribs: "That way if you want to keep your skin."', 'From the still, something large and pale shows in the far curve: the stone.'],
      moments: { wall: 'Anchor the line that pulls Osk out.', ledger: 'You are the one who can stabilise a dying stranger.', rider: 'The churn is a current, and currents are yours.', eyes: 'See the sheen before anyone steps into it.' },
    },
    brood: {
      start: 'The water turns warm and bright. Hundreds of small blind shapes turn toward you all at once, and a very old drone at a desk made of folded membrane says, without looking up, "Purpose of visit?"',
      question: 'What does the Cohort do about the brood: register it, harvest it, or walk past?',
      senses: ['warmth, like a hand held near', 'sweetness thick enough to taste', 'the feeling of being asked questions', 'six fins where there should be four', 'the scratch of a stylus on a form'],
      people: [
        { id: 'nine-folds', name: 'Nine-Folds, the drone elder', want: 'the brood registered as persons before the schedule runs out', fear: 'that they will be rendered as salvage', voice: 'Ancient, patient, bureaucratic, quietly desperate. Speaks in form numbers, then stops and speaks plainly.', knows: ['not-whale', 'drones-inward', 'stone-where', 'charge'], trade: 'Tells the truth for a signature. Offers a Name and the drones\' goodwill.', wont: 'Will not threaten. Will not lie on a form.' },
        { id: 'brood-voice', name: 'the brood (through a Receptor Lurker)', want: 'to be let live', fear: 'everything', voice: 'Repeats your own words back as questions.', knows: ['sweet'], trade: 'Nothing to trade but trust.', wont: 'Will not fight unless startled.' },
      ],
      approaches: [
        { say: 'Talk to Nine-Folds', ruling: 'Three exchanges. Say what success buys before the first roll.' },
        { say: 'Sign as witness', ruling: 'No roll. It is a choice with a printed reward, and it binds.' },
        { say: 'Harvest the brood', ruling: 'It is allowed and it pays well. Say the price plainly first: the Clocks move and the drones remember.' },
        { say: 'Work out what they are', ruling: 'OSM with Chemoreception, ordinary. On a failure they still learn it, from Nine-Folds, at a price.' },
      ],
      costs: ['the brood startles', 'Nine-Folds closes the desk', 'time on the schedule', 'a promise asked for in return'],
      threats: [{ what: 'a startled brood', tell: 'the shapes bunch and the sweetness sours', strike: 'the Lurkers and the shoal defend the nursery' }],
      leads: ['Nine-Folds slides a form across the desk and waits.', 'One juvenile bumps gently against the nearest organism.', 'A distant thud from above: the pump crew have started the count.'],
      moments: { wall: 'An escort\'s signature carries weight: yours is the name Nine-Folds wants.', ledger: 'You know exactly what this brood is worth, both ways.', rider: 'You saw the whale herd something. Now you know what.', eyes: 'You can smell that they are not whale.' },
    },
    'gut-stone': {
      start: 'The duct opens on a boulder of fused slag as big as a house, warm, humming, ringed with broken glass. On the far side a Hegemony officer in heavy plate raises one hand, politely, and says: "That is ours. You have until the charge."',
      question: 'Who leaves with what, and does everyone get out before the charge?',
      senses: ['heat off the stone face', 'a sting in the water near the stone', 'shards chiming against each other in the current', 'a hum with a rhythm, like something working', 'one shaft of cold water from above: the way out'],
      people: [
        { id: 'warden', name: 'the Protease Warden', want: 'the canister recovered intact and reported', fear: 'losing it to scavengers, or to the charge', voice: 'Courteous, tired, absolutely certain. Gives one warning.', knows: ['charge', 'serial', 'not-whale'], trade: 'Pays for the serial to be reported. Lets the Cohort leave with ordinary cuts.', wont: 'Will not give up the canister.' },
        { id: 'guardian', name: 'the Lattice Guardian (in the stone)', want: 'the print job finished', fear: 'interruption', voice: 'Does not speak. Answers yes or no by warming or cooling the water.', knows: ['not-whale', 'serial'], trade: 'Goes quiet if convinced the job is complete.', wont: 'Cannot leave the stone.' },
      ],
      approaches: [
        { say: 'Deal with the Warden', ruling: 'AFF, hard, easier if the Cohort has the brood\'s registration or the serial.' },
        { say: 'Read the stone', ruling: 'OSM or RTC, ordinary, but it means standing in the sting.' },
        { say: 'Take the canister', ruling: 'Say it out loud first: this is a deadly fight. Then it is their choice.' },
        { say: 'Run for the shaft', ruling: 'The chase rule as printed.' },
      ],
      costs: ['cut by the shards', 'the Warden\'s patience', 'a segment of the schedule', 'the stone stings whoever is touching it'],
      threats: [{ what: 'the Warden\'s team', tell: 'the Warden marks whoever comes closest, and says so', strike: 'everything it has goes at the marked one' }, { what: 'the Render Charge', tell: 'a count, heard through the walls, getting shorter', strike: 'the carcass ends; it is outrun, never survived' }],
      leads: ['The Warden says the count out loud.', 'The stone warms, and something inside it turns over.', 'Cold water from the shaft: the way out is still open.'],
      moments: { wall: 'Hold the shaft mouth while the others go up.', ledger: 'Name the price of the serial to the Warden\'s face.', rider: 'The race up the shaft is yours to lead.', eyes: 'Read the serial. This is what you were paid to bring back.' },
    },
  },

  // Ways the night can end, and what each leaves for next time.
  hooks: [
    'If the brood was registered: three hundred new citizens owe the Cohort a Name, and somebody will want that undone.',
    'If the serial was reported: a Hegemony office now knows the Cohort by sight.',
    'If Neth was crossed: the Guild has a file.',
    'Whoever paid the Eyes in advance is waiting in Tallow Ring.',
  ],
};
