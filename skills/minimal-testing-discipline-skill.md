# Skill: Minimal Testing Discipline

## Purpose

Use this skill when implementing or refactoring features in the Riftbound simulator where the behavior is still being validated manually, especially when the change touches player prompts, choice flows, game-board UI, game projection mapping, or game-engine integration.

The goal is to avoid spending excessive implementation time and token budget on integration tests that only describe the current incomplete implementation and are likely to be discarded immediately after manual testing exposes the real issue.

This skill does not remove testing. It limits testing to the minimum useful coverage for the current implementation phase.

## Core rule

Do not create broad integration tests by default.

During this phase, integration tests are only allowed when they protect a stable contract that is already understood beyond the current implementation details.

Most issues in this area are expected to be found through manual gameplay testing because the game engine, projection model, and player decision flows are still being refined.

## Current project context

The Riftbound simulator has complex gameplay flows where UI prompts build intents that are sent to the server.

The current implementation work is focused on refactoring player choice prompts into a Player Decision System. This includes centralizing how player decisions are detected, rendered, and submitted, while preserving existing visual surfaces such as card selection prompts, option prompts, combat damage prompts, and pending decision status.

Because these flows are still being validated, tests that mirror the current implementation too closely are risky. They often encode temporary assumptions, increase token usage, and are likely to be deleted or rewritten after manual testing.

## Testing policy

When implementing this feature or related refactors:

1. Prefer type safety, focused validation, and manual testing over broad integration test suites.
2. Add the smallest possible test only when it protects a stable behavior.
3. Do not create integration tests just because a new component, hook, mapper, or branch was added.
4. Do not test implementation details that are likely to change during the refactor.
5. Do not create tests that only prove the current UI arrangement renders.
6. Do not create tests that duplicate manual gameplay validation.
7. Do not create temporary integration tests unless explicitly asked.

## Allowed tests

Use limited tests for stable, low-level behavior such as:

- Pure mapper functions that convert projection/actions into a `PlayerDecisionRequest`.
- Intent-building helpers that produce the payload sent to the server.
- Small utility functions with deterministic input and output.
- Type guards that protect uncertain projection shapes.
- Regression tests for bugs that were already confirmed through manual testing.
- Tests for stable API contracts that should not change as UI components evolve.

These tests should be small, direct, and cheap to maintain.

## Avoid these tests

Do not create tests for:

- Full game-board integration flows unless explicitly requested.
- Large interaction scenarios that depend on current UI layout.
- Temporary prompt behavior that is still being discussed or manually validated.
- Current implementation details of `GameBoard`.
- Styling-only changes.
- Glass UI rendering details.
- Hover previews, animation timing, card movement, or visual layout unless a stable bug fix requires it.
- Integration tests that recreate the full player choice loop without proving a stable contract.

## Preferred validation flow

For this implementation phase, use this validation order:

1. Ensure TypeScript passes.
2. Ensure linting passes if linting is available and already part of the project workflow.
3. Add or update only minimal deterministic tests when they protect stable behavior.
4. Provide a concise manual testing checklist for gameplay flows affected by the change.
5. Let manual testing identify real gameplay and UX issues before expanding automated coverage.

## Manual testing checklist requirement

When skipping or limiting tests, provide a short manual testing checklist that covers the affected gameplay flows.

For the Player Decision System, the checklist should include only flows touched by the change, such as:

- Selecting a card from hand.
- Selecting a card from trash.
- Resolving Vision by recycling a selected card.
- Resolving Vision by keeping the revealed card on top.
- Ordering triggered abilities.
- Assigning combat damage.
- Seeing pending-choice feedback while the opponent is choosing.

Do not expand this checklist beyond the changed scope.

## Before adding an integration test

Before adding an integration test, answer these questions internally:

- Is this behavior stable beyond the current implementation?
- Would this test still be valid if the prompt UI changes but the decision intent stays the same?
- Does this test protect a real contract, or does it only describe the current component tree?
- Is this cheaper than validating the behavior manually right now?
- Has this issue already been confirmed as a regression or stable requirement?

If the answer is not clearly yes, do not add the integration test.

## Expected output behavior

When implementing code under this skill, the LLM should:

- Keep automated tests minimal.
- Explain briefly when tests were intentionally limited.
- Provide a manual testing checklist instead of broad integration coverage.
- Avoid creating speculative tests.
- Avoid creating disposable tests that only match the current uncertain implementation.
- Preserve existing tests unless they are directly obsolete because of the refactor.
- Update existing stable tests when necessary instead of adding new broad ones.

## Example guidance

Good:

> I added a small test for the pure decision mapper because it protects the stable contract between projection state and `PlayerDecisionRequest`. I did not add a full GameBoard integration test because the prompt UI is still being manually validated.

Bad:

> I added integration tests for every prompt branch in GameBoard, including Vision, trash selection, trigger ordering, pending status, and combat damage rendering.

Good:

> I did not add new tests for the glass UI refactor. The change is visual and should be validated manually.

Bad:

> I added snapshot tests for the glass prompt layout and card grid markup.

## Final rule

Tests should protect stable decisions and contracts, not temporary implementation shape.

When in doubt, write less test code, keep the change easier to review, and provide a clear manual testing checklist.
