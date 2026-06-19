# Riftbound Simulator Behavior Validation — Product Definition

## Document Purpose

This document defines the product direction for extracting, suggesting, validating, and using card behavior in a Riftbound simulator.

The goal is to avoid implementing each card as isolated custom logic. Instead, the product should analyze the full available card pool, identify reusable behavior patterns, suggest behaviors for every card, and allow admins to validate selected cards before they become usable by the game engine.

This is a product definition, not a technical implementation specification. It describes what the product should support, why the approach is valid, what the first validation workflow should achieve, and how approved card behavior should become available for gameplay.

---

## Core Product Direction

The Riftbound simulator should be built around a reusable behavior model.

Card text, abilities, game effects, and rule-driven behavior should be interpreted through a set of reusable behavior families:

- Actions that directly change the game state.
- Triggers that react to game events.
- Modifiers that change rules, values, permissions, costs, card properties, or targeting.
- Replacement and prevention effects that alter what would happen before it resolves.
- Conditions, choices, costs, and selectors that define when and how behavior is valid.

The product should not assume that every verb in card text is a direct action. Some verbs directly mutate the game state, while others express timing, restrictions, replacement behavior, permissions, static effects, or conditional rules.

The strongest product hypothesis is:

> Riftbound card behavior can be represented as structured, reusable behavior definitions. The system should analyze the entire card base, suggest behavior definitions for all cards, allow admins to validate selected cards, persist approved behavior definitions, and make only approved cards available for gameplay simulation.

---

## MVP Direction

The MVP is not a reduced behavior catalog.

The MVP is the first validation workflow.

The product must analyze the full card base and generate behavior suggestions for all cards. The smaller card set used during the first implementation phase is only a controlled validation and gameplay test batch.

This distinction is important:

- The behavior catalog is informed by the entire available card pool.
- The suggestion process should run across all imported cards.
- Admin validation can start with a smaller uploaded JSON file.
- Only cards approved by admin validation become available to the game engine.
- Gameplay testing with a small approved set is used to improve the catalog, validation flow, and engine behavior.

The small card set is not the behavior scope. It is the first practical validation set.

---

## Intended First Validation Workflow

The first product workflow should follow this sequence:

1. Import and analyze the entire available card base.
2. Generate suggested behavior definitions for every card with rules text.
3. Allow a user or admin to upload a smaller JSON file containing selected cards for validation.
4. Import the selected cards and mark them as pending validation.
5. Present the suggested behavior definitions for each selected card.
6. Allow an admin to review, adjust, approve, reject, or flag suggested behaviors.
7. Persist the approved behavior definition for each validated card in the database.
8. Make approved cards available to the game engine.
9. Use real gameplay tests with the validated card set.
10. Use test results to improve behavior suggestions, validation quality, catalog coverage, and engine behavior.

The product should support learning from each validation cycle. When a behavior pattern is validated for one card, that validated pattern should help improve suggestions for similar cards.

---

## Product Scope

### In Scope

The product should support full-card-base behavior analysis and suggestion.

The behavior catalog should include all recurring behavior families identified in the card pool, including common and uncommon behavior types.

The following behavior families are in scope:

- Direct game actions.
- Event-based triggers.
- Static modifiers.
- Temporary modifiers.
- Conditional modifiers.
- Cost modifiers.
- Entry-state modifiers.
- Targeting restrictions.
- Replacement effects.
- Prevention effects.
- Delayed effects.
- Activated abilities.
- Player choices.
- Optional effects.
- Conditional fallback effects.
- Per-turn or per-effect memory.
- Timing rules.
- Target validation.
- Source-based behavior.
- Game logs and explainability.
- Admin validation of behavior suggestions.
- Persistence of approved card behavior definitions.

### Out of Scope for the First Validation Workflow

The first validation workflow does not require every card to be immediately approved for gameplay.

The first workflow does not require every suggested behavior to be fully executable by the engine on day one.

However, unsupported or not-yet-executable behavior should still be detected, represented, and flagged. The product should not hide unsupported behavior or replace it with inaccurate simplified behavior.

---

## Data Analysis Summary

The hypothesis was validated against three uploaded set files:

- OGN
- OGS
- SFD

The analysis included 656 total cards.

