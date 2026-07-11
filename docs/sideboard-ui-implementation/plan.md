# Sideboarding Feature — Product and Implementation Plan

**Project:** Hextech Riftbound Simulator  
**Status:** Decisions resolved  
**Scope:** Client-side sideboarding feature and its integration contracts  
**Dependency:** Best-of-three match capability exists before this plan is implemented

## 0. Codex execution instructions

These instructions govern how this plan must be implemented.

### One-pass implementation

- Implement the complete plan in one continuous workflow.
- Do not stop at milestones for approval, progress confirmation, or optional refinement.
- The milestones in this document define implementation order only; they are not review gates.
- Do not silently reduce scope, defer a confirmed requirement, or replace a decided behavior with a simpler alternative.

### Assumption stop rule

- Do not invent missing product, rules, data, API, persistence, or architecture decisions.
- Routine implementation choices that are already constrained by the repository architecture, existing conventions, or this document are not blockers; choose the smallest consistent implementation and continue.
- If progress requires a decision that is not resolved by this document or by an existing authoritative project contract, stop the entire implementation before writing code that depends on that assumption.
- When stopping, report:
  1. the exact unresolved decision;
  2. why the implementation cannot safely continue without it;
  3. the affected contracts, files, or workflow stages;
  4. concrete options with trade-offs; and
  5. a recommended option.
- After reporting the blocker, wait for explicit user direction. Do not continue with a provisional assumption.

### Automated testing policy

- Target **zero new automated tests** for this feature.
- Unit, component, integration, snapshot, and end-to-end tests are not implementation deliverables or acceptance gates for this plan.
- Add only the smallest deterministic regression test when a changed stable contract creates a specific, material risk that cannot be reasonably controlled through typing, runtime validation, and manual verification. Such tests must remain exceptional and minimal.
- Do not create broad test suites, UI snapshots, feature integration harnesses, or tests that encode temporary component structure.
- Preserve existing tests unless an intentional contract change requires a focused update.
- **The feature is accepted only through the manual verification matrix and manual gameplay flow described in this document. Automated test results do not constitute acceptance.**

## 1. Purpose

Build an independent sideboarding feature that receives the player’s registered deck and current between-game context, lets the player create a legal deck configuration for the next game, validates that candidate configuration through the shared deck-validation API, and returns one deck-reconfiguration player intent to its host.

The feature does not implement best-of-three progression. It assumes the match layer already knows when sideboarding is available, which game is next, who chooses the next starting player, which Battlefields were used, and what happens after both players submit.

The feature is a match-level workflow, not a board interaction and not a free-form mutation of game state.

```text
BO3 match host
  -> provides SideboardingSessionInput
  -> SideboardingFeature owns a client-local draft
  -> deck-validation API validates the full candidate deck
  -> player submits DeckReconfigurationIntent
  -> BO3 match host/server accepts or rejects the intent
  -> match proceeds to Battlefield setup
```

## 2. Scope boundaries

### In scope

- A full-screen sideboarding interface between games.
- Editing the Main Deck and Sideboard through click controls.
- Replacing the Chosen Champion with a legal Champion Unit.
- Allowing the previous Chosen Champion to be moved into the Main Deck after it is returned to the Sideboard.
- A compact list mode and a visual card-grid mode.
- Persistent card-face presentation for the Champion Legend, Chosen Champion, and all three Battlefields in both editor modes.
- Read-only match context for used Battlefields, remaining Battlefields, and the next starting-player chooser.
- Validation through a separately owned deck-validation API.
- Building and returning a proposed match-level deck-reconfiguration intent.
- Waiting and error states around final submission.

### Out of scope

- Implementing best-of-three match state, set scoring, game creation, or match completion.
- Deciding when sideboarding begins or ends.
- Persisting an unsubmitted sideboarding draft.
- Battlefield selection itself.
- Starting-player selection itself.
- Mulligan.
- Changing the Champion Legend.
- Changing the Rune Deck.
- Changing the registered Battlefield pool.
- Owning deck legality rules inside React or inside the sideboarding feature.
- Revealing the opponent’s exact reconfiguration.
- Recording exact swaps in the public game log.

## 3. Confirmed product decisions

### Match integration

