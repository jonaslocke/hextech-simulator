# PR 01 — Ornn Manual Validation Defects, Round 2

## 1. Context and acceptance status

This report records the defects found after the latest implementation and review cycle for Ornn, Fire Below the Mountain. It is an additional correction round under the canonical plan at `docs/eight-deck-card-corpus-expansion-plan.md`.

**PR 01 remains unaccepted.** The previous report's unresolved requirements remain applicable unless explicitly superseded here. Do not treat a previously reported issue as closed merely because its implementation has changed; its acceptance criteria must still be satisfied.

The objective is to correct the reported behavior, preserve previously accepted engine contracts, and reuse existing subsystems rather than introducing parallel implementations of established flows. The complete Ornn deck, Sideboard, and affected shared mechanics remain within the PR 01 acceptance scope.

## 2. Mandatory regression-recovery approach

The repeated regressions are a release-blocking quality concern. New card support must not silently replace or weaken behavior that has already been manually validated. Time and token consumption are acceptable costs of implementing the correct reusable solution; regressions caused by avoidable duplication or unverified changes are not acceptable.

Before implementing corrections, Codex must inspect the current PR diff and the relevant pre-PR baseline. For every affected subsystem, identify the existing implementation, its established consumers, its tests, and the exact change that introduced the regression. The objective is to understand and repair the shared owner, not to restore behavior by adding card-specific exceptions.

### Reuse-first requirement

Before creating a new component, decision flow, gameplay primitive, payment path, or presentation pattern, search the repository for an existing subsystem that already supports the required behavior. Inspect its contract and actual implementation, not only its name. Reuse it when it satisfies the requirement; extend it generically when a necessary capability is missing; create a new abstraction only when existing owners are genuinely unsuitable.

Examples relevant to this report include Rune and Seal resource menus, Kai'Sa's Legend Add ability, the existing Awaken behavior, Mulligan and Vision card-image selectors, Chain-item decisions, attachment grouping, and existing optional additional-cost patterns. These are starting points for investigation, not instructions to copy their code blindly.

For each correction, include a short implementation note explaining which existing subsystem was reused or extended. If a new subsystem is necessary, explain why the existing alternatives cannot support the requirement.

### Regression evidence

A correction is not complete until it demonstrates that the reported defect is fixed and affected accepted consumers still work. Use focused deterministic tests for the incorrect behavior and preserve existing tests unless a documented rule correction justifies changing an expectation.

For confirmed regressions, reproduce the incorrect behavior with a deterministic test where practical before making the correction. Tests must assert the actual rules contract, including intermediate states for timing and resource-accounting defects. Do not weaken, delete, or rewrite an existing expectation merely to make the suite pass.

The independent reviewer must verify rules and expected behavior directly from the authoritative source, inspect the implementation and regression scope, and not rely solely on Codex's summary or passing tests. Any broader change to accepted primitive semantics outside these defects requires a concrete impact proposal and user approval before implementation.

Do not reopen unrelated previously accepted engine work solely because the rules reference was updated. Focus on the concrete defects and their actual dependent behavior.

### Rules-correctness incident and prevention

The previous Focus regression exposed a serious process failure: both the implementation agent and the assistant preparing the report applied a general rule without accounting for its applicable exception. That incorrect interpretation must not be repeated or protected by a false-green test.

For each gameplay correction, record the applicable rule numbers and card text, including relevant definitions, exceptions, and timing checkpoints. The reviewer must independently derive the expected behavior. If an authoritative rule conflict remains, stop the affected implementation and request a rules decision rather than inventing a ruling.

The current rules distinguish ordinary Chain closure from Chains opened by triggered abilities or Add abilities. Rules 346 and 346.1 must both be respected. The confirmed initial Combat Chain correction from the previous report remains required, and Issue 16 below protects the ordinary-Chain behavior.

## 3. Source and evidence handling

Use the current project rules reference, authoritative card data, the canonical expansion plan, and the existing project architecture as implementation sources. The updated local rules reference must preserve the project's searchable, one-numbered-rule-per-line structure if a correction to it is necessary.

The attached screenshots and game-state snapshots are evidence of observed behavior. They are not substitutes for a complete authoritative transition or event history. Where a snapshot contradicts the visible symptom, investigate the discrepancy rather than assuming either layer is correct.

The supplied snapshots are:

- `docs/game-state-1.txt` — Ornn selection issue, state version 47.
- `docs/game-state-2.txt` — multi-Equipment Battlefield state, version 129.