| Set | Cards | Cards with text | Textless cards | Cards with action payload | Cards with triggers | Cards with modifiers or restrictions | Cards with replacements | Cards with activated abilities | Cards with conditions | Cards with choices |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| OGN | 352 | 332 | 20 | 307 | 154 | 249 | 12 | 59 | 104 | 150 |
| OGS | 24 | 24 | 0 | 19 | 7 | 19 | 1 | 1 | 5 | 11 |
| SFD | 280 | 280 | 0 | 266 | 142 | 216 | 9 | 69 | 107 | 156 |
| Total | 656 | 636 | 20 | 592 | 303 | 484 | 22 | 129 | 216 | 317 |

Important note: these categories overlap. A single card may include an action, a trigger, a condition, a modifier, and a choice at the same time.

The analysis strengthens the product hypothesis because most cards with rules text contain recognizable reusable behavior patterns. It also confirms that actions alone are not enough. Triggers, modifiers, choices, conditions, restrictions, and replacement behavior must be part of the model.

---

## Key Findings from the Card Corpus

### Actions Are Highly Reusable

The card base repeatedly uses a common action vocabulary.

Examples of recurring actions include:

- Play
- Draw
- Move
- Ready
- Exhaust
- Channel
- Deal damage
- Kill
- Banish
- Discard
- Recycle
- Return
- Recall
- Buff
- Stun
- Attach
- Detach
- Score
- Reveal
- Look

This supports a product model where cards reuse a shared action catalog rather than each card requiring isolated custom behavior.

### Triggers Are Common and Need Event-Based Handling

Many cards react to something happening in the game.

Common trigger patterns include:

- When a card is played.
- When a unit moves.
- When a unit dies.
- When a player conquers a battlefield.
- At the end of a turn.
- At the start of a phase.
- When Equipment is attached.
- When a friendly unit is buffed.

This supports the trigger hypothesis. The game should produce events, and active card behaviors should react to relevant events.

### Modifiers Are Core Behavior, Not Edge Cases

A large part of the card base changes how the game behaves instead of simply performing an immediate action.

Examples include:

- Increasing the points needed to win.
- Changing Might or Power while a condition is true.
- Making a card unable to be chosen by enemy spells or abilities.
- Making tokens enter ready.
- Reducing or increasing costs.
- Granting keywords.
- Changing how scoring works.
- Changing legal targets.
- Changing entry state.

This means modifiers must be treated as a first-class product behavior family.

### Replacement and Prevention Effects Are Less Frequent but Critical

Replacement and prevention effects appear less often than direct actions and triggers, but they are essential for correct gameplay.

These effects often use language such as “would,” “instead,” or “prevent.” They change what would normally happen before it resolves.

Because these effects can override normal game behavior, they should be supported explicitly rather than hidden inside custom card logic.

### Choices and Conditions Are Required

Many cards require a player choice, a legal target, an optional decision, or a condition.

Examples include:

- Choose a unit.
- Choose one effect.
- If a condition is true, apply one behavior.
- If the player cannot perform an action, perform a fallback behavior.
- While a condition is true, apply a modifier.
- If a card has a specific type, perform an additional action.

The product should not model only the final result. It must also model who chooses, what can be chosen, when the choice is legal, whether the effect is optional, and what happens when a condition is not satisfied.

---

## Product Behavior Families

### 1. Actions

Actions are behaviors that directly change the current game state.

Examples include drawing cards, moving units, readying runes, exhausting cards, channeling runes, dealing damage, killing units, attaching Equipment, recycling cards, and scoring points.

Each action requires additional information to be valid. For example:

- Drawing requires a player and an amount.
- Moving requires a source object and a destination.
- Channeling requires a player, an amount, and whether the runes enter ready or exhausted.
- Dealing damage requires an amount and one or more targets.
- Readying requires one or more valid targets.

Product expectation:

- The system should maintain a reusable action catalog.
- Card behavior suggestions should reference known actions when possible.
- Admins should be able to confirm whether the suggested action matches the card text.
- The game engine should execute only approved action behavior.

### 2. Triggers

Triggers are behaviors that react to game events.

A trigger does not directly change the game state by itself. It waits for a relevant game event and then creates or schedules an effect.

Examples include effects that happen when a card is played, when a unit moves, when a unit dies, when a battlefield is conquered, or at the end of a turn.

Product expectation:

