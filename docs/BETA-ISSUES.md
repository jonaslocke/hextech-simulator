# Hextech Beta Issue Tracker

Snapshot date: 2026-07-06  
Context: first beta test session for the online/local Riftbound simulator.

This document tracks gameplay and UI issues found during beta testing. It is intentionally written as a working issue log, not as a final implementation spec. Each issue should stay small enough to validate independently.

## Status Legend

- `New`: reported, not yet triaged.
- `Needs validation`: requires rule, corpus, or code validation before implementation.
- `Ready`: expected behavior is clear enough to implement.
- `In progress`: being changed.
- `Needs verification`: implemented, waiting for manual or automated validation.
- `Done`: verified.
- `Deferred`: valid issue, not part of the current pass.

## Current Issue Summary

| ID         | Title                                                                | Type                               | Priority | Status           |
| ---------- | -------------------------------------------------------------------- | ---------------------------------- | -------- | ---------------- |
| `BETA-001` | Battlefield remains contested after the last relevant unit dies      | Rules / Engine bug                 | High     | New              |
| `BETA-002` | Chain panel prevents opening Trash at the same time                  | UI / Interaction bug               | Medium   | New              |
| `BETA-003` | Card sizes are too large on some monitors                            | UI / Responsive layout             | Medium   | New              |
| `BETA-004` | Ability choices do not follow the same timing model as spell choices | Rules / Engine / Corpus validation | High     | Needs validation |

---

## BETA-001 — Battlefield remains contested after the last relevant unit dies

### Problem Statement

During beta testing, a Battlefield remained visually and logically marked as `contested` even after the unit that caused or participated in the contest died. The board continued showing the Battlefield as contested, even though the board state no longer appeared to support that contested state.

### Observed Behavior

- A unit enters or contests a Battlefield.
- A Showdown or Combat-related sequence occurs.
- The unit at that Battlefield dies.
- The Battlefield still displays as contested, for example with a `Contested by player-X` label.
- The game can remain in an invalid-feeling state, such as waiting for the contested/showdown flow to continue when the unit presence no longer supports it.

### Expected Behavior

The authoritative game state should re-evaluate Battlefield contest/control state whenever units leave a Battlefield, including when units die during Showdown, Combat, Chain resolution, or Cleanup.

At minimum:

- If no units remain at the Battlefield, the Battlefield should not remain contested only because of stale metadata.
- If only one player's units remain, the Battlefield should resolve toward the correct control/conquer/hold state according to the rules.
- If opposing units remain, the Battlefield may stay contested or become pending for Combat as appropriate.
- The projected UI label must reflect the authoritative state after Cleanup.

### Rule Anchors to Validate

- Battlefield control and contested status.
- Showdown and Combat completion.
- Cleanup after units are killed.
- Whether empty contested Battlefields should become uncontrolled immediately or after a specific Cleanup step.
- Whether previous control should persist if a controller no longer has units there.

### Likely Technical Area

- `src/server/game/control`
- `src/server/game/combat`
- `src/server/game/showdown`
- `src/server/game/cleanup`
- `src/server/game/projection`
- `src/features/game-board` only if the server state is correct but the projection/view-model is stale.

### Investigation Checklist

- Confirm whether canonical state still has `contestedBy`, `controller`, `pendingCombat`, `showdown`, `attacker`, or `defender` metadata after the unit dies.
- Confirm whether Cleanup runs after the death event that removes the unit.
- Confirm whether Cleanup clears contested metadata when the required unit presence no longer exists.
- Confirm whether pending Showdown/Combat state is cancelled when the Battlefield no longer has valid participants.
- Confirm whether the UI label is derived from canonical projection or cached local interaction state.

### Acceptance Criteria

- Given a Battlefield becomes contested, when all units at that Battlefield leave or die, then the Battlefield no longer remains contested because of stale state.
- Given a Battlefield becomes contested, when only one player's units remain after Cleanup, then control/conquer/hold state is resolved according to the rules.
- Given opposing units remain, then contested/combat state remains valid and the UI still displays it correctly.
- The event log or debug state should make the transition understandable.
- Add a focused regression test around the smallest engine transition that reproduces the stale contested state.

### Notes

This should be fixed server-side first. The UI should not infer control or contested status independently.

---

## BETA-002 — Chain panel prevents opening Trash at the same time

### Problem Statement

When the Chain is open, the player cannot open the Trash at the same time. The Chain and Trash appear to use the same temporary-zone display component or the same exclusive overlay state.

### Observed Behavior

- A card or ability is on the Chain.
- The Chain panel is visible.
- The player attempts to open Trash.
- Trash either cannot open, replaces the Chain, or is blocked by the same overlay mechanism.

### Expected Behavior

Players should be able to inspect public zones such as Trash while the Chain is visible. The Chain is part of the current interaction state, while Trash is a public information zone that players may need to inspect to make priority, reaction, and choice decisions.

The Chain and zone browser should not be mutually exclusive UI states.

### Proposed UX Direction

Separate these concerns:

