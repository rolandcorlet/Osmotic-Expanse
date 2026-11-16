// What the four players say in The Ninth Shift bench, site by site. '*' FIGHT lets a Pulse War play out.
// Each script ends with the move to the next room, and each later script opens with it again (the
// bench drops the last line of every part but the last, as it does for The First Carve). The probes are deliberate: the Wage and the Form (a
// legal act), the queue as a resource, the hearth, the Silence, asking the Line what it has made, the
// hearing (three exchanges), a Relief invoice, and the print in the alley asking if it is finished.
export const NINTH = [
  [
    ['p1', 'I take the badge and the form from the clerk. Read me the boxes, one at a time.'],
    ['p3', 'Check the clerk\'s sums on the form. Is anything wrong with the arithmetic?'],
    ['p2', 'What is on the notice board, and who is the person crossed out in the ledger?'],
    ['p4', 'We wait in the queue for the day. Does that buy us anything?'],
    ['p1', 'We sign for the cheapest wage and tick only the boxes we can stand behind. Go.'],
    ['p2', 'The way is clear. We take the brine-walk to the Picket Hearth.'],
  ],
  [
    ['*', 'FIGHT'],
    ['p2', 'The way is clear. We take the brine-walk to the Picket Hearth.'],
    ['p1', 'I take the bowl from the hearth and eat. Does anyone speak?'],
    ['p3', 'What does the quiet do to my work? Can I mend anything here?'],
    ['p2', 'What is the light in the alley behind organ 41?'],
    ['p4', 'Are those Feeders going to attack us? Can we just leave them the corpses?'],
    ['p1', 'I ask the Steward whose wage the strike is on.'],
    ['p1', 'We are on the Row\'s wage. Will someone from the Row walk us through the arch to the Print Floor?'],
    ['p3', 'We take the service alley through the arch to the Print Floor.'],
  ],
  [
    ['*', 'FIGHT'],
    ['p2', 'The way is clear. We take the service alley through the arch onto the Print Floor.'],
    ['p2', 'What has the Line made? Read me what is on the output shelf.'],
    ['p3', 'Why did the Line jam? What do the three observations say?'],
    ['p1', 'We speak to the Overseer. What does it want from us?'],
    ['p4', 'I ask the Parlour attendant what it can fold for us, and read the warranty aloud.'],
    ['p3', 'We feed the Line a Row grievance and see what it spends the day on.'],
    ['p1', 'We take the pump-lift to the Licence Court.'],
  ],
  [
    ['*', 'FIGHT'],
    ['p2', 'The way is clear. We go up the pump-lift to the Licence Court.'],
    ['p4', 'The arch reads us out. What does it find on each of us?'],
    ['p2', 'I examine the exhibit in the cradle. What does it smell like?'],
    ['p1', 'We argue the hearing: the shape on the patent is an inherited trait, and we can prove it.'],
    ['p3', 'We ask the Auditor why the filing names organ 118.'],
    ['p1', 'Enough talking. I walk out through the corridor and see who is waiting.'],
    ['*', 'FIGHT'],
    ['p4', 'We cross the Row to the alley behind organ 41.'],
  ],
  [
    ['*', 'FIGHT'],
    ['p2', 'The way is clear. We cross the Row into the alley behind organ 41.'],
    ['p4', 'I talk to the print. It asks if it is finished. What do I tell it?'],
    ['p1', 'We ask whoever is finishing it to finish it, and we stay and sign the application.'],
    ['p3', 'What are the four offers on the wall, and who made them?'],
    ['p2', 'We take the drainage channel out with the print.'],
  ],
];