- The game should emit relevant gameplay events.
- Active card behavior should be checked against those events.
- Matching triggers should create the appropriate effect.
- Triggered behavior should be visible in game logs.
- Admin validation should identify the trigger event and the effect produced by that trigger.

### 3. Modifiers

Modifiers change how the game behaves.

They may affect values, rules, permissions, costs, targeting, entry state, keywords, or card properties.

A modifier may be permanent while its source is active, temporary for a turn, conditional while a requirement is true, or tied to a future event.

Product expectation:

- Base game values should remain separate from effective values created by modifiers.
- The engine should evaluate relevant modifiers when checking rules, costs, targets, stats, or win conditions.
- Modifiers should explain why a value or rule changed.
- Admin validation should classify modifier behavior separately from direct actions.

### 4. Replacement and Prevention Effects

Replacement and prevention effects change what would happen before it happens.

They are different from normal actions because they intercept or alter an expected event, rule, or outcome.

Product expectation:

- The behavior catalog should include replacement and prevention behavior.
- Cards using “would,” “instead,” or “prevent” language should be suggested as replacement or prevention candidates.
- Admin validation should confirm what event is being replaced or prevented.
- The engine should not treat replacement behavior as a simple action sequence.

### 5. Conditions

Conditions determine whether a behavior applies.

Examples include effects that depend on rune count, battlefield control, card type, current phase, previous choices, or whether another action could be completed.

Product expectation:

- Behavior suggestions should identify conditions separately from the behavior they enable.
- Admins should be able to confirm whether the condition is correct.
- The game engine should only apply behavior when its condition is satisfied.

### 6. Choices

Choices require a player or the system to select a target, mode, card, or option.

Examples include choosing a unit, choosing one effect, choosing cards from a revealed group, or choosing targets at a battlefield.

Product expectation:

- The system should identify when card behavior requires a choice.
- The valid choice options should be clear to the admin and the player.
- The system should prevent illegal choices.
- Choice-based behavior should be recorded in game logs.

### 7. Costs and Additional Costs

Some behavior depends on a cost being paid.

Costs may be part of playing a card, activating an ability, hiding a card, equipping an item, or gaining an additional effect.

Product expectation:

- Costs should be represented separately from the effect they enable.
- Cost modifiers should be supported.
- Optional additional costs should be visible during validation and gameplay.
- The engine should confirm whether costs are payable before allowing the related behavior.

### 8. Delayed Effects and Memory

Some card behavior creates a future effect or depends on something that already happened earlier in the turn.

Examples include effects that happen at the end of the turn, effects that remember a choice already made this turn, or effects that apply to the next card played.

Product expectation:

- The product should support delayed behavior.
- The product should support per-turn and per-effect memory.
- Delayed and remembered behavior should be visible in admin review and game logs.

---

## Product Examples

### Aspirant’s Climb

Aspirant’s Climb increases the points needed to win the game by 1.

Product interpretation:

- This is not a normal action.
- This is a rule modifier.
- The base points needed to win should not be permanently changed.
- While Aspirant’s Climb is active, the effective points needed to win should be higher.
- If the source stops applying, the modifier should stop applying.

Product category:

- Modifier
- Rule change
- Source-based continuous effect

Expected product behavior:

- The card should be suggested as a victory-score modifier.
- Admin validation should confirm the modifier target and value.
- Once approved, win-condition checks should use the modified value.
- Game logs should be able to explain why the victory requirement is higher.

### Dark Child - Starter

Dark Child - Starter has an effect that readies 2 runes at the end of the controller’s turn.

Product interpretation:

- This is a triggered ability.
- The trigger event is the end of the controller’s turn.
- The triggered effect readies valid rune targets.

Product category:

- Trigger
- Action payload

Expected product behavior:

- The card should be suggested as an end-of-turn trigger.
- Admin validation should confirm the trigger timing and ready-runes effect.
- Once approved, the game should emit the relevant event and process the effect.

### Tasty Faefolk

Tasty Faefolk has death-related behavior that channels runes and draws a card.

Product interpretation:

- This is a triggered ability tied to the card’s own death.
- The triggered effect performs a sequence of actions.

Product category:

- Trigger
- Action sequence

Expected product behavior:

- The card should be suggested as a death trigger.
- The suggested behavior should include channel and draw actions.
- Admin validation should confirm the sequence.
- Once approved, the game engine can use the behavior during gameplay.

