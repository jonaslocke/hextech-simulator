# Game Board fixture harness

Run the app in development and open `/game-board-harness`. The harness uses
static viewer-safe `GameProjection` fixtures and does not create a match or
connect to MongoDB.

## Scenarios

- `?scenario=empty` — empty Base, Battlefield, Trash, and Banishment zones.
- `?scenario=attachments` — Units, Gear, attached Equipment, Hidden, piles, and
  no Showdown overlay.
- `?scenario=stress` — dense Base and Rune zones, dense Battlefields, mixed
  exhaustion, Hidden, long Battlefield labels, and Showdown.

## Optional parameters

- `runes=0..12`, `runeMode=ready|exhausted|mixed`
- `battlefieldUnits=0..12`
- `hidden=none|owner|opponent|both`
- `baseUnits=0..12`, `baseGear=0..12`, `looseEquipment=0..12`,
  `attachedEquipment=0..12`
- `unitReadiness=ready|exhausted|mixed`,
  `equipmentReadiness=ready|exhausted|mixed`
- `trash=0..40`, `banishment=0..40`

For example, `/game-board-harness?scenario=attachments&runes=12&runeMode=mixed&battlefieldUnits=8&hidden=both`
shows the maximum Rune fan, dense Battlefield contents, and both Hidden cards.

The browser viewport and Action Rail are controlled in the browser during
acceptance checks; they are not fixture query parameters.