- The feature is built for `1v1 Match`, best-of-three.
- BO3 capability is implemented separately and before this feature.
- After Game 1 or Game 2, the loser of the previous game is the next starting-player chooser.
- Before Game 1, the chooser is determined randomly by the match layer.
- Between games, the sequence is:

```text
Game result
  -> next starting-player chooser is determined and shown
  -> both players sideboard privately
  -> both players choose an unused Battlefield
  -> chooser selects the starting player
  -> mulligans
  -> next game
```

- In Game 3, the match server automatically selects each player’s only remaining unused Battlefield after sideboarding is complete.

### Registered deck and sideboard

- Sideboard size is from 0 to 8 cards.
- An alternative Chosen Champion occupies one of those Sideboard slots.
- The Sideboard may contain only card types that may be placed in the Main Deck: Unit, Gear, and Spell.
- Champion Legends, Battlefields, and Runes cannot be placed in the Sideboard.
- The Champion Legend, Rune Deck, and three registered Battlefields remain fixed throughout the match.

### Active next-game configuration

- The active Main Deck is exactly 40 cards when the Chosen Champion is included.
- Because the Chosen Champion is represented separately, the editable Main Deck section contains exactly 39 cards and the Chosen Champion slot contains exactly 1 card.
- The official core rule says **at least 40**, not exactly 40. Exact 40 is therefore an explicit Hextech match-format policy, not a direct core-rules requirement.
- Reconfiguration is effectively one-for-one at submission because the final active deck must remain exactly 40 and the registered card pool cannot change.

### Chosen Champion changes

- A legal Champion Unit may become the new Chosen Champion.
- The new Chosen Champion must have a Champion tag matching the Champion Legend.
- The current Chosen Champion is moved into the Sideboard as part of changing the slot.
- The player may subsequently move that former Chosen Champion from the Sideboard into the Main Deck through the normal click interaction.
- A legal Champion Unit already in the Main Deck may also be selected as the Chosen Champion in a later sideboarding session.
- The Rune Deck remains unchanged, so the resulting deck must also be legal with the fixed Rune Deck.
- The selected Chosen Champion remains private until the next game’s setup reveals it.

### Draft and submission behavior

- The draft exists only in client state until final submission.
- Reconnecting or reloading before submission discards the draft.
- Each player sees their own complete draft.
- The opponent sees only editing/ready status.
- “No changes” is a valid submission.
- A submitted reconfiguration cannot be undone.
- The Game 3 editing baseline is the configuration used for Game 2.
- **Reset to registered deck** restores the original pre-match registered configuration, not the configuration at the beginning of the current sideboarding session.

### Interaction model

- Main Deck and Sideboard use left-click movement.
- Left-clicking a Main Deck card moves one copy to the Sideboard.
- Left-clicking a Sideboard card moves one copy to the Main Deck.
- Changing the Chosen Champion uses an explicit `Set as Chosen Champion` control rather than overloading the normal left-click behavior.
- Main Deck and Sideboard support compact-list and card-grid views.
- Legend, Chosen Champion, and Battlefield cards always show their card faces in both modes.

## 4. Rules and validation interpretation

The deck-validation API owns these rules. The sideboarding feature only presents their results.

### Core-rules requirements

The local rules establish:

- One Champion Legend.
- A Main Deck of at least 40 cards including one Chosen Champion.
- The Chosen Champion must be a Champion Unit with a Champion tag matching the Champion Legend.
- Up to three copies of the same named card, including the Chosen Champion.
- Main Deck cards must follow the Champion Legend’s Domain Identity.
- No more than three Signature cards, and every Signature card must have the Champion tag matching the Champion Legend.
- Exactly twelve Rune cards.
- Rune cards must follow the Domain Identity of the Chosen Champion.
- Three registered Battlefields for 1v1 Match, with a different unused Battlefield chosen after each game.

### Hextech match-format policies

The following are project-defined because the local core rules do not define a Sideboard and specify only a minimum Main Deck size:

- Exactly 40 active cards including the Chosen Champion.
- Sideboard capacity from 0 through 8.
- Sideboard types limited to Unit, Gear, and Spell.
- Copy limits calculated across Chosen Champion, Main Deck, and Sideboard.
- The registered Signature-card pool is limited to three total Signature cards across Chosen Champion, Main Deck, and Sideboard, and all must match the Champion Legend tag.
- Runes and registered Battlefields cannot be changed between games.

### Validation domains