### Mobilize

Mobilize channels 1 rune exhausted. If the player cannot, they draw 1.

Product interpretation:

- This includes an action and a fallback behavior.
- The fallback depends on whether the first action could be completed.

Product category:

- Action
- Conditional fallback

Expected product behavior:

- The card should be suggested as a channel action with a fallback draw.
- Admin validation should confirm the fallback condition.
- Game logs should show whether the main action or fallback was used.

### Aphelios, Exalted

Aphelios, Exalted reacts when Equipment is attached and asks the player to choose one available option that has not already been chosen this turn.

Product interpretation:

- This is a triggered ability.
- It requires a player choice.
- It requires per-turn memory.
- Each option maps to a behavior that the simulator should understand.

Product category:

- Trigger
- Choice
- Per-turn restriction
- Action payload

Expected product behavior:

- The card should be suggested as an equipment-attachment trigger.
- The validation interface should show the available options and the per-turn restriction.
- Once approved, the engine should present only legal choices during gameplay.

---

## Admin Validation Product Experience

### Importing Source Cards

The system should import raw card data from set JSON files.

The imported data should include card identity, set information, classification, attributes, tags, text, and media references.

### Full-Card-Base Suggestion

After import, the system should analyze the full card base and generate behavior suggestions for all cards with rules text.

The suggestion process should identify:

- Actions.
- Triggers.
- Modifiers.
- Replacement effects.
- Prevention effects.
- Costs.
- Choices.
- Conditions.
- Timing.
- Targeting requirements.
- Unsupported or ambiguous behavior.

### Small Card Set Upload for Validation

After the full-card-base behavior analysis exists, an admin should be able to upload a smaller JSON file containing selected cards.

Those selected cards should be imported and marked for validation.

This small file is not used to define the full behavior catalog. It is used to select the first practical group of cards that will go through review, approval, and gameplay testing.

### Card Validation Status

Each card should have a clear validation status.

Suggested statuses:

- Imported.
- Behavior suggested.
- Pending admin validation.
- Validated.
- Partially supported.
- Unsupported behavior.
- Requires engine support.
- Rejected suggestion.

### Admin Review Actions

During review, an admin should be able to:

- Confirm suggested behaviors.
- Reject incorrect suggestions.
- Adjust behavior categories.
- Add missing behavior.
- Mark behavior as unsupported.
- Add validation notes.
- Compare similar cards.
- See why a behavior was suggested.
- Approve the final behavior definition.

### Persistence After Approval

After a card is fully validated, its approved behavior definition must be persisted in the database.

The validated behavior definition becomes the source of truth for gameplay simulation.

The database should preserve:

- The raw imported card text.
- The suggested behavior data.
- The approved behavior definition.
- Validation status.
- Admin notes.
- Unsupported behavior flags, when applicable.
- The relationship between the card and behavior catalog entries.
- Version or audit information for future review.

### Engine Availability

The game engine should only use cards with approved behavior definitions.

A card that has been imported but not validated should not be treated as gameplay-ready.

A card with unsupported behavior may remain in the catalog and validation backlog, but it should not be available for normal automated gameplay unless explicitly allowed for testing.

---

## Behavior Catalog Requirements

The behavior catalog is a product foundation.

It should be built from the entire available card pool, not only from the first small validation set.

Each behavior entry should include:

- Behavior name.
- Behavior family.
- Description.
- Required information.
- Optional information.
- Timing requirements.
- Targeting requirements.
- Related card examples.
- Known edge cases.
- Admin validation notes.
- Engine support status.

The catalog should include every recurring behavior pattern found in the analyzed card base, even if some behaviors are not immediately executable by the engine.

Unsupported behavior should be visible and actionable, not hidden.

---

## Gameplay Testing Direction

After a small selected card set is validated, those cards should be used in a real game test.

The goal of the gameplay test is not only to test the cards. It is also to test the quality of the behavior model.

Gameplay testing should help answer:

- Did the approved behavior produce the expected game result?
- Were triggers emitted at the correct time?
- Were modifiers applied only while valid?
- Did replacement effects correctly alter expected outcomes?
- Were choices presented clearly?
- Were illegal choices prevented?
- Did logs explain what happened?
- Did the admin validation miss any behavior details?
- Did the behavior catalog need new categories or refinements?