1. Chain display:
   - Persistent contextual panel while the Chain exists.
   - Shows current stack/chain items, active player, priority/focus, and resolving status.
   - Should not behave like an ordinary temporary zone browser.

2. Public zone viewer:
   - Opens Trash, Banishment, or other inspectable zones.
   - Can appear alongside the Chain.
   - Should be read-only during Chain/priority windows unless the server projects a legal action.

### Likely Technical Area

- `src/features/game-board`
- Temporary zone / zone overlay state
- Chain panel component
- Trash/Banishment browser component

### Investigation Checklist

- Identify whether `Chain`, `Trash`, and other temporary viewers share a single `activeZone` or `temporaryZone` state.
- Identify whether closing/opening one viewer intentionally closes all other panels.
- Decide whether the Chain should be removed from the generic temporary-zone model.
- Preserve mobile/small-screen behavior where two panels may not fit.

### Acceptance Criteria

- When the Chain exists, the Chain remains visible while the player opens Trash.
- Trash can be opened as a read-only public zone during priority or waiting states.
- Opening Trash does not clear Chain context, priority context, or selected action state.
- Closing Trash does not close the Chain.
- If screen size is too small, the UI may use tabs or a layered panel, but both contexts must remain reachable without losing state.

### Notes

This is UI-only unless current server projection hides public Trash during Chain state. Trash and Banishment are public zones, but the client must still respect viewer-specific private information elsewhere.

---

## BETA-003 — Card sizes are too large on some monitors

### Problem Statement

Card sizes scale too aggressively on some monitors. The board can become visually cramped because card dimensions are not sufficiently constrained by viewport height and available board space.

### Observed Behavior

- On some displays, cards become too large relative to the board.
- Important board regions compete for vertical space.
- Hand, base, battlefield, deck, trash, and side panels can feel oversized or cramped depending on monitor height and scaling.
- The layout appears acceptable on a `3440 × 1440` monitor.
- The layout appears too large/off on a `1512 × 982` monitor.
- The height difference is the most important signal: the current sizing likely needs stronger dependence on available viewport height instead of width alone.

### Expected Behavior

Card sizing should be responsive to available screen height, with explicit minimum and maximum thresholds. Cards should not continue growing indefinitely on larger monitors, and they should not become unusably small on short screens.

### Proposed Sizing Direction

Define card sizing through board-level CSS variables rather than independent component values.

Example direction, not final values:

```css
.game-board {
  --board-card-width: clamp(56px, 7vh, 88px);
  --hand-card-width: clamp(72px, 10vh, 112px);
  --zone-card-width: clamp(52px, 6.5vh, 84px);
}
```

The important part is not the exact numbers. The important part is that card width is driven primarily by viewport height and clamped by min/max thresholds.

### Likely Technical Area

- `src/features/game-board`
- Card components and card containers
- Hand fan sizing
- Base and Battlefield unit sizing
- Zone overlays and side panels

### Investigation Checklist

- Identify all places where card width/height is hardcoded.
- Identify whether hand fan, board zones, and zone overlays use different sizing assumptions.
- Define board sizing tokens once and reuse them.
- Validate the known beta-test comparison first:
  - `3440 × 1440`: current card sizing appears acceptable.
  - `1512 × 982`: current card sizing appears too large/off.
- Treat viewport height as the primary sizing constraint.
- Validate additional common viewport sizes after the known comparison is stable:
  - 1366 × 768
  - 1440 × 900
  - 1920 × 1080
  - 2560 × 1440
- Validate browser zoom at 90%, 100%, and 110% if practical.

### Acceptance Criteria

- Cards remain readable but do not dominate the board on large monitors.
- Cards do not overflow or hide essential board state on shorter monitors.
- Hand fan remains usable and does not cover Battlefield text more than intended.
- Base/Battlefield card sizing uses shared board tokens.
- No gameplay state or card selection behavior changes.

### Notes

This should be treated as a visual/layout refinement. Avoid coupling card sizing to engine state.

---

## BETA-004 — Ability choices do not follow the same timing model as spell choices

### Problem Statement

Some player choices are made before a spell or ability enters the Chain, while other choices are made during resolution. The spell flow appears to handle this distinction correctly, but abilities do not yet follow the same model consistently.

This needs validation against the rules and the card corpus before implementation.

### Observed Behavior

- Spell choices currently work for pre-chain target selection and resolution-time selections.
- Abilities can require similar choices, but the current implementation may treat ability choices differently from spell choices.
- This creates risk for cards whose abilities choose targets before being added to the Chain, or whose abilities create choices only while resolving.

### Expected Behavior

The engine should apply the same timing model to spells and abilities:

1. Choices that are targets must be made while playing the spell or adding the ability to the Chain.
2. Those target choices must be locked and validated before the item is finalized.
3. Choices explicitly made during resolution must be requested during effect resolution.
4. Split damage has mixed timing:
   - targets are chosen before the spell or ability resolves;
   - damage allocation is decided during resolution.
5. Ability effects should not have a separate or weaker implementation path than spell effects.

### Rule Anchors to Validate