Use these files as reproducible evidence through the project's existing diagnostic/test infrastructure where possible. Do not introduce production-only fixture behavior or require support for restoring old persisted matches.

## 4. Shared architecture and UI requirements

### Card-image-first presentation

When a player must choose among cards or card-backed Chain items, the card images are the primary representation. Do not duplicate complete oracle/rules text or redundant card names beneath each image. Short instructions, quantities, selection counts, eligibility indicators, and disabled reasons are appropriate supporting information.

Informational-only reveals must not create an artificial blocking gameplay decision. Public information belongs in the public game log; private information remains visible only to authorized players. Reuse existing card-image presentation patterns, such as Mulligan and Vision, when their contracts satisfy the requirement.

### Authoritative gameplay and typed choices

The server remains authoritative for legality, payment, targeting, destinations, Chain items, effect continuation, and state transitions. The UI must not invent a parallel rules model. Distinguish targets from destinations and preserve the identity of the actual selected game object or Chain item.

### Payment correctness

Auto-payment must use the same authoritative payment and resource semantics as manual payment. It must never silently consume a resource, omit a generated resource, violate a restriction, or commit a payment that differs from the displayed plan. When a meaningful irreversible choice cannot safely be automated, request manual payment. Legal Rune recycling must not be prohibited categorically; the defect is an incorrect payment choice or accounting transition.

### Attachment presentation

A Unit and its attached Equipment should form a coherent physical card group. The preferred default displacement is downward and to the right, while keeping Equipment Might and relevant status information visible. Layout must derive from canonical attachment relationships and must not own gameplay or numeric state.

---

## Issue 01 — Ornn Legend manual Add ability fails

**Category:** Resource abilities / Legend / Regression

**Observed:** Ornn's Legend ability works when auto-payment invokes it, but directly clicking the Legend and attempting to Add Power does not work.

**Expected:** The existing manual resource-activation flow must support the Legend's restricted Add ability. The generated Power is restricted to playing Gear or using Gear abilities, as specified by the card. The previously accepted Kai'Sa, Daughter of the Void ability is an important regression reference.

**Acceptance criteria:**

- Manual activation succeeds when legal, exhausts the Legend, and adds the correct restricted resource.
- The resource is available for eligible payments and rejected for ineligible costs.
- Auto-payment continues to work.
- The UI and server use the same action/resource contract for manual and automatic activation.
- Verify ready, exhausted, eligible, and ineligible scenarios for both Ornn and Kai'Sa without introducing Legend-specific resource implementations.

## Issue 02 — Seal of Focus produces incorrectly restricted Power

**Category:** Resource accounting / Regression

**Observed:** Adding Power through a Seal displays the resulting resource as restricted.

**Expected:** Seal of Focus adds ordinary Calm Power without a Gear-only restriction. Restrictions must derive from the actual source ability and must not leak from Ornn's Legend ability or a previous payment context.

**Acceptance criteria:**

- Manual and automatic Seal activation produce unrestricted Calm Power.
- The resource can be spent on any legal cost requiring that Power.
- Restricted Legend resources retain their restrictions, and mixed restricted/unrestricted pools remain distinguishable and correctly spendable.
- Existing Seal and Rune payment regressions must pass.

**Evidence:** `image-19.png`

## Issue 03 — Veiled Temple asks to detach non-Equipment Gear

**Category:** Conditional effect choice / Card characteristics

**Observed:** Veiled Temple asks the player whether to detach a Gear even when the selected Gear is not Equipment.

**Expected:** The effect first readies the selected friendly Gear. The optional detach choice is available only if that Gear is Equipment. A regular Gear must not receive a meaningless or illegal detach prompt.

**Acceptance criteria:**

- Regular Gear is readied without a detach decision.
- Attached Equipment may be readied and then detached if the player chooses.
- Declining the optional detach preserves the attachment.
- The conditional choice is driven by authoritative characteristics and actual attachment state, not by card names.

**Evidence:** `image-20.png`

## Issue 04 — Seal Add menu is inconsistent with Rune resource menus

**Category:** Shared UI / Resource actions

**Observed:** Seal resource activation uses a different context-menu presentation from the established Rune resource menu.

**Expected:** Resource-producing actions should use a consistent presentation and interaction pattern. The existing Rune menu is the reference for displaying Add options, icons, labels, disabled states, and activation behavior, while preserving the different abilities each source actually has.

**Acceptance criteria:**