The validation service must not use one broad domain check for every section.

- Main Deck, Chosen Champion, and Sideboard candidates are checked against the Champion Legend’s Domain Identity.
- Rune Deck legality is checked against the selected Chosen Champion as required by rule 103.3.a.1.
- The unchanged Rune Deck must be revalidated when the Chosen Champion changes.
- Battlefields are checked according to the Battlefield/domain rules but are immutable during sideboarding.

### Canonical identity

Copy limits must use a canonical gameplay-name identity, not display labels, set codes, art variants, or raw imported names. Alternate-art printings of the same gameplay card must count toward the same three-copy limit.

This responsibility belongs to deck validation and catalog normalization, not to the sideboarding UI.

## 5. Discovery findings from the current code

The current code already contains useful foundations:

- `src/server/deck/types.ts` recognizes `Legend`, `Champion`, `Runes`, `Battlefields`, `MainDeck`, and `Sideboard`.
- Runtime sources already include `sideboard`.
- `src/server/deck/validator.ts` already validates Champion compatibility, type placement, copy limits, Domain Identity, and Signature cards.
- `src/server/game/schemas.ts` preserves Sideboard entries in deck snapshots.

The existing implementation is not yet the required authoritative deck-validation surface:

- It enforces a minimum active Main Deck size rather than exactly 40.
- It does not enforce the Sideboard limit of 0–8.
- Its Domain Identity function applies the Champion Legend identity broadly to all sections, while Rune validation needs to respect the Chosen Champion rule separately.
- Its Signature loop currently includes every deck entry; the final service should make registered-pool and active-configuration policies explicit rather than relying on incidental iteration.
- `src/server/game/catalog.ts` builds runtime deck snapshots after parsing and catalog checks but does not call the full deck validator.
- The existing runtime card ID contains the original source section. A card moved from Sideboard to Main Deck should not require changing its immutable registered identity.

### Required identity correction before integration

Sideboarding must operate on stable **registered card-copy IDs**, not current in-game instance IDs whose identity embeds `mainDeck`, `champion`, or `sideboard`.

Recommended separation:

```ts
type RegisteredCardCopy = {
  registeredCardId: string; // immutable for the whole match
  cardCode: string;
  canonicalName: string;
};

type DeckConfiguration = {
  chosenChampionRegisteredCardId: string;
  mainDeckRegisteredCardIds: string[];
  sideboardRegisteredCardIds: string[];
};
```

The BO3 layer may create fresh per-game runtime instances from this configuration. The sideboarding feature must not depend on how those game instances are created.

## 6. Feature contract

The feature should be mounted by a match-level host and communicate through explicit inputs and callbacks.

```ts
type SideboardingFeatureProps = {
  session: SideboardingSessionInput;
  validateDeck: (
    candidate: DeckValidationRequest,
    signal?: AbortSignal,
  ) => Promise<DeckValidationResponse>;
  onIntent: (intent: DeckReconfigurationIntent) => Promise<IntentResult>;
};
```

This keeps the feature reusable by local and online match hosts and prevents route, socket, or persistence concerns from entering presentation components.

### Session input

```ts
type SideboardingSessionInput = {
  matchId: string;
  playerId: string;
  gameNumber: 2 | 3;
  expectedIntermissionVersion: number;

  originalRegisteredDeck: RegisteredDeckConfiguration;
  currentDeckConfiguration: MutableDeckConfiguration;
  registeredCardPool: RegisteredCardCopy[];
  cardsByCode: Record<string, SideboardingCardView>;

  context: {
    previousGameWinnerPlayerId: string;
    previousGameLoserPlayerId: string;
    nextStartingPlayerChooserId: string;
    usedBattlefieldRegisteredCardIds: string[];
    remainingBattlefieldRegisteredCardIds: string[];
    nextBattlefieldMode: "player-choice" | "server-auto";
  };

  opponentStatus: "editing" | "submitted";
};
```

`originalRegisteredDeck` and `currentDeckConfiguration` are intentionally separate:

- The editor starts from `currentDeckConfiguration`.
- `Reset to registered deck` restores `originalRegisteredDeck`.

### Mutable draft

Only three sections are editable:

```ts
type MutableDeckConfiguration = {
  chosenChampionRegisteredCardId: string;
  mainDeckRegisteredCardIds: string[];
  sideboardRegisteredCardIds: string[];
};
```

