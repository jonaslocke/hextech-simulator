# Play-Legality and Alternate-Path Verification

Use when the same card/action may be legal through multiple origins or permissions: hand, Champion Zone, trash, facedown/hidden zones, effect-granted play, alternate costs, Reaction permissions, or future equivalent paths.

## Minimal model dimensions

- player
- card type/characteristics
- play origin
- timing
- permission source
- prohibition/restriction state
- normal versus alternate/additional cost
- affected duration/turn

## High-value properties

- Common prohibitions apply across every play origin unless the restriction contract explicitly scopes an origin out.
- A permission does not bypass a prohibition when the rules say the prohibition wins.
- Origin-specific permission and common play legality remain separate concerns.
- A restriction on Spells does not accidentally block Units/Gear/abilities, and vice versa.
- Turn-scoped restrictions expire at the correct turn boundary, not one action/round/player turn later.
- The restriction follows the intended player identity (for example controller rather than owner) when the source instruction specifies it.
- Projection exposes no action that authoritative legality would reject.

A useful generic regression is: for every supported origin `O`, if `cannotPlay(player, cardType)` is true, `projectPlayable(player, card, O)` is false unless the restriction itself explicitly excludes `O`.
