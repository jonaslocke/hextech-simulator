# Full Two-Player Showdown and Combat Implementation

## Summary

Replace the existing showdown shell with a complete, server-authoritative 1v1 implementation covering rules 508–553 and the required movement, combat, cleanup, control, scoring, and victory rules.

The final result will support:

- Non-combat and combat showdowns.
- Separate Focus and Priority state.
- Action play during Showdown Open states.
- Reaction play during open and closed states.
- Correct chain resolution and consecutive-pass handling.
- Attack/defend initial chains.
- Assault, Shield, and Tank.
- Player-directed combat damage assignment.
- Recall, Conquer, Hold, scoring, and victory.
- Complete API projection, event logging, and playable board UI.

Each milestone is one independent commit and must pass `npm test`, `npm run typecheck`, and `npm run lint`.

## Rules and Interface Contract

- Add a showdown decision ledger mapping behavior and tests to rule numbers. Record the agreed interpretation that closing an uncontested showdown establishes control, clears Contested, and performs Conquer/Score when eligible.
- Canonical battlefield state gains `controllerPlayerId` and Contested metadata identifying the initiating player.
- Canonical player state gains points and per-turn battlefield scoring history.
- Canonical showdown state gains its kind, relevant players, focus holder, and consecutive focus passes. Focus and Priority must never be represented by the same field.
- Add canonical combat state containing stage, battlefield, attacker/defender, participating units, locked damage totals, and submitted assignments.
- Chain state gains relevant players, explicit priority, consecutive priority passes, typed items, and its return-to-showdown context.
- Generalize pending choices into a discriminated union for trigger ordering/targets, encounter ordering, and combat damage assignment.
- Extend projected actions and action intents with an optional structured choice payload. Existing `selectedIds` remains for card targets and movement; combat damage uses `{ targetUnitId, amount }` allocations.
- Engine transitions return the next game state plus structured domain events so one accepted intent can persist every showdown/combat transition.
- Existing persisted games may be discarded; no compatibility migration will be built.

## Milestone Commits

1. `docs(game): define showdown and combat rule contract`

   - Add the rule-number decision ledger, state-machine diagrams, terminology, scope boundaries, and the non-combat control interpretation.
   - Add characterization tests for the current shell and document every known deviation: conflated Focus/Priority, no occupied-field movement, immediate activated abilities, and missing score/control state.
   - Define milestone acceptance and rollback dependencies.

2. `refactor(game): establish timing chain and choice kernel`

   - Split the monolithic gameplay action flow into timing, chain, choice, and transition services under `src/server/game`.
   - Implement Neutral/Showdown × Open/Closed state derivation.
   - Correct LIFO chain resolution, per-item priority rounds, consecutive-pass reset after an action, and cleanup after each resolved item.
   - Put activated abilities on the chain; only rule-defined immediate Add effects bypass it.
   - Resolve permanents without a reaction priority round as required by rule 538.
   - Generalize trigger ordering and target choices without overwriting simultaneous triggers from another player.
   - Introduce structured transition events and persist all events in deterministic order.

3. `feat(game): implement control movement cleanup and scoring`

   - Implement battlefield Control and Contested state transitions.
   - Centralize Cleanup after moves, chain items, showdowns, and combat.
   - Support Standard Move from Base to battlefield and battlefield to Base, including simultaneous movement of multiple ready units to one destination.
   - Detect all pending non-combat showdowns and combats after movement/effects; let the turn player order simultaneous encounters.
   - Complete uncontested showdown resolution: establish control, clear Contested, Conquer if eligible, and run cleanup.
   - Implement Hold, Conquer, once-per-battlefield-per-turn tracking, final-point restrictions, fallback draw, score triggers, eight-point victory, and score projection.
   - Keep occupied-battlefield player movement gated until the combat milestone is enabled.

4. `feat(game): complete showdown action and reaction flow`

   - Establish relevant players and initial Focus from the player applying Contested.
   - In Showdown Open, project Action and Reaction cards/abilities only for the Focus holder.
   - In Showdown Closed, project only Reaction behavior for the Priority holder.
   - Treat Reaction as inclusive of Action timing, without allowing ordinary cards or abilities.
   - Require showdown plays to spend already-pooled resources; ordinary Basic Rune abilities cannot be implicitly activated after the showdown starts.
   - After the final chain item resolves, pass Focus to the next relevant player and reset the showdown pass sequence.
   - End only after both players pass Focus consecutively without an intervening action.
   - Re-run cleanup after each chain item and at showdown close, allowing deaths, movement, and control changes to cancel or alter the pending encounter.
   - Cover currently approved Action/Reaction cards, including Stupefy and Back to Back.

