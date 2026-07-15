# OGN M2 Remaining Behavior Portfolio

Snapshot: 2026-07-15

## Current corpus status

This portfolio joins the current OGN source corpus with the approved canonical
catalog. It is planning evidence, not a manual-validation result.

| Measure | Count |
|---|---:|
| Gameplay-distinct non-token OGN definitions | 294 |
| Definitions with an approved canonical model | 94 |
| Definitions still without an approved canonical model | 200 |
| Clauses on the 200-card backlog | 250 |

The corpus analyzer classifies the 200 definitions as 98 `supported`, 12
`requires_engine_support`, 65 `ambiguous`, and 25 `unsupported`. Those are
discovery results only: every card still needs an exact model and the applicable
manual family gate.

## Primary implementation backlog

Every unapproved card is assigned one primary family below, so these counts add
up to the 200-card backlog. Completing a family means its shared contract is
available; it does not automatically approve every listed card.

| Primary family | Cards potentially covered | Clauses | Discovery split (supported / engine / ambiguous / unsupported) | Main remaining work |
|---|---:|---:|---|---|
| Damage, modifiers, and existing verbs | 88 | 103 | 52 / 6 / 15 / 15 | Exact targeting, repeated/global effects, combat values, and parameterized keyword/modifier models. |
| Triggers and Chain continuation | 28 | 33 | 20 / 2 / 5 / 1 | Event-specific timing, source activity, delayed continuation, and turn-memory conditions. |
| Choices and optionality | 27 | 36 | 0 / 1 / 21 / 5 | Modal decisions, optional branches, choose-once tracking, and multi-step choices. |
| Payment and additional costs | 15 | 16 | 12 / 0 / 2 / 1 | Alternative costs, conditional reductions, and intentional resource-source use. |
| Top-deck inspection and zone transfer | 15 | 28 | 4 / 2 / 7 / 2 | Reveal/look groups, ordered transfers, and cross-zone retention/recycling. |
| Movement and combat entry | 11 | 14 | 2 / 0 / 9 / 0 | Swaps, move-with effects, battlefield choices, and Ganking movement. |
| Hidden and private information | 9 | 11 | 7 / 0 / 2 / 0 | Hidden variants, private-card visibility, and facedown interactions. |
| Death, replacements, and prevention | 7 | 9 | 1 / 1 / 4 / 1 | Death replacement ordering, prevention, and combat-result replacement. |

## Shared-contract reach estimates

These are the useful implementation-sized behavior groups. Their card counts
overlap by design: for example, one card can require both a conditional choice
and an on-play trigger. They must not be added together.

| Shared behavior contract | Estimated remaining cards reached | Representative cards | Notes |
|---|---:|---|---|
| Conditions, optional decisions, modes, and per-turn choice memory | 56 | Startipped Peak, Udyr, Wildman, Super Mega Death Rocket! | Largest decision-system extension. Includes `if`, `while`, optional decisions, modes, and "not chosen this turn" state. |
| Combat values and keyword modifiers | 57 | Stand United, Taric, Protector, Spoils of War | Mostly parameterized reuse after exact review; includes Might changes, Shield, Tank, Assault, Deflect, and Mighty. |
| Trigger timing and Chain continuation | 49 | Solari Shieldbearer, Sona, Harmonious, Startipped Peak | Covers on-play, movement, ready, hold/conquer, end-of-turn, and delayed trigger contracts. |
| Payment, additional costs, and resource abilities | 47 | Sun Disc, Treasure Trove, Tasty Faefolk | Covers alternate costs, cost reduction, source exhaustion, Accelerate/Legion interactions, and resource production. Hand of Noxus is already passed and is not included in this remaining-card estimate. |
| Movement, swaps, and combat entry | 27 | Stormbringer, Tideturner, The Syren | Covers move, swap, battlefield selection, and Ganking-related movement. |
| Deck/zone information and transfers | 17 | Twisted Fate, Gambler, Reinforce, Divine Judgment | Covers look, reveal, recycle, Vision, and selected-card zone transitions. Stacked Deck is already passed. |
| Hidden, Temporary, and token creation | 16 | Sprite Call, Teemo, Scout, Viktor, Innovator | Covers remaining Hidden flows plus Sprite/Recruit creation and Temporary lifecycle parameters. |
| Death, delayed effects, replacements, and prevention | 13 | Soaring Scout, Unyielding Spirit, Symbol of the Solari | Covers Deathknell variations, replacements, prevention, and combat tie/excess-damage outcomes. Noxian Guillotine remains awaiting manual validation. |

## Authoritative status ledger

`data/implementation-status/ogn.json` is the authoritative OGN ledger. The
same JSON schema is generated for every locally ingested set:

- `data/implementation-status/ogs.json`
- `data/implementation-status/sfd.json`
- `data/implementation-status/unl.json`

Each ledger row represents one gameplay identity and contains an explicit entry
for every equivalent source-card printing, alongside its code and source ID.
Its status is one of `unreviewed`,
`classified`, `implemented`, `ready_for_manual_validation`,
`manual_family_passed`, or `accepted`; it also retains canonical-model and
family-status history for a future dashboard.

Canonical card publication synchronizes the corresponding set ledger
automatically and promotes that identity to at least `implemented`. After a
manual family result, update the selected cards with
`npm run catalog:update-implementation-status -- OGN manual_family_passed OGN-001,OGN-002 family-id "note"`; the initial historical deck and family
results are seeded by `catalog:seed-implementation-status`. Use
`catalog:check-implementation-status` to confirm that every source-card
identity and printing remains represented.
