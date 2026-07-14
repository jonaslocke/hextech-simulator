# Full Card Ingestion Tracking

Snapshot: 2026-07-11

This file is the active tracking baseline for the full-card ingestion program.
It follows `docs/full-card-ingestion/plan.md` and records the current milestone
gate without treating implementation checks as final user acceptance.

## Milestone Status Ledger

| Milestone | Scope | Status | Current blocker | Next action | User acceptance |
|---|---|---|---|---|---|
| M0 | Operating model and tracking baseline | Accepted | None | Open M1 | Accepted |
| M1 | Garen Proving Grounds deck | Accepted | None | Open M2 | Accepted |
| M2 | Origins full set | Primitive implementation in progress | Remaining corpus family review and manual family gates | Validate the top-deck inspection family, then continue by behavior family | Pending |
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
| `data/decks/garen.dec.txt` | Present, parser-ready | Normalized for M1; validates against full local set corpus. |

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
| `trigger.conquer` | Garen M1 | Might of Demacia - Starter | Covered by rules reference | Executable | `tests/game-token-placement.test.ts` | Controller conquers any battlefield | None |
| `trigger.hold_battlefield` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Hold battlefield trigger | None |
| `trigger.on_move` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Move-triggered ability | None |
| `trigger.on_death` | OGN M2 | Machine Evangel and Deathknell cards | Covered by rules reference | Executable for own-death clauses | `tests/game-token-placement.test.ts` | Deathknell resolves after source leaves play | Other-unit death filters remain unimplemented |
| `trigger.end_of_turn` | Existing | TBD | Covered by rules reference | Existing executable | Existing | End-turn trigger | None |
| `trigger.beginning` | OGN M2 | Temporary tokens | Covered by rules reference | Executable | `tests/game-token-placement.test.ts` | Temporary cleanup before scoring | None for own-controller Beginning triggers |
| `trigger.attack` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Attack trigger | None |
| `trigger.defend` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Defend trigger | None |
| `condition.compare_numeric_value` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Numeric threshold condition | None |
| `condition.effect_killed_target` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Damage kills target condition | None |
| `condition.unit_presence` | Garen M1 | Might of Demacia - Starter, Dune Drake | Covered by rules reference and card text | Executable | `tests/game-token-placement.test.ts` | Count matching units at source/event location | None |
| `selector.unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select legal unit | None |
| `selector.friendly_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select friendly unit | None |
| `selector.enemy_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select enemy unit | None |
| `selector.card` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select card from non-board zone | None |
| `selector.battlefield` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Select battlefield | None |
| `action.draw_cards` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Draw cards | None |
| `action.vision` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Resolve Vision choice | None |
| `action.discard_cards` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Discard chosen cards | None |
| `action.ready_cards` | Existing | TBD | Covered by rules reference | Executable with `card.readied` event | `tests/game-token-placement.test.ts` | Ready selected exhausted card | Exact ready-trigger models remain unapproved |
| `action.exhaust_cards` | OGN M2 | Unchecked Power | Covered by rules reference | Executable with `card.exhausted` event | `tests/game-token-placement.test.ts` | Exhaust selected ready card | Exact exhaust-effect models remain unapproved |
| `action.channel_runes` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Channel runes | None |
| `action.deal_damage` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Deal damage to unit | None |
| `action.draw_by_optional_cost` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Optional-cost draw branch | None |
| `action.channel_or_draw` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Channel fallback draw | None |
| `action.fight` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Two units fight | None |
| `action.kill_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Kill selected unit | None |
| `action.banish_card` | OGN M2 | Time Warp, Portal Rescue | Covered by rules reference | Executable | `tests/game-token-placement.test.ts` | Banish selected card to its owner's Banishment | Follow-up play-from-banishment model remains unapproved |
| `action.stun_card` | OGN M2 | Leona, Determined and stun spells | Covered by rules reference | Executable | `tests/game-token-placement.test.ts` | Stun selected unit; it has no combat Might until next Ending Step | Exact stun-trigger/card models remain unapproved |
| `action.return_to_hand` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Return selected card to hand | None |
| `action.recycle_cards` | OGN M2 | Vi, Destructive and other recycle cards | Covered by rules reference | Executable | `tests/game-token-placement.test.ts` | Recycle selected card from trash | Exact recycle cost/card models remain unapproved |
| `action.take_to_hand` | OGN M2 | Stacked Deck | Covered by rules reference | Executable | `tests/game-zone-effects.test.ts` | Choose one card from the original private look group and move it to hand | First use is ready for manual validation |
| `action.move_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Move unit to base | None |
| `action.play_token` | Garen M1 | Faithful Manufactor, Noxian Drummer, Recruit the Vanguard | Covered by rules reference | Executable | `tests/game-token-placement.test.ts` | Fixed and chosen Recruit token placement | None |
| `modifier.modify_numeric_value` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Apply numeric modifier | None |
| `modifier.play_unit_destination` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Play unit to extra destination | None |
| `modifier.enter_ready` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Enter ready | None |
| `modifier.facedown_capacity` | OGN M2 | Bandle Tree | Hidden Golden Rule | Executable | `tests/game-token-placement.test.ts` | Bandle Tree holds two independent facedown cards | Phase 1 Hidden foundation is ready for manual validation; Hide timing/payment and play-from-Hidden remain later phases |
| `keyword.vision` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Vision keyword | None |
| `keyword.assault` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Assault combat Might | None |
| `keyword.shield` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Shield combat Might | None |
| `keyword.tank` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Tank combat damage assignment | None |
| `keyword.deflect` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Deflect targeting cost | None |
| `keyword.ganking` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Battlefield-to-battlefield movement | None |
| `keyword.temporary` | OGN M2 | Sprite | Covered by rules reference | Executable | `tests/game-token-placement.test.ts` | Kill at controller Beginning Phase before scoring | None |
| `cost.pay` | OGN M2 | Activated abilities with Energy costs | Covered by rules reference | Executable for explicit Energy payment | `tests/game-token-placement.test.ts` | Pay Energy before activating ability | Power/domain and other non-standard costs remain unimplemented |
| `cost.exhaust_source` | OGN M2 | Activated abilities with Exhaust costs | Covered by rules reference | Executable | `tests/game-token-placement.test.ts` | Exhaust source before activation | None |
| `cost.exhaust_selected_unit` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Exhaust selected unit as cost | None |
| `replacement.recall_on_next_death` | Existing | TBD | Covered by rules reference | Existing executable | Existing | Recall instead of next death | None |

## Card Coverage Ledger

| Set | Card code | Name | Type | Behavior clauses | Primitive coverage | Executable | In deck validation | Notes |
|---|---|---|---|---:|---|---|---|---|
| MVP | Existing canonical scope | Lux, Annie, Master Yi playable deck cards | Mixed | TBD | Existing approved primitives | Yes | Existing selectable decks | M0 baseline only; detailed card ledger starts in M1. |
| OGS/OGN/SFD | 21 unique cards | Garen deck cards | Mixed | 18 cards with rules text | Exact M1 models certified in `tests/garen-m1-card-catalog.test.ts` | Yes in code-level snapshot validation | Garen selector code added | User reports all Garen card behaviors fixed and persisted. |
| OGN | 21 unique cards | Kai'Sa deck: Kai'Sa - Daughter of the Void; Kai'Sa, Survivor; Darius, Trifarian; Noxus Hopeful; Watchful Sentry; Void Seeker; Hextech Ray; Smoke Screen; Retreat; Thousand-Tailed Watcher; Reaver's Row; Unchecked Power; Cleave; Dr. Mundo, Expert; Brynhir Thundersong; Falling Star; Icathian Rain; Time Warp; The Arena's Greatest; The Candlelit Sanctum | Legend/Unit/Spell/Battlefield | 21 | Exact models published by `catalog:approve-kaisa-batch` | Yes | Accepted | Full Kai'Sa deck validation accepted on 2026-07-12; associated manual-test issues are closed in the resolution ledger. |
| OGN | 24 unique cards | Viktor deck: Herald of the Arcane; Viktor, Leader; Call to Glory; Consult the Past; Cull the Weak; Faithful Manufactor; Grand Strategem; Hidden Blade; Imperial Decree; Machine Evangel; Riptide Rex; Seal of Unity; Shen, Kinkou; Singularity; Spectral Matron; Sprite Mother; Trifarian Gloryseeker; Vanguard Captain; Obelisk of Power; Trifarian War Camp; Vilemaw's Lair; Facebreaker; Salvage; Vengeance | Legend/Unit/Spell/Gear/Battlefield | 24 | `approve-viktor-deck-foundation` published all exact Viktor models | Yes | Accepted | Full Viktor deck behavior validation accepted on 2026-07-13; follow-on Hidden work is tracked separately in the facedown plan. |
| OGN | OGN-183 | Stacked Deck | Spell | 1 | `timing.action`, `action.look`, `action.take_to_hand`, `action.recycle_top_cards` | Yes | Not yet | Published as one sequential runtime clause after fixing the observed no-op; awaiting the top-deck family manual gate. |

## Token Coverage Ledger

| Set | Token name | Source card(s) | Token data present | Behavior executable | Blocker | Notes |
|---|---|---|---|---|---|---|
| OGN | Recruit token variants | Faithful Manufactor, Noxian Drummer, Recruit the Vanguard | Yes | Yes | None for primitive runtime | Runtime resolves the canonical source token definition and supports fixed-location and counted base/controlled-battlefield placement. |
| OGN | Sprite | Sprite Call, Sprite Mother | Yes | Yes | Exact creator-card models not reviewed | Source-derived token definition enters ready and resolves Temporary before scoring. |
| SFD | Gold | Later Spiritforged cards | Yes | Not reviewed | None for M0 | Full Spiritforged milestone coverage item. |

## Deck Validation Ledger

| Set | Deck file | Deck ID | Catalog valid | Permanent selector exposure | Match loads | Full match completed | Issues found | Accepted |
|---|---|---|---|---|---|---|---|---|
| MVP | `data/decks/lux.dec.txt` | `lux` | Yes | Yes | Existing baseline | Existing baseline | None in M0 | Previously accepted |
| MVP | `data/decks/annie.dec.txt` | `annie` | Yes | Yes | Existing baseline | Existing baseline | None in M0 | Previously accepted |
| MVP | `data/decks/masteryi.dec.txt` | `master-yi` | Yes | Yes | Existing baseline | Existing baseline | None in M0 | Previously accepted |
| OGS/OGN/SFD | `data/decks/garen.dec.txt` | `garen` | Construction valid against full local set data; code-level runtime-catalog snapshot valid | Yes | Yes | Manual validation accepted | M1 manual defects fixed and accepted | Yes |
| OGN | `data/decks/kaisa.dec.txt` | `kaisa` | Yes | Yes | Automated catalog snapshot succeeds | Accepted | Full Kai'Sa deck validation accepted on 2026-07-12 | Yes |
| OGN | `data/decks/viktor.dec.txt` | `viktor` | Valid against the full local source catalog | Yes | Yes | Accepted | Full Viktor deck behavior validation accepted on 2026-07-13 | Yes |
| OGN | `data/decks/annie-stacked-deck.dec.txt` | `annie-stacked-deck` | Yes | Yes | Yes | Not yet | Manual validation deck for Stacked Deck and Candlelit Sanctum | No |
| SFD | `docs/full-ingestion-decks/SFD/` | TBD | No | No | No | No | Deck files not provided | No |
| UNL | `docs/full-ingestion-decks/UNL/` | TBD | No | No | No | No | Deck files not provided | No |
| VEN | `docs/full-ingestion-decks/VEN/` | TBD | No | No | No | No | Final JSON and deck files not provided | No |

## Primitive Regression Approval Ledger

| Primitive | Proposed change | Existing cards/decks affected | Regression risk | User approved? | Manual regression focus |
|---|---|---|---|---|---|
| `action.play_token` / token placement choice | Add runtime token creation and a player-facing placement choice for Recruit the Vanguard | No accepted MVP deck currently uses `action.play_token` | Public action/intent contract extension | Yes; implemented | Existing pending choices still work; Garen token placement prompts render and submit correctly |
| Selector `excludesSource` | Enforce `excludesSource` in unit selectors for text such as "another unit" | No accepted MVP deck currently has a discovered `excludesSource` selector | Shared selector legality change | Yes; implemented | Existing targeted effects keep current legal targets unless their model explicitly sets `excludesSource` |
| Catalog-driven token resolution | Replace name-based generated token data with resolved canonical token definitions | Accepted Garen Recruit paths: Faithful Manufactor, Noxian Drummer, Recruit the Vanguard | Shared token identity, media, and placement behavior | Yes; implemented 2026-07-11 | Recruit placement and board-leave cleanup |
| Generalized choices and non-standard costs | Extend the shared pending-choice and effect-resolution model for optional/modal choices and costs | Existing target and token-placement pending choices | Public choice and effect-resolution behavior | Optional choice implemented 2026-07-11; remaining cost/modal work in progress | Existing targeted spell and Recruit the Vanguard placement |
| Trigger and replacement processing | Extend shared event processing for Deathknell, delayed, prevention, and replacement behavior | Existing Garen attack, hold/conquer, and end-of-turn triggers | Chain ordering and showdown-focus behavior | Yes; approved 2026-07-11 | One scenario for each affected existing trigger class |

## Manual Match Acceptance Ledger

| Milestone | Matchup | Scenario focus | Result | Issue link / note | Accepted by user |
|---|---|---|---|---|---|
| M0 | Existing Lux/Annie/Master Yi deck availability | Operating baseline only | Accepted | Automated checks pass; user accepted M0 operating baseline | Yes |
| M1 | Garen manual validation | Garen deck behavior corpus and reported defect scenarios | Accepted | User accepted M1 after iterative manual validation and fixes | Yes |
| M2 foundation | Garen token regression | Recruit the Vanguard, Faithful Manufactor, and Noxian Drummer token placement | Passed | User manually confirmed token placement after catalog-driven token migration | Yes |
| M2 foundation | Garen shared-choice regression | Target selection, choice flow, and Recruit placement after the binary-choice extension | Passed | User manually confirmed the focused shared-contract regression pass | Yes |
| M2 | Kai'Sa full deck validation | Full Kai'Sa deck gameplay and all recorded manual-test scenarios | Accepted | User accepted the completed Kai'Sa validation on 2026-07-12; see the Kai'Sa resolution ledger | Yes |
| M2 | Viktor full deck validation | Full Viktor deck gameplay and all recorded manual-test scenarios | Accepted | User accepted the completed Viktor validation on 2026-07-13; see the Viktor resolution ledger | Yes |
| M1 | Garen vs Lux | Baseline interaction | Superseded by accepted M1 manual validation | M1 accepted by user | Yes |
| M1 | Garen vs Annie | Damage/removal interaction | Superseded by accepted M1 manual validation | M1 accepted by user | Yes |
| M1 | Garen vs Master Yi | Combat modifier interaction | Superseded by accepted M1 manual validation | M1 accepted by user | Yes |

## M0 Acceptance State

Status: Accepted

M0 was accepted by the user after the tracking baseline and operating model were
recorded.

## M1 Acceptance State

Status: Accepted

M1 input normalization, deck construction validation, token coverage check, and
primitive discovery are complete. The user approved:

- extending the public pending-choice/action intent contract for token placement;
- enforcing shared selector `excludesSource` behavior.

Runtime implementation for both approved gates and the latest manual defect fixes
is complete and verified by:

- `node --import tsx --test tests/card-catalog-primitive-discovery.test.ts tests/game-zone-effects.test.ts tests/game-token-placement.test.ts tests/garen-m1-card-catalog.test.ts`
- `node --import tsx --test tests/game-token-placement.test.ts`
- `node --import tsx --test tests/garen-m1-card-catalog.test.ts`
- `cmd /c npm run catalog:check-mvp`
- `cmd /c npm run typecheck`
- `cmd /c npm test`
- `cmd /c npm run lint`
- `cmd /c npm run build`

Exact Garen behavior modeling and code-level runtime-catalog validation are
complete. `tests/garen-m1-card-catalog.test.ts` certifies 21 unique Garen deck
cards as approved, executable canonical models and builds a valid deck snapshot
from those documents.

The user reports that all Garen card behaviors were fixed and all Garen deck
cards are persisted in the canonical catalog. The code now adds `garen` to the
permanent local/online deck ID schema and to deck-definition synchronization.

Latest manual defect pass fixed:

- Trifarian War Camp discovery/runtime continuous source-location Might.
- Generated Recruit/Sprite token image URLs.
- Recruit the Vanguard token placement count reset.
- Noxian Drummer fixed-location token placement onto the source battlefield.
- Decisive Strike-style automatic group Might modifiers without target prompts.
- Attack-trigger chain resolution returning showdown focus to the trigger controller.
- Unit play projection no longer treats stale passive/triggered unit text as play-time target requirements.
- Tokens cease to exist when they would move to a non-board zone.
- Battlefield rules text now renders resource icons through `CardRulesText`.

Old-match policy for this defect pass: existing matches may be discarded.

The user accepted M1 on 2026-07-10 after confirming the final Crackshot Corsair
and Recruit the Vanguard fixes.

Per the accepted workflow, Codex should commit the M1 milestone changes before
starting M2.

## M2 Active State

Status: Primitive implementation in progress

Input readiness is complete. `data/sets/ogn.json` passes local schema and
identity checks, and both user-provided OGN decks now parse and validate without
changing their card choices or real Legend names. The full analysis and token
inventory are in `docs/full-card-ingestion/ogn-corpus-analysis.md`.

The user approved the three regression-risking shared changes on 2026-07-11.
Catalog-driven token resolution is implemented and synchronized. Generalized
choice/cost processing and trigger/replacement processing remain in progress.
The current executable subset includes optional binary decisions, explicit
Energy/source-exhaustion activated costs, Beginning-Phase Temporary cleanup,
own-death triggers, selected-card recycle effects, Hidden, Accelerate, Legion,
and basic look/reveal flows. Arbitrary replacement and prevention text remains
unapproved until its exact model has sufficient parameters.

Viktor implementation began on 2026-07-12. All 24 canonical cards are now
published and the persisted `viktor` deck is synchronized. Its reusable
mechanics include Recruit and Sprite token creation, Deathknell, Legion,
Reaction Gear, optional Buff alternate costs, linked and player-owned target
choices, turn-scoped damage triggers, and playing an eligible Unit from Trash.