- Seals and Runes use the same appropriate shared action-menu infrastructure.
- The UI displays the legal options returned by the server, with consistent resource icons and terminology.
- Seal-specific behavior is not implemented by duplicating the Rune menu.
- No previously accepted Rune action or combined Add option is lost.

**Evidence:** `image-21.png`

## Issue 05 — Clockwork Keeper optional additional cost must be selected before play

**Category:** Optional additional costs / Play actions / UX

**Observed:** After initiating Clockwork Keeper's play, a separate “Choose from Hand” prompt appears for the card itself.

**Expected:** The player should be able to choose the intended play mode from the card's hand context menu. The two options are the ordinary cost of 2 Energy and the optional additional-cost mode of 2 Energy plus 1 Calm Power, which draws a card if paid.

The additional-cost choice is part of playing the card, not a triggered decision after the card has entered play. The UI should make the alternatives clear before payment while preserving the correct server-side finalization sequence.

**Acceptance criteria:**

- Both legal play modes are available through the established card-action presentation.
- The player can select the destination and intended cost mode without being asked to select the same source card again.
- Payment availability is calculated separately for each mode.
- The optional cost is committed at the correct timing checkpoint, and the draw occurs only when that cost was paid.
- Countering or otherwise preventing resolution must not retroactively change the committed payment choice.
- Reuse an existing optional additional-cost subsystem if one exists, or extend the generic play-action contract rather than implementing a Clockwork Keeper-specific UI flow.

**Evidence:** `image-22.png`

## Issue 06 — Ornn Legend does not ready during Awaken

**Category:** Turn phases / Ready / Regression

**Observed:** Ornn's Legend remains exhausted after its controller reaches the Awaken Phase.

**Expected:** During Awaken, the turn player readies all game objects they control that are able to be readied, including their Legend. This previously worked for Kai'Sa, Daughter of the Void.

**Acceptance criteria:**

- Ornn's Legend readies during the correct phase when eligible.
- Exhaustion from its Add ability persists until the next appropriate ready event.
- The ready operation is not delayed until Beginning or dependent on another action.
- Existing restrictions that legitimately prevent readying remain respected.
- Add focused regression coverage for Ornn, Kai'Sa, and representative non-Legend permanents.

**Evidence:** `image-23.png`

## Issue 07 — Effective-cost details should be shown only when meaningful

**Category:** Card action menu / Cost UX

**Observed:** The new cost presentation is useful, but displaying additional cost details on every card makes the context menu unnecessarily dense.

**Expected:** Ordinary, unchanged costs should use the established compact play presentation. When a cost is increased, decreased, or otherwise modified, the menu should clearly expose the effective cost and relevant difference from the printed cost.

**Acceptance criteria:**

- Unmodified cards retain a concise menu.
- Modified costs display the effective amount and an understandable increase or decrease.
- Optional additional costs remain visible as distinct choices when relevant.
- The presentation does not hide information necessary for a meaningful payment decision.
- The server remains authoritative for all cost calculations, and no duplicate frontend cost calculator is introduced.

**Evidence:** `image-24.png`

## Issue 08 — Public reveal presentation must reuse existing card-image patterns

**Category:** Public reveals / UI consistency / Information presentation

**Observed:** The temporary reveal display is functional, but it cannot be closed manually and disappears only after an arbitrary delay. The log uses internal player identifiers instead of player names. The UI also displays card names beneath images, duplicating information already visible on the cards.

**Expected:** Public reveals use a dismissible, non-blocking presentation that follows the established card-image conventions used by Mulligan and Vision. The player must not be forced to wait for a timer or acknowledge an informational-only effect. The complete revealed information must remain available through the public log as appropriate.

For the supplied example, the log should read:

> Scuttle Crab revealed Jonas's hand: Patched Porobot, Brutalizer, Sterak's Gage.

**Acceptance criteria:**

- The reveal surface has an accessible close control and can be dismissed without changing gameplay state.
- It does not create a pending gameplay decision.
- Card images are the primary content, without redundant names or oracle-text panels below them.
- The presentation reuses existing card-image/selection primitives rather than introducing another competing card renderer.
- The log resolves player display names and preserves duplicate card quantities and actual public information.
- Any automatic-dismiss behavior must not be an arbitrary unreviewed timing rule or the only way to close the surface.
- Verify that both players receive the correct information without exposing unrelated private state.

**Evidence:** `image-25.png`, `image-27.png`