The fixed Legend, Rune Deck, and Battlefield pool come from the registered deck and are merged into the candidate only for validation.

### Proposed intent

The feature returns a complete desired configuration, not a list of swaps.

```ts
type DeckReconfigurationIntent = {
  kind: "submitDeckReconfiguration";
  matchId: string;
  expectedIntermissionVersion: number;
  configuration: {
    chosenChampionRegisteredCardId: string;
    mainDeckRegisteredCardIds: string[];
    sideboardRegisteredCardIds: string[];
  };
};
```

Reasons for submitting the full desired state:

- It is idempotent.
- It does not depend on click order.
- It handles “no changes” naturally.
- It is easier to revalidate authoritatively.
- It avoids reconstructing final state from a potentially incomplete delta.
- It gives stale-version protection a clear boundary.

The intent deliberately omits Legend, Runes, and Battlefields so the client cannot request changes to fixed sections through this API.

## 7. Deck-validation API ownership and contract

Deck validation is a separate domain capability.

### Recommended ownership

```text
src/shared/deck-validation.ts
  transport schemas and DTO types

src/server/deck/
  parser and normalized deck model
  rules/policy validation
  canonical-name resolution
  validation issue creation

src/app/api/decks/validate/route.ts
  thin HTTP adapter

src/features/sideboarding/api/
  client adapter only
```

The sideboarding feature must not own or duplicate these rules.

### Request

```ts
type DeckValidationRequest = {
  deck: {
    legendRegisteredCardId: string;
    chosenChampionRegisteredCardId: string;
    mainDeckRegisteredCardIds: string[];
    runeDeckRegisteredCardIds: string[];
    battlefieldRegisteredCardIds: string[];
    sideboardRegisteredCardIds: string[];
  };
  policy: "riftbound-1v1-match";
};
```

The server resolves every registered ID against the player’s registered pool. It must not trust card metadata supplied by the browser.

### Response

```ts
type DeckValidationResponse = {
  legal: boolean;
  fingerprint: string;
  reasons: Array<{
    code: string;
    message: string;
    section?:
      | "legend"
      | "chosenChampion"
      | "mainDeck"
      | "runeDeck"
      | "battlefields"
      | "sideboard";
    registeredCardId?: string;
    canonicalName?: string;
  }>;
  summary: {
    activeCardCount: number;
    mainDeckCount: number;
    sideboardCount: number;
    signatureCount: number;
  };
};
```

`reasons` is the stable UI-facing replacement for thrown validation strings. Codes should remain machine-readable while messages remain suitable for players.

### UI validation behavior

- Every draft mutation creates a deterministic candidate fingerprint.
- The feature calls the validation API after draft changes using a small debounce.
- The previous request is aborted when a newer draft is created.
- A response is applied only when its fingerprint matches the current draft.
- The Submit action is enabled only when the latest matching response is `legal: true`.
- A validation-network failure does not erase the draft; it disables submission and exposes retry.
- The server handling the final intent always validates again. A previous UI validation is not authorization.

The UI may calculate immediate non-authoritative presentation values such as displayed counts and whether the Sideboard is visibly full. It must not reproduce the complete legality engine.

## 8. Client draft model

Use a reducer or pure transition module rather than distributing mutation logic through components.

### Suggested actions

```ts
type SideboardingDraftAction =
  | { type: "moveMainDeckCopyToSideboard"; registeredCardId: string }
  | { type: "moveSideboardCopyToMainDeck"; registeredCardId: string }
  | { type: "setChosenChampion"; registeredCardId: string }
  | { type: "resetToRegisteredDeck" }
  | { type: "replaceFromServer"; configuration: MutableDeckConfiguration };
```

### Transition behavior

#### Main Deck to Sideboard

- Move exactly one registered copy.
- Ignore the action when that copy is not currently in the Main Deck.
- Do not silently discard another Sideboard card when capacity is reached.
- The UI may block the click immediately when the Sideboard already contains eight cards.

#### Sideboard to Main Deck

- Move exactly one registered copy.
- Temporary Main Deck counts above or below the legal amount are allowed while drafting.
- Authoritative validation and Submit gating prevent an invalid final configuration.

#### Set Chosen Champion