- Activated abilities follow the same process as playing a card and behave like spells without an associated card.
- Chain items can be spells or abilities.
- Targets are chosen when the spell is played or the ability is added to the Chain.
- Some choices, such as split damage allocation, are intentionally made during resolution.
- Resolution should remain atomic except for persisted player decision requests required by the effect-resolution model.

### Corpus Validation Scope

Use `data/sets/*.json` or the uploaded set files as the source list.

Initial heuristic scan from the uploaded JSON files found:

- `ogs.json`: 24 cards
- `ogn.json`: 352 cards
- `sfd.json`: 280 cards
- 656 card entries total

The following patterns should be audited manually because regex is not enough:

| Pattern                                                           | Why it matters                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `choose`                                                          | Usually indicates target selection, but can also be modal choice or resolution choice.      |
| `a unit`, `an enemy unit`, `something`, `gear`, `card from trash` | May imply a target even without the word `choose`.                                          |
| `split damage`                                                    | Targets and allocation have different timing.                                               |
| `When you play me` / `When you play this`                         | Permanent play can execute rules text as part of play/finalization and can include choices. |
| Activated ability syntax using `:`                                | Ability choices must be checked against spell-like timing.                                  |
| `may`                                                             | May create optional choices during resolution or optional additional costs during play.     |
| `look at`, `reveal`, `put 1`, `play one`                          | Often creates resolution-time choices from a revealed or temporary set.                     |
| `you may play...`                                                 | May create nested play choices and destination choices.                                     |
| `to different locations`                                          | May create multiple destination choices during resolution.                                  |

### Example Cards to Include in the Audit

These are examples to classify, not final rulings:

- A spell that deals damage to a unit at a Battlefield.
- A spell or ability that splits damage among units.
- A unit ability that triggers when it attacks and chooses or damages enemy units.
- A gear activated ability that plays multiple unit tokens to different locations.
- A card that reveals cards from the deck and allows one to be played or put into hand.
- A card that plays a unit from Trash.
- A card that chooses a mode, such as "choose one".

### Likely Technical Area

- `src/server/game/actions`
- `src/server/game/behavior-runtime`
- `src/server/game/effect-resolution`
- `src/server/game/primitive-handlers`
- `src/server/game/targets`
- `src/features/game-board/decisions`
- Admin behavior catalog / primitive definitions if ability behavior is modeled differently from spell behavior.

### Investigation Checklist

- Compare spell play flow and ability activation flow step by step.
- Identify where spell targets are collected before Chain finalization.
- Identify where ability targets are collected before Chain finalization.
- Confirm whether ability targets are stored in the same canonical structure as spell targets.
- Confirm whether effect resolution can pause for player choices produced by abilities.
- Confirm whether CardSelectionPrompt / PlayerDecisionHost receives ability-originated choices.
- Run a corpus audit and produce a list of cards that require:
  - pre-chain target selection;
  - resolution-time card selection;
  - resolution-time option selection;
  - resolution-time ordering;
  - split target selection plus split allocation;
  - nested play/destination selection.

### Acceptance Criteria

- Spell and ability target timing are implemented through one shared model or clearly equivalent models.
- Ability targets chosen before Chain finalization are locked and revalidated at resolution.
- Ability choices that occur during resolution are represented as canonical pending choices.
- Spells and abilities use the same projected decision UX when their choice shape is the same.
- Add focused tests for at least:
  - spell target chosen before Chain resolution;
  - ability target chosen before Chain resolution;
  - spell resolution-time choice;
  - ability resolution-time choice;
  - split damage target/amount timing if currently supported.

### Notes

Do not fix this card by card. The goal is to validate the generic rule model and then make the behavior primitives follow that model.

---

## Backlog Template for New Beta Issues

```md
## BETA-XXX — Short issue title

### Problem Statement

What is wrong, in one paragraph.

### Observed Behavior

- What happened during testing.
- Include game state, player, card, phase, and viewer if known.

### Expected Behavior

- What should happen instead.
- Reference rules or card text when possible.

### Reproduction Notes

1. Step one.
2. Step two.
3. Step three.

### Likely Technical Area

- Server/game area
- UI area
- Projection area
- Unknown

### Investigation Checklist

- First thing to verify.
- Second thing to verify.
- Third thing to verify.

### Acceptance Criteria

- Given/When/Then style checks.

### Status

`New`
```

## Recommended Tracking Order

1. Fix `BETA-001` first because stale contested/control state can block gameplay and distort rules validation.
2. Triage `BETA-004` next because it affects card coverage and the long-term behavior model.
3. Fix `BETA-002` in parallel if it is isolated to UI state.
4. Apply `BETA-003` after the current gameplay bugs are stable, unless layout issues are blocking further beta testing.

## General Validation Principles

- Server state is authoritative.
- UI should render projected state and legal actions, not infer rules independently.
- New gameplay decisions should go through the Player Decision System.
- Use focused regression tests for confirmed bugs.
- Avoid broad visual snapshots while board layout is still evolving.
- Keep card behavior generic and primitive-based; do not add card-name-specific engine branches.