## Issue 09 — Ornn, Blacksmith selected card does not appear in hand

**Category:** Look/select/draw / Projection / State synchronization

**Observed:** Ornn, Blacksmith's trigger displays the correct selection UI. The player selects Patched Porobot, but the card does not visibly enter their hand.

**Important evidence:** The supplied snapshot at state version 47 already contains a Patched Porobot in the viewer's hand matching the selected reveal. The log also records the selection and reveal. Therefore, do not assume the server failed to draw the card. The defect may be in projection, client synchronization, animation, or an incorrect interpretation of the final state, and must be investigated from the actual transition.

**Expected:** After selecting an eligible Gear, that exact card is revealed and drawn into the player's hand. Remaining looked-at cards are recycled according to the effect. The UI must reflect the authoritative hand without requiring another action or refresh.

**Acceptance criteria:**

- Reproduce the selection using the supplied snapshot and, if necessary, the preceding state/event history.
- Trace the selected card's identity through the look zone, reveal, draw, and final hand projection.
- Verify the hand count and exact card identity before and after the transition.
- Correct the actual failing layer without adding a second draw or duplicating the card.
- Test the zero-selection/fail-to-find path, one eligible selection, and recycling of the remaining cards.
- Preserve existing Vision/Stacked Deck selection behavior and privacy guarantees.

**Evidence:** `docs/game-state-1.txt`, `image-26.png`

## Issue 10 — Equipment at Base is visually separated from its host

**Category:** Attachment layout / Base presentation

**Observed:** An Equipment card attached to a Unit at Base is rendered too far away from its host.

**Expected:** Host and attached Equipment form a coherent physical group at Base, using the same shared attachment-layout principles as Battlefield presentation. Attached cards should remain close enough to communicate their relationship while exposing relevant Might and status information.

**Acceptance criteria:**

- Base attachments use the canonical attachment relationship and shared grouping layout.
- Movement, attachment, detachment, exhaustion, and multiple Equipment update the group consistently.
- Card previews, context menus, and drag/drop remain accessible.
- Do not implement separate card-specific positioning rules for Base and Battlefield.

**Evidence:** `image-28.png`

## Issue 11 — Detached Equipment remains at Battlefield after the resolving Chain item's Cleanup

**Category:** Detach / Recall / Cleanup / Core engine regression

**Observed:** After Veiled Temple resolves and an Equipment is detached from a Unit at a Battlefield, the Equipment remains displayed at that Battlefield. It only returns to Base after the player passes the turn.

**Expected:** Detachment initially gives the Equipment the same location as its former host. However, the resolving Chain item leaving the Chain requires a Cleanup. During that Cleanup, unattached non-Unit Gear at a Battlefield is recalled. Therefore, the next observable game state after the effect and its required Cleanup must show the Equipment at its controller's Base. No additional player action or turn transition is required.

The transient location during resolution must not be confused with a completed game state. Cleanup cannot occur while a Chain item is resolving, but the required Cleanup becomes an Outstanding Task and must be handled before gameplay continues. This is not a request to teleport Equipment directly to Base as a special rule.

**Rules basis:** Current rules 319.5, 320–323.7, and 435.4–435.4.a. The Hidden Gear exception in 811.1.d.1–811.1.d.1.a provides an additional relevant regression scenario.

**Acceptance criteria:**

- Detaching removes the attachment relationship and its associated Might/effect contribution immediately.
- The detached Equipment initially receives the former host's location as required by the rules.
- The required Cleanup runs after the resolving Chain item leaves the Chain.
- Unattached non-Unit Gear at a Battlefield is recalled to its controller's Base during that Cleanup.
- The resulting server projection shows the Equipment at Base before the next gameplay opportunity; passing the turn must not be necessary.
- The correction uses the generic Cleanup and Recall subsystems, not a Veiled Temple-specific teleport or UI workaround.
- Detaching Equipment at Base, detaching at a Battlefield, multiple attachments, and other effects that create unattached Gear at Battlefields are covered by focused regressions.
- Include a Hidden Gear scenario, such as Zhonya's Hourglass, to verify that Gear played from Hidden follows its required Battlefield play location and is recalled when applicable.
- The independent reviewer verifies the complete resolution → outstanding Cleanup → Recall sequence against the current rules.

**Evidence:** `image-29.png`

## Issue 12 — Reduce attachment displacement for ready Units at Battlefields

**Category:** Attachment layout / Visual refinement

**Observed:** The updated ready-Unit layout is an improvement, but attached Equipment remains too far to the right.