- The source copy may currently be in the Sideboard or Main Deck.
- It must represent a Champion Unit in the UI model before the control is shown.
- Remove the selected copy from its current section.
- Move the previous Chosen Champion into the Sideboard.
- Put the selected copy into the Chosen Champion slot.
- Do not automatically place the old Champion into the Main Deck.
- The player can left-click the former Champion afterward to move it from Sideboard to Main Deck.
- If the operation cannot preserve a coherent draft because the selected copy is invalid or missing, do nothing and surface no optimistic mutation.
- Final Champion tag, domains, Rune compatibility, copy limits, and Signature legality come from the validation API.

#### Reset

- Replace the entire draft with the original registered configuration.
- Do not reset to the configuration used in the previous game.
- Clear the currently selected inspector card only when that card no longer exists in a visible editable section.

## 9. UX structure

### Screen hierarchy

```text
SideboardingScreen
  Header
    match score / next game
    next starting-player chooser
    opponent status
    editor mode toggle

  Persistent deck identity
    Champion Legend card face
    Chosen Champion card face
    three Battlefield card faces with used/remaining state
    fixed Rune Deck summary

  Editing workspace
    Main Deck editor
    card inspector / preview
    Sideboard editor

  Validation and action footer
    active deck count
    Sideboard count
    legality summary
    Reset to registered deck
    Submit / No changes
```

### Desktop layout

Use a full-screen game-flow surface with independent internal scrolling rather than placing the editor in a conventional modal.

Recommended layout:

- Sticky header with next-game context and view controls.
- Persistent identity region showing card faces for Legend, Chosen Champion, and Battlefields.
- Main workspace with Main Deck as the largest region and Sideboard as the secondary region.
- A fixed or sticky card inspector that updates on hover, focus, or selection in compact mode.
- Sticky footer for counts, validation, Reset, and Submit.

The layout must use `min-h-0` and scoped scroll containers so it remains usable on shorter displays such as 1512×982.

### Compact-list mode

- Group Main Deck and Sideboard by card type, then canonical name.
- Show quantity, compact cost metadata, name, and relevant type/domain indicators.
- Hover/focus updates the inspector card face.
- Left-click moves one copy between sections.
- Rows for eligible Champion Units expose `Set as Chosen Champion` as a distinct secondary control.
- The current Chosen Champion is not duplicated as an editable row unless another registered copy exists in Main Deck or Sideboard.

### Card-grid mode

- Render card-face thumbnails with quantity badges.
- Main Deck and Sideboard remain visibly separate.
- Left-click moves one copy.
- Hover/focus/selection can open a larger preview without changing the card.
- Eligible Champion Units expose a clear Champion action affordance that does not conflict with the left-click move behavior.

### Persistent deck identity

These faces remain visible in both modes:

- Champion Legend: fixed and read-only.
- Chosen Champion: prominent, with a changed-state indicator when different from the original registration.
- Three Battlefields: fixed pool, with each card marked `Used`, `Available`, or `Auto-selected for Game 3`.

The sideboarding screen does not permit Battlefield selection. It only explains what the next setup step will use.

### Match-context messaging

The screen must clearly state:

- The next game number.
- The previous game result.
- Which player will choose who starts next.
- That the chooser identity is known but the starting player has not yet been selected.
- Which Battlefields have already been used.
- Which Battlefields remain eligible.
- Whether Game 3’s remaining Battlefield will be selected automatically.

### Actions

- Primary action: `Submit sideboard`.
- When the draft equals the current configuration, the button may read `Submit no changes` while producing the same intent kind.
- Secondary action: `Reset to registered deck`.
- Reset must not appear destructive because it affects only an unsubmitted local draft.
- Use the project’s shadcn-based semantic game-action button patterns and existing keyboard-binding conventions for final CTA presentation.

## 10. Privacy and information rules

### Private to the player

- Registered Main Deck and Sideboard contents.
- Current draft.
- Exact cards moved.
- Selected next-game Chosen Champion before next-game setup reveals it.
- Validation reasons that expose the player’s cards.

### Visible to the opponent

- Sideboarding phase is active.
- The player is editing or has submitted.
- No exact card, quantity, Champion, or swap information.

### Logs

A public match event may say that a player completed sideboarding. It must not contain:

- Cards moved in or out.
- Chosen Champion changes.
- Quantity changes.
- Validation failures.

## 11. Feature architecture