Findings from gameplay should feed back into:

- Behavior suggestions.
- Admin validation UI.
- Behavior catalog definitions.
- Engine support backlog.
- Test scenarios.

---

## Product Requirements

### Functional Requirements

The product must:

- Analyze the full card base.
- Generate suggested behaviors for all cards with rules text.
- Support upload of a smaller selected card JSON for validation.
- Mark selected uploaded cards as pending validation.
- Present suggested behavior for admin review.
- Allow admins to approve, adjust, reject, or flag behavior.
- Persist approved card behavior definitions in the database.
- Make only approved cards available to the game engine.
- Track unsupported and partially supported behavior.
- Support gameplay testing with approved cards.
- Use validation and gameplay results to improve the catalog.

### Data Requirements

The product must store:

- Imported card data.
- Card text.
- Suggested behavior categories.
- Suggested behavior definitions.
- Approved behavior definitions.
- Validation status.
- Admin notes.
- Engine support status.
- Unsupported behavior flags.
- Related behavior catalog entries.
- Historical validation or update information.

### Quality Requirements

The product should prioritize:

- Rules correctness.
- Comprehensive behavior discovery.
- Admin control.
- Consistency across similar cards.
- Explainability.
- Reusability.
- Safe handling of unsupported behavior.
- Clear separation between suggested and approved behavior.
- Reliable persistence of validated behavior.

---

## Success Criteria

The product is successful when:

- The full card base receives behavior suggestions.
- Behavior suggestions cover actions, triggers, modifiers, replacements, choices, costs, and conditions.
- Admins can validate selected cards without writing custom implementation for each card.
- Approved cards are persisted in the database.
- The game engine can use approved cards in gameplay.
- Unapproved cards are not accidentally used by the game engine.
- Similar cards receive consistent behavior suggestions.
- Unsupported behavior is clearly flagged.
- Gameplay testing provides useful feedback to improve the catalog and engine.
- The product can grow toward full card-base support without restarting the behavior model.

---

## Product Risks and Mitigations

### Risk: Treating the Small Card Set as the Real Scope

The small card set is only the first validation batch. If the product is designed only around that set, the behavior catalog may become too narrow.

Mitigation:

- Analyze the entire card base before or during the first validation workflow.
- Build the catalog from full-card-base patterns.
- Use the small set only as the first validation and gameplay test group.

### Risk: Treating Every Verb as a Direct Action

Some verbs describe modifiers, triggers, restrictions, or replacement behavior rather than direct mutations.

Mitigation:

- Keep separate behavior families for actions, triggers, modifiers, replacements, conditions, costs, and choices.
- Use admin validation to correct wrong suggestions.

### Risk: Poor Suggestions Increase Admin Burden

If suggestions are inaccurate, admins may need to perform too much manual correction.

Mitigation:

- Group similar cards by behavior pattern.
- Reuse validated patterns.
- Show why each behavior was suggested.
- Improve the suggestion process after gameplay testing.

### Risk: Unsupported Behavior Gets Ignored

Some real cards may require behavior the engine does not yet support.

Mitigation:

- Represent unsupported behavior explicitly.
- Track it as requiring engine support.
- Prevent unsupported cards from being treated as gameplay-ready.

### Risk: Approved Behavior Becomes Stale

Validated behavior may need correction after testing or rule clarification.

Mitigation:

- Store validation metadata.
- Keep history or versioning for approved behavior.
- Allow revalidation when a behavior is corrected.

---

## Final Product Position

The Riftbound simulator should not be built as a collection of one-off card implementations.

The product should analyze the entire card base and build a comprehensive behavior catalog from real cards.

The first MVP is not a smaller behavior model. The first MVP is a validation workflow that uses a selected small card set to prove the process.

The intended product flow is:

- Analyze the full card pool.
- Suggest behaviors for all cards.
- Upload a smaller selected card JSON for validation.
- Mark selected cards as pending validation.
- Let admins review and approve suggested behavior.
- Persist validated behavior definitions in the database.
- Make approved cards available to the game engine.
- Test those cards in real gameplay.
- Use the test results to improve the catalog, validation process, and engine behavior.

This direction preserves the long-term goal of full card-base support while still allowing practical early testing through a controlled, validated card set.