**Expected:** Reduce the horizontal displacement so the host and Equipment visually belong together, while keeping Equipment Might and relevant card information visible.

**Acceptance criteria:**

- Refine shared attachment-layout parameters rather than adding a separate special case.
- The arrangement remains usable for ready and exhausted hosts, one or multiple attachments, and both Base and Battlefield locations.
- Preserve readable Might badges and accessible card interactions.

**Evidence:** `image-30.png`

## Issue 13 — Only one of three attached Equipment cards is visible after movement

**Category:** Attachment rendering / Movement / Projection

**Observed:** A Unit with three attached Equipment cards moves to a Battlefield, but only one Equipment card is visible.

**Confirmed snapshot evidence:** At state version 129, the Sprite at Seat of Power has three attached cards: two Brutalizers and one Sterak's Gage. All three reference the Sprite as their attachment host. The screenshot does not display the full group.

**Expected:** Every canonically attached Equipment card must be represented in the host's visual group. Moving the host must not drop, hide, or collapse attachments unintentionally.

**Acceptance criteria:**

- Reproduce the state using the supplied snapshot.
- Verify the full attachment collection is included in the projection and consumed by the layout.
- Render all three attachments with predictable ordering and accessible interaction.
- Distinguish actual loss of attachment state from rendering, clipping, or stacking problems.
- Tests cover moving a host with multiple attachments between Base and Battlefield, detaching one attachment, and preserving remaining relationships.
- Any Might discrepancy in the snapshot should be investigated through the numeric-modifier subsystem rather than concealed by presentation changes.

**Evidence:** `docs/game-state-2.txt`, `image-31.png`

## Issue 14 — Defy Chain-item selection should use card faces

**Category:** Chain-item decisions / Card-image-first UI

**Observed:** Defy now works mechanically, but selecting the Spell to counter uses a list-style selector with a small card thumbnail.

**Expected:** When a decision is based on choosing a card or card-backed Chain item, use the established card-image selection presentation. The player should be able to inspect and select the actual card face rather than rely on a textual list.

**Acceptance criteria:**

- Defy's legal Chain-item selection uses the shared image-first decision component.
- Eligible and ineligible items are represented clearly, with appropriate disabled states and short supporting instructions.
- Multiple Chain items remain distinguishable and accessible.
- The UI preserves authoritative Chain-item identity and does not confuse the printed card with the particular pending item.
- No new Defy-specific selector is introduced when an existing generic selector can support the required choice.

**Evidence:** `image-32.png`

## Issue 15 — Cloth Armor applies too much defensive Might

**Category:** Shield / Numeric modifiers / Regression

**Observed:** Cloth Armor appears to grant +4 Might during defense when the expected Shield contribution is +2.

**Expected:** Shield 2 contributes +2 Might while the Unit has the Defender designation. Multiple legitimate Shield sources combine according to their values, but the same granted effect must not be applied twice. The attached Equipment's own Might contribution and other independent modifiers must be accounted for separately.

**Rules basis:** Current rules 814.1.c–814.2 and the applicable characteristic-modifier rules. Verify the canonical card definition and all granted abilities before changing the calculation.

**Acceptance criteria:**

- Reproduce the exact state and identify the duplicated or incorrect modifier.
- Confirm the canonical modeling of Cloth Armor's Effect Text and Shield value, including any data-ingestion dependency.
- Calculate the host's Might through the generic characteristic/modifier system and ensure the result matches combat calculations and UI projections.
- Test one Cloth Armor, multiple legitimate Shield sources, non-defending state, attachment/detachment, and the end of the applicable combat duration.
- Verify that modifiers do not remain applied after their conditions cease or after objects change zones.
- Do not hardcode Cloth Armor's expected total Might into the calculation.

**Evidence:** `image-33.png`

## Issue 16 — Ordinary Chain resolution must pass Focus to the next player

**Category:** Core timing / Focus and Priority / Regression

**Observed:** During an open Showdown, a player with Focus plays an Action or Reaction and the Chain resolves. The implementation appears to return Focus to the same player, requiring them to pass Focus manually before the opponent can act.

**Expected:** For an ordinary Chain opened by a player playing a card or activated ability during a Showdown, Focus passes to the next relevant player when the Chain closes. The next player gains Focus and Priority. This is distinct from the exception for Chains opened by triggered abilities or Add abilities.