Recommended feature boundary:

```text
src/features/sideboarding/
  sideboarding-screen.tsx
  sideboarding-types.ts
  sideboarding-view-model.ts
  sideboarding-draft-reducer.ts
  build-deck-reconfiguration-intent.ts
  build-deck-validation-request.ts
  use-sideboarding-draft.ts
  use-sideboarding-validation.ts

  components/
    sideboarding-header.tsx
    deck-identity-panel.tsx
    chosen-champion-card.tsx
    battlefield-status-card.tsx
    main-deck-editor.tsx
    sideboard-editor.tsx
    compact-card-list.tsx
    card-grid.tsx
    card-inspector.tsx
    validation-summary.tsx
    sideboarding-actions.tsx
    sideboarding-waiting-state.tsx

  api/
    validate-deck.ts
```

### Ownership rules

- `sideboarding-screen.tsx` orchestrates the feature but does not contain deck rules.
- `sideboarding-draft-reducer.ts` owns local edit transitions.
- `build-deck-validation-request.ts` merges fixed and editable sections into a full candidate.
- `use-sideboarding-validation.ts` owns debounce, abort, fingerprint, pending, failure, and stale-response handling.
- `build-deck-reconfiguration-intent.ts` creates the final full-state intent.
- `components/*` render and dispatch semantic draft actions.
- `src/server/deck` remains the only owner of legality.
- The BO3 match host remains the owner of phase transitions, opponent readiness, submission transport, and post-submit navigation.

### Relationship to Player Decision System

Do not place this feature inside `src/features/game-board/decisions` or render it through `PlayerDecisionHost`.

Sideboarding is a match-level, multi-edit workflow with an unsubmitted local draft. It should return one match-level `DeckReconfigurationIntent` to the BO3 host. This preserves the intent-driven architecture without turning the game-board decision host into a second match-flow orchestrator.

## 12. Submission lifecycle

### Editing

- Initialize the draft from the current next-game configuration.
- Start validation immediately so “No changes” can become submit-ready.
- Opponent status can update independently without resetting the draft.

### Submitting

- Disable all editing controls.
- Build the full-state deck-reconfiguration intent.
- Submit with `expectedIntermissionVersion`.
- The server verifies phase ownership, player authorization, registered-card membership, uniqueness of registered IDs, exact section partition, and complete deck legality.

### Accepted

- Clear the local draft.
- Show a locked waiting screen if the opponent has not submitted.
- Do not allow undo.
- When the match projection advances, unmount the sideboarding feature and allow Battlefield setup to render.

### Rejected

- Re-enable editing when the sideboarding phase remains active.
- Preserve the draft for ordinary validation or transient server errors.
- On stale version, refetch the match-level projection.
- If refetch shows that the submission was already accepted, transition to waiting rather than resubmitting.
- If the phase has advanced, discard the draft and leave the feature.

## 13. Implementation milestones

These milestones define build order only. Codex must continue through them in one pass and must not pause for approval between milestones unless the assumption stop rule in Section 0 is triggered.

### Milestone 1 — Contracts and integration seam

- Add shared sideboarding DTOs and schemas.
- Define `SideboardingSessionInput`.
- Define the proposed `DeckReconfigurationIntent`.
- Define stable registered card-copy identity.
- Build pure intent and validation-request builders.
- Add a development fixture host that can render the feature without a complete BO3 server.

**Exit criteria:** The feature can receive a representative Game 2/Game 3 session and emit a deterministic full-state intent.

### Milestone 2 — Authoritative deck-validation API

This is a prerequisite capability owned outside the feature.

- Expose deck validation as a thin API route over `src/server/deck`.
- Return `legal`, `reasons`, summary, and fingerprint.
- Add exact-40 and Sideboard 0–8 policies.
- Separate Legend-domain, Chosen-Champion/Rune-domain, Signature, type-placement, and copy-limit rules.
- Validate canonical gameplay names across alternate printings.
- Ensure game deck-snapshot creation uses the same authoritative validation service rather than a parallel subset.

**Exit criteria:** Registered decks and reconfigured candidates receive the same rule evaluation and stable reason codes.

### Milestone 3 — Local draft engine

- Implement the reducer.
- Implement one-copy left-click movement.
- Implement Chosen Champion replacement.
- Implement Reset to registered deck.
- Derive counts and changed-state indicators.
- Permit transient invalid drafts without losing edits.

