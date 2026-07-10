# Full Card Ingestion Tracking

Snapshot: 2026-07-09T23:52:11-03:00

This file is the active M0 tracking baseline for the full-card ingestion program.
It follows `docs/full-card-ingestion/plan.md` and keeps M0 documentation-only:
no runtime APIs, schemas, selectors, catalog data, or database records are
changed in this milestone.

## Milestone Status Ledger

| Milestone | Scope | Status | Current blocker | Next action | User acceptance |
|---|---|---|---|---|---|
| M0 | Operating model and tracking baseline | Accepted | None | Open M1 | Accepted |
| M1 | Garen Proving Grounds deck | Not started | `data/decks/garen.dec.txt` needs fixture normalization before parsing | Normalize fixture and build primitive delta | Pending |
| M2 | Origins full set | Not started | Need two user-provided Origins decks under `docs/full-ingestion-decks/OGN/` | Wait for inputs after M1 acceptance | Pending |
| M3 | Spiritforged full set | Not started | Need two user-provided Spiritforged decks under `docs/full-ingestion-decks/SFD/` | Wait for inputs after M2 acceptance | Pending |
| M4 | Unleashed full set | Not started | Need two user-provided Unleashed decks under `docs/full-ingestion-decks/UNL/` | Wait for inputs after M3 acceptance | Pending |
| M5 | Vendetta full set | Not started | Final `VEN` JSON is not present in `data/sets`; need two user-provided Vendetta decks | Wait for final data after M4 acceptance | Pending |

## Source Data Baseline

| Source | M0 observation | Notes |
|---|---|---|
| `data/sets/ogs.json` | Present, 24 cards, 0 printed tokens | Includes Garen Proving Grounds cards. |
| `data/sets/ogn.json` | Present, 352 cards, 4 printed tokens | Includes Recruit token variants required by Garen cards. |
| `data/sets/sfd.json` | Present, 280 cards, 1 printed token | Full-set milestone input exists; validation decks not present. |
| `data/sets/unl.json` | Present, 280 cards, 0 printed tokens | Full-set milestone input exists; validation decks not present. |
| `data/sets/ven.json` | Not present | M5 must not start until final JSON is provided. |
| `docs/full-ingestion-decks/` | Not present | Full-set validation decks are not yet provided. |
| `data/decks/garen.dec.txt` | Present, not parser-ready | Uses `Main Deck:` instead of `MainDeck:` and has an uncounted legend entry. |

## Primitive Behavior Coverage Ledger

Existing runtime coverage is read from `src/server/game/runtime-coverage.ts`.

| Primitive / mechanic | First seen in | Cards using it | Rule status | Runtime status | Tests | Manual scenario | Blocker |
|---|---|---:|---|---|---|---|---|
| `ability.exhaust_for_resource` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Activate rune/resource ability | None |
| `ability.recycle_for_power` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Recycle rune for Power | None |
| `timing.action` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Play Action during showdown | None |
| `timing.reaction` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Play Reaction before resolution | None |
| `timing.delayed` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Resolve delayed effect | None |
| `trigger.on_play` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Trigger after card is played | None |
| `trigger.conquer_battlefield` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Conquer battlefield trigger | None |
| `trigger.hold_battlefield` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Hold battlefield trigger | None |
| `trigger.on_move` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Move-triggered ability | None |
| `trigger.end_of_turn` | Existing | TBD | Covered by rules reference | Existing executable | Existing | End-turn trigger | None |
| `trigger.attack` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Attack trigger | None |
| `trigger.defend` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Defend trigger | None |
| `condition.compare_numeric_value` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Numeric threshold condition | None |
| `condition.effect_killed_target` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Damage kills target condition | None |
| `selector.unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select legal unit | None |
| `selector.friendly_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select friendly unit | None |
| `selector.enemy_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select enemy unit | None |
| `selector.card` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select card from non-board zone | None |
| `selector.battlefield` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select battlefield | None |
| `action.draw_cards` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Draw cards | None |
| `action.vision` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Resolve Vision choice | None |
| `action.discard_cards` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Discard chosen cards | None |
| `action.ready_cards` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Ready exhausted runes/cards | None |
| `action.channel_runes` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Channel runes | None |
| `action.deal_damage` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Deal damage to unit | None |
| `action.draw_by_optional_cost` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Optional-cost draw branch | None |
| `action.channel_or_draw` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Channel fallback draw | None |
| `action.fight` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Two units fight | None |
| `action.kill_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Kill selected unit | None |
| `action.return_to_hand` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Return selected card to hand | None |
| `action.move_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Move unit to base | None |
| `modifier.modify_numeric_value` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Apply numeric modifier | None |
| `modifier.play_unit_destination` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Play unit to extra destination | None |
| `modifier.enter_ready` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Enter ready | None |
| `keyword.vision` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Vision keyword | None |
| `keyword.assault` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Assault combat Might | None |
| `keyword.shield` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Shield combat Might | None |
| `keyword.tank` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Tank combat damage assignment | None |
| `keyword.deflect` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Deflect targeting cost | None |
| `keyword.ganking` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Battlefield-to-battlefield movement | None |
| `cost.exhaust_selected_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Exhaust selected unit as cost | None |
| `replacement.recall_on_next_death` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Recall instead of next death | None |

