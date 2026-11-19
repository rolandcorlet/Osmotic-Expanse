// The Lantern of Thornwick Ford: a starter adventure for four to five characters of 1st level,
// written for this project. Every monster is from the SRD 5.1. The party should reach 2nd level
// at the watchtower and 3rd before the sanctum (the milestones below say when).

export default {
  id: 'lantern',
  name: 'The Lantern of Thornwick Ford',
  levels: '1 to 3',
  blurb: 'Fog has crept up from the Greyfen and people are vanishing into it. The old lantern that kept the marsh at bay has been stolen, and someone in the drowned chapel wants it lit for a darker purpose.',
  intro: 'Rain drums on the roof of the Ford Inn at Thornwick Ford, a village of forty roofs where the north road crosses the river Wend. Tonight the common room is crowded and quiet. For three nights a grey fog has rolled up from the Greyfen marsh, and on each of those nights someone has walked into it and not come back. The great brass lantern that has hung above the ford for a hundred years, the one the old folk swear keeps the marsh-lights away, is gone from its hook.',
  quests: ['Find out who stole the Lantern of the Ford and bring it home.', 'Find the people who vanished into the fog.'],
  sites: [
    {
      id: 'thornwick', name: 'The Ford Inn, Thornwick Ford', region: 'Thornwick Ford',
      read: 'A low, smoky common room with a fire at one end and a long bar at the other. Farmers sit close together, talking in whispers. Through the shutters you can see the empty iron hook above the ford where the lantern used to hang, and beyond it the grey wall of fog lying along the river.',
      notes: 'Start here. Let the characters meet each other and the village. Reeve Tobias Wren offers 25 gp to each character to bring back the lantern, and 25 more each if they find the missing. Old Bren the lamplighter was knocked down when the lantern was taken two nights ago: he saw "little green devils with a big furry brute" carrying it up the Mill Road toward the old watchtower. Marta Hale\'s daughter Nell is one of the missing (taken on the road, not by the fog). The fog itself is the work of the Pale Brother in the drowned chapel; it thins whenever the lantern is near.',
      npcs: [
        { name: 'Reeve Tobias Wren', who: 'the village headman, tired and frightened', voice: 'clipped and formal, keeps rubbing his spectacles', wants: 'the lantern back before the village panics' },
        { name: 'Marta Hale', who: 'the innkeeper', voice: 'warm, blunt, voice cracks when she speaks of Nell', wants: 'her daughter Nell home' },
        { name: 'Old Bren', who: 'the lamplighter, bruised and bandaged', voice: 'slow, superstitious, full of old sayings', wants: 'the lantern lit again; he knows the fog fears its flame' },
      ],
      checks: [
        { skill: 'insight', dc: 10, find: 'The Reeve is hiding that he can afford more: he will go to 40 gp each if pressed.' },
        { skill: 'history', dc: 12, find: 'The lantern was blessed by a priest of the old river god a century ago, and the drowned chapel in the marsh was that god\'s shrine before the river changed course and flooded it.' },
        { skill: 'investigation', dc: 12, find: 'Small muddy bare footprints and one set of huge clawed ones lead from the lantern post up the Mill Road.' },
      ],
      treasure: 'Marta gives the party a healing potion (potion of healing) "for Nell, if she is hurt".',
      exits: [{ to: 'mill-road', label: 'the Mill Road north, toward the hills and the old watchtower' }, { to: 'causeway', label: 'the causeway path south-east into the Greyfen' }],
    },
    {
      id: 'mill-road', name: 'The Mill Road', region: 'The hills', travelHours: 2,
      read: 'The road climbs between hedges and dripping beech trees. The ruined mill sits silent beside a dry leat. Ahead, on a crag, you can just make out the broken crown of the old watchtower against the grey sky.',
      notes: 'Three goblin scouts hide in the mill, watching the road for anyone following. With a Perception check (DC 12, or their passive Perception) the party spots them first; otherwise the goblins get surprise. They flee to the watchtower if two of them fall. A captured goblin (named Snik) will trade what it knows for its life: Grisk the bugbear took the lantern because "the pale man in the marsh pays silver for it", and "the girl" is kept in the tower.',
      foes: [{ monster: 'goblin', count: 3, name: 'Goblin scout', note: 'hiding in the mill' }],
      checks: [
        { skill: 'perception', dc: 12, find: 'A glint of a blade in the mill window: something is watching the road.' },
        { skill: 'survival', dc: 10, find: 'A girl\'s shoe in the ditch, and drag marks heading up toward the tower.' },
      ],
      treasure: 'The goblins carry 9 sp and a crude map scratched on bark showing the tower and a path down to "the wet church".',
      exits: [{ to: 'thornwick', label: 'back down to Thornwick Ford' }, { to: 'tower-gate', label: 'up the switchback path to the watchtower' }],
    },
    {
      id: 'tower-gate', name: 'The Tumbledown Gate', region: 'The old watchtower', travelHours: 1,
      read: 'The watchtower\'s outer wall has fallen in places, leaving a gate arch with no gate. A cookfire smokes in the yard behind it. Two goblins squat on the wall above the arch, arguing over a bone.',
      notes: 'Two goblin sentries. If the party approaches openly they shout a warning and Grisk inside is ready (no surprise for anyone in the tower). A group Stealth check (DC 11 for each character against their passive Perception of 9) lets the party take the sentries by surprise. The broken wall on the east side can be climbed (Athletics DC 12) to reach the tower door without passing the arch.',
      foes: [{ monster: 'goblin', count: 2, name: 'Goblin sentry', note: 'on the wall above the arch' }],
      checks: [
        { skill: 'stealth', dc: 11, find: 'The sentries never see you coming.' },
        { skill: 'athletics', dc: 12, find: 'You climb the east wall and reach the tower door unseen.' },
      ],
      exits: [{ to: 'mill-road', label: 'back down the switchback path' }, { to: 'watchtower', label: 'into the tower itself' }],
    },
    {
      id: 'watchtower', name: 'The Old Watchtower', region: 'The old watchtower',
      read: 'Inside, the tower is one tall room open to the sky, its floors long rotted away. A huge, shaggy figure with a morning star sits on a throne made of a cart seat. Behind him, chained to a ring in the wall, a young woman looks up at you. Beside her, wrapped in sacking, something brass catches the firelight.',
      notes: 'Grisk the bugbear and one goblin. Grisk fights to the death unless reduced below half his hit points with the goblin already down: then he offers to "sell" the lantern and the girl and flee. Nell Hale (a commoner) is chained (the key is on Grisk). The lantern is here, unlit. Lighting it (any fire, an action) makes a warm golden light in a 30-foot radius; the fog never enters that light, and undead in it have disadvantage on attack rolls. Milestone: when Nell is freed and the lantern recovered, award 300 XP to each character (they reach 2nd level). A letter on the throne, written in a careful hand, reads: "Bring the lamp to the chapel on the third night. The Brother pays in silver and in mercy. -- A."',
      foes: [{ monster: 'bugbear', count: 1, name: 'Grisk', note: 'the bugbear chief, on his cart-seat throne' }, { monster: 'goblin', count: 1, name: 'Goblin guard' }],
      npcs: [{ name: 'Nell Hale', who: 'the innkeeper\'s daughter, chained to the wall', voice: 'scared but sharp; she listened to everything', wants: 'to go home; she heard Grisk say the "pale brother" wants the lantern to "wake the drowned"' }],
      checks: [{ skill: 'investigation', dc: 10, find: 'A loose stone behind the throne hides Grisk\'s hoard.' }],
      treasure: 'Grisk\'s hoard: 35 gp, a silver locket (10 gp), and a potion of healing. The Lantern of the Ford.',
      exits: [{ to: 'tower-gate', label: 'out to the yard' }, { to: 'causeway', label: 'the goat path down the far side of the crag to the Greyfen (the goblins\' route to the chapel)' }],
    },
    {
      id: 'causeway', name: 'The Greyfen Causeway', region: 'The Greyfen marsh', travelHours: 2,
      read: 'An old stone causeway runs out into the marsh, half sunk, its slabs slick with weed. The fog is thick here. Somewhere off to the side water drips and something splashes. Small pale lights bob far out over the reeds and vanish when you look straight at them.',
      notes: 'The fog makes the area lightly obscured. Without the lit lantern, each character must make a Wisdom (Survival) check (DC 13) or the party wanders for an hour and gains nothing but wet boots; on a second failure each character gains a level of exhaustion from cold. With the lantern lit, the causeway is plain to follow. Four giant rats nest in a sunken boat beside the causeway and attack anyone who comes within 10 feet.',
      foes: [{ monster: 'giant-rat', count: 4, name: 'Giant rat', note: 'nest in a sunken boat beside the path' }],
      checks: [
        { skill: 'survival', dc: 13, find: 'You keep to the causeway through the fog.' },
        { skill: 'perception', dc: 13, find: 'The pale lights move together, like lanterns carried by people walking very slowly toward the chapel.' },
      ],
      exits: [{ to: 'thornwick', label: 'back along the causeway to Thornwick Ford' }, { to: 'chapel', label: 'onward to the drowned chapel, a dark shape in the fog' }],
    },
    {
      id: 'chapel', name: 'The Drowned Chapel', region: 'The Greyfen marsh', travelHours: 1,
      read: 'A stone chapel stands knee-deep in black water, its roof half gone, its bell tower leaning. Inside, the pews float. Three figures stand in the water between them, swaying, heads bowed: villagers, grey-skinned, eyes white. A stair at the back leads down into darkness.',
      notes: 'Three of the missing villagers are now zombies (they cannot be saved; their names are Hob, Wenna and old Pell). The water is difficult terrain. A character who looks closely (Medicine DC 10) sees that these were drowned, not killed. The stair leads down to the crypt. Milestone: when the party clears the chapel, award 150 XP each.',
      foes: [{ monster: 'zombie', count: 3, name: 'Drowned villager', note: 'swaying among the floating pews' }],
      checks: [
        { skill: 'medicine', dc: 10, find: 'They were drowned, then raised: their lungs are full of marsh water.' },
        { skill: 'religion', dc: 12, find: 'The altar\'s symbol, a wave over an open eye, belongs to the old river god. Someone has painted over it with a pale hand.' },
      ],
      exits: [{ to: 'causeway', label: 'back out onto the causeway' }, { to: 'crypt', label: 'down the stair into the crypt' }],
    },
    {
      id: 'crypt', name: 'The Flooded Crypt', region: 'Under the drowned chapel',
      read: 'The stair ends in a long vault. Water stands ankle-deep on the floor, and the walls are lined with stone niches, each holding a shrouded shape. Candle stubs burn in some niches. At the far end a rusted iron door stands ajar, and from beyond it comes a low chanting voice.',
      notes: 'A trap: halfway along the vault a flagstone is loose over a 10-foot pit full of water (Perception DC 13 to notice; Dexterity saving throw DC 12 to catch the edge, or fall in, take 1d6 bludgeoning damage and be grappled by weed until a DC 10 Athletics check). Two skeletons rise from the niches when anyone reaches the iron door. Behind a niche (Investigation DC 13) lies a chest with the chapel\'s old treasure.',
      foes: [{ monster: 'skeleton', count: 2, name: 'Crypt skeleton', note: 'lying in the niches nearest the iron door' }],
      checks: [
        { skill: 'perception', dc: 13, find: 'One flagstone sits a finger-width proud of the rest, and the water ripples over it differently.' },
        { skill: 'investigation', dc: 13, find: 'A niche with no body has a false back: behind it is a small iron chest.' },
      ],
      treasure: 'The chest: 60 gp, a silver holy symbol of the river god (25 gp) and a spell scroll of cure wounds (use the potion-of-healing rules if you prefer: it restores 2d4+2).',
      exits: [{ to: 'chapel', label: 'back up the stair' }, { to: 'sanctum', label: 'through the iron door toward the chanting' }],
    },
    {
      id: 'sanctum', name: 'The Pale Brother\'s Sanctum', region: 'Under the drowned chapel',
      read: 'A round chamber, dry, lit by green candles. In the centre a pool of still black water reflects nothing. Before it kneels a gaunt man in a grey robe painted with white hands, chanting. Two skeletons stand guard behind him, and along the walls, bound and gagged, are the last of the missing villagers. He stops, rises, and smiles at you without warmth. "You brought it," he says, looking at the lantern. "Good. The drowned have waited a long time for the light."',
      notes: 'Brother Aldane, the Pale Brother (a cult fanatic), with two skeletons. He wants the lantern: lit over the pool by his hand, its flame would raise every body ever drowned in the Greyfen. He will bargain ("give me the lantern and your friends walk free") and lie. He fights from behind the skeletons, opening with hold person on the strongest-looking character and then spiritual weapon. If brought below 10 hit points he tries to leap into the pool, which is only 6 feet deep. Freeing the four villagers (Cobb the miller, Ada, Jory and Tam) ends the fog for good once the lantern is lit and rehung over the ford. Milestone: award 300 XP each for defeating him and freeing the villagers. The party should be 3rd level by now; if they are still 2nd, leave out one skeleton.',
      foes: [{ monster: 'cult-fanatic', count: 1, name: 'Brother Aldane', note: 'the Pale Brother, kneeling by the pool' }, { monster: 'skeleton', count: 2, name: 'Sanctum skeleton' }],
      npcs: [{ name: 'Brother Aldane', who: 'the Pale Brother, a cult fanatic of a nameless drowned power', voice: 'soft, patient, never raises his voice, calls everyone "child"', wants: 'the lantern lit over his pool to raise the drowned dead' }],
      checks: [{ skill: 'arcana', dc: 13, find: 'The pool is a gate for necromantic power, sealed only while the lantern burns over running water.' }],
      treasure: 'Aldane carries 22 gp, a dagger, and a journal naming the "A." of the letter (himself) and hinting at others of his order. A ring of keys frees the villagers.',
      exits: [{ to: 'crypt', label: 'back through the iron door' }, { to: 'thornwick', label: 'the long walk home with the lantern, to rehang it over the ford (the ending)' }],
    },
  ],
  ending: 'When the lantern is lit and hung again over the ford, the fog drains back into the marsh and does not return. The village throws a feast; Reeve Wren pays what he promised; Marta Hale never charges the party for a room again. Brother Aldane\'s journal hints that his order has other pools in other marshes, a thread for the next adventure.',
};
