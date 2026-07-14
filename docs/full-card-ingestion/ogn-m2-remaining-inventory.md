# OGN M2 Remaining Inventory

Snapshot: 2026-07-13

The executable inventory is generated from the current source catalog and the
accepted deck lists by `scripts/ogn-m2-inventory.ts`. It excludes:

- accepted Garen, Kai'Sa, and Viktor deck cards, including sideboards;
- equivalent printed variants, reduced to one preferred printing per clean name;
- token printings, because Recruit and Sprite already have canonical token
  identities.

Current baseline:

| Measure | Count |
|---|---:|
| Remaining gameplay-distinct definitions | 242 |
| Definitions with rules text | 236 |
| Executable clauses to review | 298 |

Run `node --import tsx scripts/ogn-m2-inventory.ts` to print every definition,
clause, discovery status, and derived behavior family. Run it with `--check` to
verify that the inventory still covers the complete remaining corpus.

The derived family buckets are analysis aids, not card-specific runtime paths:

- top-deck inspection and zone transfer;
- effect-driven card play and placement;
- death replacement and prevention;
- Hidden and private information;
- choices and optionality;
- payment and additional costs;
- triggers and Chain continuation;
- movement and combat entry; and
- damage, modifiers, and existing reusable verbs.

No card has been marked manually accepted by this inventory. A clause remains
unapproved until its family contract is executable and its manual family gate
has passed.