**Rules basis:** Current rules 346 and 346.1, together with the applicable Focus, Priority, and Chain rules. The general Chain-closing rule must be applied together with its exceptions.

**Acceptance criteria:**

- Reproduce the sequence with a normal Action or Reaction during a Showdown.
- Assert Focus and Priority before the play, during the Chain, and after the final item resolves.
- Verify that the next relevant player gains Focus when the ordinary Chain closes.
- Preserve the previously confirmed initial Combat Chain behavior: the attacker retains Focus after the initial triggered Chain.
- Cover Chains opened by triggered abilities or Add abilities, responses added to an existing Chain, and the normal explicit pass-Focus sequence.
- The implementation must track the applicable Chain origin/semantics rather than applying a blanket “always pass” or “never pass” rule.
- The reviewer must independently validate expected timing from the current rules.

---

## 5. Shared correction boundaries

The reported issues may share underlying causes. Codex should investigate related defects together, but the final implementation must remain organized around the actual reusable subsystem owners.

- Resource and turn-state issues 01, 02, 04, and 06 should be checked against existing Add, payment, action-projection, and ready contracts.
- Optional costs in Issue 05 should use the existing play-finalization and payment flow.
- Issues 08 and 14 should converge on shared card-image presentation rather than separate reveal and Chain selectors.
- Issues 10–13 should use the same attachment state and layout model, with Issue 11 owned by generic Cleanup/Recall behavior.
- Issues 15 and 16 require particular care because they affect fundamental numeric and timing contracts.

These are investigation groupings, not mandatory work-item boundaries. Do not make broad architectural changes merely to group these defects. Use the smallest coherent generic correction that preserves all affected accepted consumers.

## 6. Technical readiness and independent review

Before returning the PR to manual validation, provide a complete correction matrix with each issue's root cause, affected subsystem, code changes, tests, and status. Identify which findings were genuine gameplay regressions, which were presentation defects, and which required a new reusable capability.

Run the focused regression suite for every changed shared subsystem, the full existing test suite, typecheck, lint, production build, `git diff --check`, and the other technical gates required by the canonical plan. If a test expectation changes, document the authoritative rule or approved product decision that justifies it.

The independent reviewer must verify the diff against the pre-PR baseline and previous accepted behavior. The review must specifically check for duplicated subsystems, card-name/set-specific runtime branches, incorrect rules interpretations, weakened tests, and missing dependent regression coverage.

The following contracts require explicit regression evidence when affected:

| Contract | Required coverage |
| --- | --- |
| Restricted and unrestricted Add resources | Ornn, Kai'Sa, Seals, Runes, and mixed resource pools. |
| Manual and automatic payment | Correct source selection, restrictions, resource accounting, and no silent resource loss. |
| Awaken | Legends and other eligible permanents ready at the correct phase. |
| Optional additional costs | Mode selection, payment commitment, draw/effect behavior, and cancellation. |
| Card-image decisions | Mulligan, Vision, look/select, public reveals, and Chain-item selection. |
| Reveal privacy | Correct viewers, public logging, display names, and no artificial blocking decisions. |
| Detach and Recall | Base/Battlefield detachment, next Cleanup, Hidden Gear, and correct post-cleanup projection. |
| Attachments | Multiple cards, movement, detachment, Might, and layout in Base and Battlefield. |
| Shield and modifiers | Correct values, no duplicate application, condition changes, and combat-only contributions. |
| Initial triggered Combat Chain | Attacker retains Focus after the initial Chain. |
| Ordinary Showdown Chain | Focus passes to the next relevant player when the Chain closes. |
| Triggered/Add Chain exceptions | General Focus transfer is suppressed only where the rules require it. |
| Existing accepted consumers | Focused regressions for all actual dependent primitives, including previously validated decks and cards. |

No issue may be marked Fixed solely because code was written, compilation passed, or an isolated test is green. The final report must distinguish implementation readiness from manual acceptance.

## 7. Completion gate

PR 01 remains in the implementation/review correction loop until the issues above and all still-applicable findings from the previous report are resolved. After independent approval, manual validation resumes using fresh matches and the supplied reproduction states where appropriate.

Any defect found during manual validation returns to Codex for correction and then to independent review. Explicit user acceptance remains the only authorization to merge PR 01 and begin PR 02.

The final implementation report must provide a status table for all 16 issues with **Fixed / Requires Rules Decision / Blocked**, including the root cause, changed owner, and validation evidence. Do not claim that the Ornn deck is accepted or complete before explicit user acceptance.