**Exit criteria:** Every confirmed editing behavior is deterministic and framework-independent.

### Milestone 4 — Compact editor

- Build the full-screen shell.
- Render persistent Legend, Chosen Champion, Battlefield, and Rune summary.
- Build Main Deck and Sideboard compact lists.
- Add card inspector.
- Add match-context and opponent-status presentation.
- Add Reset and Submit actions using semantic game buttons.

**Exit criteria:** The entire workflow is usable without grid mode.

### Milestone 5 — Validation integration

- Validate initial and changed drafts.
- Add debounce, request abort, and fingerprint matching.
- Render rule reasons by section/card where available.
- Disable Submit while invalid, pending, stale, or unavailable.
- Revalidate on final server submission.

**Exit criteria:** No invalid configuration can be submitted through the normal UI, and stale validation cannot unlock Submit.

### Milestone 6 — Grid mode and visual polish

- Add list/grid toggle for Main Deck and Sideboard.
- Preserve persistent card faces in both modes.
- Add card quantity badges and Champion action affordances.
- Validate short-height and wide-screen layouts.
- Add loading placeholders and image-failure fallbacks.

**Exit criteria:** Both modes share the same reducer and produce identical intents.

### Milestone 7 — BO3 host integration

- Mount from the match intermission projection.
- Submit through the BO3 match-level intent transport.
- Show locked waiting state after acceptance.
- Preserve privacy in opponent projections and logs.
- Hand off to Battlefield setup after both submissions.
- Display Game 3 automatic-Battlefield context.

**Exit criteria:** A complete Game 1 → sideboard → Game 2 and Game 2 → sideboard → Game 3 flow works without the feature owning match progression.

## 14. Manual verification strategy

This feature has no automated acceptance gate. The expected implementation adds no automated tests unless the narrow exception in Section 0 applies.

Validation during implementation should rely on:

- TypeScript strict-mode feedback.
- Existing Zod and transport-schema validation.
- The authoritative deck-validation API.
- Existing lint and build commands.
- Focused manual interaction testing through the complete sideboarding workflow.

Passing existing automated checks only confirms that the repository still builds and that previously protected behavior has not regressed. It does not accept this feature.

### Manual verification matrix

#### Draft editing

- Empty Sideboard and no-change submission.
- Eight-card Sideboard.
- Attempting to move a ninth card into the Sideboard is blocked without silently moving another card.
- Multiple copies split between Main Deck and Sideboard.
- Main Deck and Sideboard counts may be temporarily illegal while editing.
- Reset restores the original registered deck rather than the configuration used in the previous game.
- Game 3 begins from the Game 2 configuration, while Reset still restores the original registration.

#### Chosen Champion

- Alternative Champion selected from Sideboard.
- Alternative Champion selected from Main Deck in Game 3.
- Previous Chosen Champion moves to Sideboard.
- Previous Chosen Champion can then be moved into Main Deck.
- Invalid Champion tag is rejected by deck validation.
- A Champion incompatible with the fixed Rune Deck is rejected by deck validation.
- Champion changes remain private until the next game setup reveals them.

#### Deck legality

- Exact active count of 40 is required by the Hextech Match policy.
- Active counts of 39 and 41 remain unsubmitable.
- Sideboard counts from 0 through 8 can be submitted when otherwise legal.
- Legend, Battlefield, and Rune cards cannot enter the Sideboard.
- Combined copy limits include Chosen Champion, Main Deck, and Sideboard.
- Alternate-art copies count as the same canonical card name.
- Signature-card tag and total-count failures are presented from the validation API.
- Unknown, duplicated, or out-of-pool registered card IDs are rejected by final server validation.
- A stale validation response never enables Submit for a newer draft.
- A validation-network failure preserves the draft, disables Submit, and exposes retry.

#### Submission and privacy

- No-change submission emits the same full-state intent kind as a changed configuration.
- The emitted intent contains only Chosen Champion, Main Deck, and Sideboard registered IDs plus match concurrency data.
- The final server submission revalidates the complete candidate.
- Current player submits first and sees a locked waiting state.
- Opponent submits first and only readiness status becomes visible.
- Submitted configuration cannot be undone.
- Exact swaps, card quantities, and Champion changes never appear in public logs or opponent projection.
- Reload before submission loses the local draft and restores the current server configuration.
- Reload after accepted submission shows the locked waiting state.
- A stale submission response refetches match state without duplicating the commit.

