# Kai'Sa and Viktor Deck Implementation Retrospective

Date: 2026-07-13

This is a handoff analysis for the next implementation chat. It is based on
the accepted Kai'Sa and Viktor deck validations, their issue reports, the
Kai'Sa resolution ledger, the Viktor resolution ledger, and the follow-up
engine defects discovered while validating both decks.

It does not redefine the original evidence. Read these documents when the
underlying scenario is needed:

- [Kai'Sa issue ledger](issues-found-after-kaisa-implementation/resolution-ledger.md)
- [Viktor issue report](after-viktor-implementation/issues.md)
- [Viktor resolution ledger](after-viktor-implementation/resolution-ledger.md)
- [Program tracking and deck inventory](tracking.md)

## Executive conclusion

The two decks were successfully implemented and manually accepted, but the
first-pass behavior accuracy was approximately **40%** by the metric below.
The main reason was not careless individual card modeling. Most defects came
from applying an otherwise valid primitive at the wrong shared rules boundary:
zone of origin, timing window, payment source, choice ownership, Chain
continuation, or placement semantics.

The next chat should optimize for **rules-flow completeness before card count**.
One reusable, tested behavior boundary is worth more than several cards that
appear playable in the happy path but have not been exercised through their
full timing, payment, target, and event paths.

## Accuracy metric

### Definition

A newly implemented behavior card is counted as **first-pass accurate** only
when it reached deck validation without a later bugfix request affecting its
rules behavior. A card that needed only image, preview, wording, or other
presentation work is not counted as behavior-inaccurate unless the issue also
changed the rules result.

This deliberately measures observed validation quality, not all possible game
states. A card not reported as broken was not necessarily exhaustively proven.

### Result

| Deck | Behavior cards in accepted inventory | Cards/behavior families that later needed rules fixes | First-pass accurate | Observed first-pass accuracy |
|---|---:|---:|---:|---:|
| Kai'Sa | 21 | 13 | 8 | 38% |
| Viktor | 24 | 14 | 10 | 42% |
| Combined | 45 | 27 | 18 | **40%** |

The counts are intentionally conservative. A shared defect is counted against
every deck behavior family whose correctness depended on it, but repeated
reports for the same card and cause count once. Pure infrastructure reports,
such as match polling latency and between-games submission concurrency, are
excluded from the card-behavior denominator.

This is therefore a **behavior-family impact score mapped to the accepted
deck inventories**, not a claim that exactly 8 Kai'Sa card names and exactly
10 Viktor card names were exhaustively proven defect-free. The source records
group several cards under shared fixes (for example, Legion, repeated damage,
Hidden, and payment planning), so a more exact per-card percentage would be
false precision. The 40% combined result is the useful planning baseline.

### Why this is useful

The 40% figure is a baseline for process improvement, not a quality judgment on
the accepted result. The important signal is concentration: most misses were
predictable from a small set of cross-cutting mechanics. Improving the
pre-implementation checks for those mechanics should increase first-pass
accuracy materially without requiring more card-specific code.

## What needed correction

### Kai'Sa deck: behavior families that exposed gaps

| Behavior family | Examples that revealed it | Shared missed boundary |
|---|---|---|
| Beginning, combat, and death lifecycle | The Arena's Greatest, Watchful Sentry, Reaver's Row | Events were emitted at the wrong lifecycle point, duplicated, or cleaned up before their triggers were preserved. |
| Showdown Focus after triggered resolution | Reaver's Row; later generic Chain follow-up | Focus was derived from the last trigger rather than the originating Showdown action. |
| Card-play accounting and Legion | Darius, Noxus Hopeful | The implementation used a source-specific Main Deck history where the rules refer to a card-play history. |
| Optional, required, and private choices | Reaver's Row, Candlelit Sanctum, Dr. Mundo | Closing/declining, minimum counts, stale snapshots, and reorder state were not modeled as first-class resolution states. |
| Repeated targets and repeated damage | Falling Star, Icathian Rain, Watchful Sentry | Target selections must preserve assignment order and duplicates; lethal cleanup must emit one death event and fizzle later hits. |
| Payment and resource restrictions | Void Seeker/Deflect, Daughter of the Void | Cost derivation and resource abilities needed one shared payment/timing model, including immediate non-reactable Add effects. |
| Zone-changing resolution | Time Warp | Spell cleanup assumed Trash even after the effect moved the card to Banishment. |

The Kai'Sa pass also revealed catalog/projection work that should be handled as
a separate acceptance category: canonical printing selection, temporary
modifier display, Chain readability, and battlefield detail presentation.

### Viktor deck: behavior families that exposed gaps

| Behavior family | Examples that revealed it | Shared missed boundary |
|---|---|---|
| Activated abilities and payment plans | Herald of the Arcane, Seal of Unity, Daughter of the Void | Activated abilities were not using the same legal payment-source and plan selection logic as card plays. |
| Unit timing and shared placement | Shen, Kinkou; Herald of the Arcane; Viktor | Unit Action/Reaction timing and entry placement were modeled separately instead of using one play/placement flow. |
| Effect-driven play semantics | Herald, Spectral Matron | “Play a Unit” was incorrectly reduced to “put a Unit in Base,” and later needed normal destination choice semantics. |
| Deferred, player-owned choices | Cull the Weak, Call to Glory, Spectral Matron, Facebreaker | The engine prematurely stopped on an impossible first instruction, conflated selection with payment, or failed to let `may` mean zero selections. |
| Hidden/facedown rules | Hidden Blade, Consult the Past, Hidden cards generally | Timing, capacity, privacy, placement, payment, and later Play permission were initially treated as ordinary target selection. |
| Active-source and trigger identity | Chosen Champion, Viktor, Legion cards | Non-board sources leaked into trigger collection and repeated trigger items lacked event-specific identity. |
| Combat state and lifecycle | Shen, Kinkou; Imperial Decree; Awakening | Entering a battlefield during combat, Shield role calculation, damage events, and Legend readying needed one authoritative lifecycle. |
| Generic turn card-play tracking | Champion-zone play followed by Vanguard Captain/Darius-style effects | Champion-zone plays were not recorded as card plays despite the same rules wording. |

## Root causes across both decks

### 1. The implementation began from card text instead of a complete rules flow

Several bugs came from treating a phrase as a local effect:

- “play a Unit” became a direct Base placement;
- “may” became a target prompt with an implicit required selection;
- “another card this turn” became Main Deck-only bookkeeping;
- repeated “deal damage” became a unique target set;
- a Reaction Unit entering combat did not take the same placement path as
  every other Unit entering that battlefield.

The correction was consistently to model the verb or timing concept once and
reuse it. The next chat should ask, before coding: **what is the existing game
action this text refers to, and which parts of that action must be preserved?**

### 2. Choice state is game state, not UI state

The highest density of defects involved selections:

- optional decline must submit a legal empty result and resume;
- mandatory selections must enforce their actual minimum;
- private look/recycle/reorder flows need a stable snapshot;
- each affected player may need an independent choice;
- repeated effects must preserve per-instruction assignments;
- a movement selection is a set of runtime instances, not an append-only list.

The next chat should treat every choice as a server-authoritative state machine
with explicit ownership, minimum, maximum, legal IDs, ordering, and resume
behavior. The UI only renders that contract.

### 3. Chain entries must keep their parent context

The later Focus defect showed that the original continuation can be lost when a
spell creates a trigger-order or target-selection prompt. The child trigger
Chain must retain the originating action's continuation, not derive it from the
last trigger controller.

The same principle applies to:

- target object versions;
- private card snapshots;
- selected-card roles;
- source-card identity after a source leaves play;
- card text effective under official errata.

Whenever an item leaves the active Chain for a prompt or queue, identify the
context it must carry to re-enter correctly.

### 4. Zone of origin and zone visibility are different concerns

Champion, hand, Trash, facedown, Base, and battlefield are not merely labels.
They determine whether a source is active, whether a play is legal, which
costs apply, whether the event counts as a card play, and what each viewer may
see. The Champion-zone trigger leak and the Champion-zone card-count bug were
opposite failures of the same missing distinction.

### 5. Projection must expose only legal actions

Several manual reports were caused by a menu showing impossible operations:

- uncontrolled battlefields as Hidden destinations;
- unpayable card plays instead of `Not Playable`;
- face-up/facedown choices at an invalid timing;
- stale target prompts for a non-targeting hide action.

The projection should be a filtered legal-action view, not a list of possible
operations with an error attached. Server validation remains mandatory, but it
is not a replacement for correct projection.

## Required workflow for the next chat

Use this sequence for every new deck behavior batch.

1. Read the complete deck list, all current issue/ledger documents, the card
   text, and applicable errata before changing behavior.
2. Build a mechanic matrix before implementation. Group cards by shared
   timing, payment, target, placement, event, zone, and privacy requirements.
3. Inspect the existing primitive and action flow for each group. Identify the
   reusable action to extend; do not create a card-code branch when the text
   describes a general rule concept.
4. State the scope of a behavior contract before writing code. At minimum,
   state its source zones, legal timing, payer, legal destinations, target
   cardinality/duplication, emitted events, Chain behavior, and cleanup zone.
5. Implement one shared boundary at a time and add a focused automated test
   that recreates the exact reported or anticipated sequence.
6. Run cross-deck regressions whenever changing payment, choices, triggers,
   Unit placement, zone movement, or projection. These are shared engine
   contracts, not deck-local changes.
7. Update the relevant ledger with: diagnosis, shared owner, automated gate,
   exact manual retest, and status. Do not ask for vague validation.
8. Only then request manual validation. Name the card, board state, sequence,
   expected prompt/Chain result, and expected final state.

## Mandatory scenario matrix before calling a behavior ready

For a behavior card, test the relevant entries in this matrix rather than only
its happy path.

| Dimension | Minimum questions |
|---|---|
| Source/zone | Can it be played from every allowed zone? Is it inactive in every forbidden zone? |
| Timing | Is it Action, Reaction, Add/immediate, delayed, combat-only, or turn-only? Who has priority/focus afterward? |
| Payment | Does Energy, Power, Deflect, alternate cost, reusable permanent, and automatic payment use the same legal plan? |
| Targets | Are zero, optional, required, repeated, linked, multi-player, and stale targets handled correctly? |
| Placement/movement | Does a played Unit use Base and every controlled battlefield? Does combat entry assign attacker/defender correctly? |
| Events/triggers | Which event fires, how many times, from which active sources, and what happens if the source leaves play? |
| Chain | Are ordering, target prompts, and child triggers preserving the originating continuation and priority/focus? |
| Zones/cleanup | Does the card end in the right zone? Are tokens, Banishment, Trash, and returned cards handled once? |
| Projection/privacy | Are only legal actions shown? Does each player see only permitted information? |
| Lifecycle | Does it behave correctly around Awakening, Beginning, Conquer, combat damage, final point, and between-games transitions? |

## Practical rules for communicating with the user

The next chat should preserve the collaboration lessons from this work:

- Continue implementation autonomously when the next shared step is clear.
- Stop only for a real rules ambiguity, missing authority, or a requested
  manual validation gate.
- When validation is needed, say exactly what to do and what result confirms
  it. Link the document/ledger section that explains why.
- Never infer that a report is a timing issue, payment issue, or card-specific
  issue without first reproducing or inspecting the relevant engine path.
- Lead with evidence when a hypothesis is needed. For example: identify the
  actual state field, emitted event, projected action, or Chain transition
  responsible for the behavior.
- Separate “implemented,” “automatically verified,” “ready for retest,” and
  “accepted by manual validation.” They are different states.

## Improvement target for the next deck

The actionable target is to move observed first-pass accuracy from about 40% to
at least **70%**. That does not mean fewer manual tests. It means a smaller,
earlier mechanic matrix plus focused tests for every shared action boundary
before a full deck is handed to manual validation.

The leading indicators should be:

- every behavior card has a declared action/trigger/choice contract;
- every new primitive has at least one cross-zone and cross-timing test;
- no unavailable operation is emitted by the projection;
- no card-name-specific engine branch is introduced where a reusable game
  action can express the rule;
- every manual finding is entered into a ledger before its fix is considered
  complete.

## Final handoff

Kai'Sa and Viktor are accepted deck milestones, and their fixes produced a much
stronger shared engine: errata-aware effective text, proper repeated-target
resolution, payment-plan reuse, authoritative choices, facedown foundations,
generic Unit placement, correct card-play accounting, and Chain continuation.

The next deck should build on those contracts rather than reimplementing their
card examples. The safest question to ask for each new card is not “how do we
make this card work?” but **“which existing rules action does this card invoke,
and what missing parameter or lifecycle boundary prevents that action from
already working?”**