## Card Coverage Ledger

| Set | Card code | Name | Type | Behavior clauses | Primitive coverage | Executable | In deck validation | Notes |
|---|---|---|---|---:|---|---|---|---|
| MVP | Existing canonical scope | Lux, Annie, Master Yi playable deck cards | Mixed | TBD | Existing approved primitives | Yes | Existing selectable decks | M0 baseline only; detailed card ledger starts in M1. |
| OGS/OGN | TBD | Garen deck cards | Mixed | TBD | Primitive delta required | No | Garen not selectable | M1 scope after M0 acceptance. |

## Token Coverage Ledger

| Set | Token name | Source card(s) | Token data present | Behavior executable | Blocker | Notes |
|---|---|---|---|---|---|---|
| OGN | Recruit token variants | Garen M1 token creators, broader Origins cards | Yes | Not validated for M1 | None for M0 | `Recruit (DE)`, `Recruit (NX)`, and `Recruit (ZN)` exist in `data/sets/ogn.json`; M1 must normalize to one gameplay token identity. |
| OGN | Sprite | Later Origins cards | Yes | Not reviewed | None for M0 | Full Origins milestone coverage item. |
| SFD | Gold | Later Spiritforged cards | Yes | Not reviewed | None for M0 | Full Spiritforged milestone coverage item. |

## Deck Validation Ledger

| Set | Deck file | Deck ID | Catalog valid | Permanent selector exposure | Match loads | Full match completed | Issues found | Accepted |
|---|---|---|---|---|---|---|---|---|
| MVP | `data/decks/lux.dec.txt` | `lux` | Yes | Yes | Existing baseline | Existing baseline | None in M0 | Previously accepted |
| MVP | `data/decks/annie.dec.txt` | `annie` | Yes | Yes | Existing baseline | Existing baseline | None in M0 | Previously accepted |
| MVP | `data/decks/masteryi.dec.txt` | `master-yi` | Yes | Yes | Existing baseline | Existing baseline | None in M0 | Previously accepted |
| OGS/OGN | `data/decks/garen.dec.txt` | `garen` | No | No | No | No | Fixture uses non-parser section/name format | No |
| OGN | `docs/full-ingestion-decks/OGN/` | TBD | No | No | No | No | Deck files not provided | No |
| SFD | `docs/full-ingestion-decks/SFD/` | TBD | No | No | No | No | Deck files not provided | No |
| UNL | `docs/full-ingestion-decks/UNL/` | TBD | No | No | No | No | Deck files not provided | No |
| VEN | `docs/full-ingestion-decks/VEN/` | TBD | No | No | No | No | Final JSON and deck files not provided | No |

## Primitive Regression Approval Ledger

| Primitive | Proposed change | Existing cards/decks affected | Regression risk | User approved? | Manual regression focus |
|---|---|---|---|---|---|
| None in M0 | None | None | None | Not needed | None |

## Manual Match Acceptance Ledger

| Milestone | Matchup | Scenario focus | Result | Issue link / note | Accepted by user |
|---|---|---|---|---|---|
| M0 | Existing Lux/Annie/Master Yi deck availability | Operating baseline only | Accepted | Automated checks pass; user accepted M0 operating baseline | Yes |
| M1 | Garen vs Lux | Baseline interaction | Not run | M1 deferred until M0 acceptance | No |
| M1 | Garen vs Annie | Damage/removal interaction | Not run | M1 deferred until M0 acceptance | No |
| M1 | Garen vs Master Yi | Combat modifier interaction | Not run | M1 deferred until M0 acceptance | No |

## M0 Acceptance State

Status: Accepted

M0 was accepted by the user after the tracking baseline and operating model were
recorded.