#### BO3 handoff

- Game 2 shows used and remaining Battlefield context.
- The previous game loser is shown as the next starting-player chooser.
- The screen makes clear that chooser identity is known while the actual starting player has not yet been selected.
- After both sideboarding submissions, control returns to Battlefield setup.
- Game 3 shows that the only remaining Battlefield will be selected automatically by the server.
- The feature never mutates match score, creates games, chooses Battlefields, chooses the starting player, or performs mulligan behavior.

#### UI modes and layout

- Compact and grid modes use the same draft and produce identical final intents.
- Legend, Chosen Champion, and all three Battlefield faces remain visible in both modes.
- Left-click moves one card copy between Main Deck and Sideboard.
- `Set as Chosen Champion` does not also trigger normal card movement.
- Submit remains disabled while validation is pending, unavailable, stale, or illegal.
- All editing controls are disabled after accepted submission.
- The workflow remains usable at 3440×1440 and 1512×982.
- Internal scrolling does not hide the persistent identity cards, legality state, or final actions.

## 15. Manual acceptance criteria

The feature is complete only after the following criteria have been confirmed through manual testing. Automated tests, build success, lint success, and type-check success are supporting signals only and do not constitute acceptance.

The feature is manually accepted when:

1. It can be mounted with a BO3 sideboarding session without importing game-board interaction modules.
2. It starts from the current between-game deck configuration.
3. It can restore the original registered deck through an explicit Reset action.
4. The player can move individual copies between Main Deck and Sideboard through left click.
5. The player can set a legal Champion Unit as the draft Chosen Champion through a distinct control.
6. The former Chosen Champion enters Sideboard and may then be moved into Main Deck.
7. Legend, Chosen Champion, and all Battlefields remain face-visible in compact and grid modes.
8. Runes and Battlefields cannot be edited.
9. Used and remaining Battlefields and the next starting-player chooser are visible as read-only context.
10. The candidate is validated by the separately owned deck-validation API.
11. Validation errors are displayed without reproducing rule logic inside the UI.
12. Submit is available only for the latest authoritatively legal candidate.
13. No-change submission is supported.
14. Submission returns one full-state deck-reconfiguration intent.
15. After acceptance, editing is permanently locked for that intermission.
16. The opponent sees only readiness status.
17. Exact reconfiguration details never appear in public logs.
18. The feature hands control back to the BO3 host for Battlefield setup.

## 16. Primary implementation risks

### Registered identity versus runtime identity

Current runtime IDs encode their source section. Reusing them for sideboarding would make identity change when a card changes sections. Resolve this with stable match-level registered card-copy IDs before wiring the feature to BO3.

### Parallel validation paths

The current game catalog builder and deck validator do not form one authoritative pipeline. If sideboarding uses a stronger API than match creation, a deck could be accepted in one path and rejected in another. Consolidate validation ownership before production use.

### Chosen Champion and fixed Rune Deck

Changing the Chosen Champion can invalidate an unchanged Rune Deck. The feature must present this as a normal validation result rather than treating Champion-tag compatibility as the only eligibility rule.

### Canonical copy identity

Card names from imported datasets may include alternate-art labels. Copy limits and Signature rules must use canonical gameplay identity or players may bypass limits by mixing print variants.

### Stale async validation

Rapid clicks can produce responses out of order. Fingerprint every candidate and never enable Submit from a response that does not match the current draft.

### Hidden-information leakage

Do not reuse the owner’s sideboarding projection for opponent readiness. The opponent needs a separate projection that contains status only.

## 17. Final architecture summary

```text
BO3 match projection
  -> SideboardingSessionInput
  -> SideboardingScreen
      -> local reducer owns temporary edits
      -> validation-request builder creates full candidate
      -> deck-validation API owns legality
      -> validation response gates submission
      -> intent builder creates full desired mutable state
  -> DeckReconfigurationIntent
  -> BO3 host/server revalidates and commits
  -> opponent sees ready status only
  -> Battlefield setup begins
```

The critical boundary is deliberate: **the sideboarding feature owns editing experience; the deck-validation service owns legality; the BO3 match layer owns progression and persistence.**