5. `feat(game): implement combat showdown and resolution`

   - Enable movement into occupied battlefields and create combat with explicit attacker/defender roles.
   - Mark participating units as attackers or defenders and evaluate static combat abilities.
   - Apply Assault to attackers and Shield to defenders when the combat showdown opens.
   - Emit attack/defend events and build the initial chain in Focus/turn order, including controller ordering and target choices.
   - On showdown close, lock both sides’ current Might totals before damage assignment.
   - Collect attacker assignment first, then defender assignment; apply both assignments simultaneously so both locked totals resolve.
   - Validate positive integer allocations, total damage, existing marked damage, lethal-before-next-target ordering, Tank priority, and equal-priority player choice.
   - Automatically resolve forced assignments; request a choice only when multiple legal allocations exist.
   - Resolve all outcomes: no combat if a side disappeared, lethal deaths, attacker recall when both sides remain, attacker control/Conquer when defenders are gone, defender retention, both-sides-empty control loss, role/Contested cleanup, and combat damage clearing.
   - Resume the encounter scheduler if another battlefield remains pending.

6. `feat(game-board): make showdown and combat fully playable`

   - Project scores, battlefield controller/contested state, showdown kind, Focus, Priority, consecutive passes, combat stage, and viewer-safe pending choices.
   - Add clear “Pass Focus” and “Pass Priority” controls and waiting feedback for the non-acting player.
   - Enable Action/Reaction menus strictly from projected legal actions.
   - Add multi-unit movement selection and pending-encounter ordering.
   - Add a combat damage dialog showing damage budget, lethal thresholds, Tank restrictions, assigned totals, and validation errors.
   - Display attacker/defender, active/deferred battlefield encounters, control changes, Conquer, and victory.
   - Populate the existing score UI from canonical projection instead of external placeholder values.
   - Preserve keyboard interaction, focus management, hidden-information boundaries, stale-version rejection, and seat-switch refresh behavior.

7. `test(game): certify showdown rollout and rollback`

   - Add full service acceptance scenarios from setup through uncontested conquest and contested combat.
   - Add a two-player Action/Reaction exchange containing nested reactions, trigger ordering, target invalidation, cleanup, and resumed Focus.
   - Cover all combat outcomes, Tank/Assault/Shield, marked damage, simultaneous encounter ordering, scoring restrictions, victory, and control changes caused during a showdown.
   - Add projection/privacy, structured event-order, API validation, UI model, and stale-action tests.
   - Update obsolete MVP documentation and runtime coverage from deferred to executable.
   - Add a confirmation-gated development runtime reset command scoped to matches, games, game events, and match deck snapshots.
   - Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`; record results and actual milestone hashes in `docs/showdown-rollback-plan.md`.

## Rollout and Rollback

- Create commits in the listed order without squashing or amending completed milestone commits.
- Do not begin the next milestone until the current commit is green.
- Before rollout, reset development games because the canonical state and intent contracts are intentionally incompatible.
- Roll back only a contiguous suffix of milestones. Revert newest-first: milestone 7 through milestone 1.
- For a complete rollback: stop the application, run the confirmation-gated runtime reset while it still exists, revert all seven recorded hashes newest-first, then rerun tests, typecheck, lint, and build.
- Catalog and canonical card collections are not reset or modified by the rollback command.

## Assumptions and Boundaries

- This is complete for the current two-player mode. Team modes, invitations to third players, player removal, and concession behavior remain out of scope because they are unreachable in current 1v1 matches.
- The timing/combat engine is generic, but card coverage is limited to currently approved runtime behaviors plus the core Assault, Shield, Tank, attack, and defend mechanics required by combat.
- Unrelated deferred mechanics such as Hidden, Ganking, Vision, and complete whole-set card execution remain explicitly unsupported.
- The rules reference and recorded decision ledger are authoritative. Any new contradiction blocks only its affected milestone until the decision is documented.
- The current clean baseline is 97 passing tests with successful typecheck and lint.
