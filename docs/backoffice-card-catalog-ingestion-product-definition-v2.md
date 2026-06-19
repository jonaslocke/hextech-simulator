# Backoffice Card Catalog Ingestion and Behavior Validation

## 1. Product Summary

The Backoffice Card Catalog Ingestion and Behavior Validation feature allows an administrator to upload Riftbound card set JSON files, review suggested canonical card groupings, validate cosmetic card variants, inspect generated behavior drafts, edit those drafts through structured controls or raw JSON, and persist approved catalog and behavior records to the database.

This feature is an admin-only preparation pipeline. It does not replace or modify the current game engine runtime behavior in the first implementation.

The current game engine continues to use its existing hardcoded runtime behavior. The new backoffice pipeline creates the future source of truth for normalized card catalog data and approved runtime behavior definitions.

## 2. Problem Statement

The current simulator depends on a card catalog loaded from JSON files and a game engine that implements card behavior through hardcoded card-specific runtime logic.

This approach creates long-term scalability issues:

- Every new card requires custom code or a custom resolver path.
- Repeated effects such as drawing cards, changing Might, dealing damage, channeling runes, or moving units are not represented as reusable behavior primitives.
- Card text is available in source JSON files, but the game engine should not interpret raw card text at match runtime.
- Card variants and alternate arts appear as separate JSON records, even when they represent the same gameplay card.
- Administrators need a controlled way to review and validate card identity grouping and behavior suggestions before those definitions become part of the simulator's approved catalog.

## 3. Product Goal

Create an isolated backoffice feature that supports administrator-driven catalog ingestion and behavior validation.

The feature should:

1. Accept a JSON card set upload from an administrator.
2. Parse the uploaded cards using the existing JSON card format.
3. Suggest canonical gameplay cards and cosmetic variants.
4. Require explicit administrator validation before any group becomes a catalog record.
5. Generate behavior drafts by scanning card text across the uploaded set.
6. Suggest behavior using reusable primitives when possible.
7. Mark uncertain, partial, or unsupported behavior as requiring manual review.
8. Allow administrators to edit behavior using both a structured form and a raw JSON editor.
9. Persist approved canonical cards and approved behavior versions to the database.
10. Keep the current game engine unchanged until a later runtime integration phase.

## 4. Non-Goals

The first version must not:

- Replace the current game engine runtime behavior.
- Make the game engine read approved database behavior yet.
- Auto-publish canonical card groups.
- Auto-approve generated behavior drafts.
- Treat scraped card text as executable truth.
- Persist the full raw imported JSON payload.
- Guarantee full automation for every card in a set.
- Require every imported card to be fully playable.
- Solve every complex card behavior pattern in the first iteration.

## 5. Users

### Primary User

Administrator.

The administrator is responsible for:

- Uploading card set JSON files.
- Reviewing suggested canonical card groups.
- Removing incorrectly suggested variants.
- Validating catalog records.
- Reviewing generated behavior drafts.
- Editing behavior drafts.
- Approving behavior versions.
- Marking cards as unsupported, vanilla, not playable, or blocked by missing engine capability.

### Non-User

End player.

This feature is not exposed to final users or match players.

## 6. Architecture Boundary

The feature must be implemented as an isolated feature and should not change the current game engine in the first phase.

Suggested structure:

```txt
src/features/card-catalog-admin/
src/server/card-catalog-admin/
src/app/admin/card-catalog/
src/app/api/admin/card-catalog/
```

The current game engine remains under:

```txt
src/server/match/
```

The backoffice feature may produce approved records that the game engine can consume later, but there should be no runtime dependency in this phase.

## 7. Source JSON Handling

The source JSON file is treated as import input, not as runtime data.

The system should validate that the uploaded file contains card records in the expected shape, including fields such as:

- `id`
- `name`
- `riftbound_id`
- `public_code`
- `collector_number`
- `attributes`
- `classification`
- `text`
- `set`
- `media`
- `tags`
- `orientation`
- `metadata`

The full raw imported JSON should not be persisted as a runtime or permanent catalog collection.

However, the system may persist minimal import-run metadata for traceability.

Recommended import-run metadata:

```ts
type CardImportRun = {
  id: string;
  setCode: string;
  uploadedFileName: string;
  sourceFileHash: string;
  importedAt: string;
  importedBy: string;
  totalCardsRead: number;
  canonicalGroupsSuggested: number;
  variantsSuggested: number;
  warnings: string[];
};
```

## 8. Canonical Card Identity

The simulator should use a canonical gameplay card code based on set expansion and card number.

Example:

```txt
OGN-095
```

This code represents the gameplay card identity.

Cosmetic variants, alternate arts, overnumbered cards, and signature appearances should be attached as variant definitions under the canonical gameplay card.

## 9. Canonical Card Grouping Rule

Canonical card groups must never be auto-published.

When an administrator uploads a card set JSON file, the system may suggest canonical card groups and variant relationships, but those groups remain in a pending/suggested state until explicitly validated by an administrator.

The grouping suggestion rule is:

1. The canonical/base card candidate is the card where:
   - `metadata.alternate_art === false`
   - `metadata.overnumbered === false`
   - `metadata.signature === false`

2. Variant candidates are cards from the same import/set with the exact same `name` as the canonical/base card candidate.

3. The system does not compare rules text, attributes, tags, classification, or image data to determine whether cards belong together.

4. If a suggested variant is incorrect, the administrator is responsible for removing it from the suggested group before approval.

5. Only after administrator approval should the system persist the canonical card and its variants as validated catalog records.

## 10. Card Grouping Statuses

```ts
type CardGroupingStatus =
  | "suggested"
  | "validated"
  | "rejected";
```

Business rule:

```txt
Only validated card groups are eligible to become canonical catalog cards.
Suggested groups are review artifacts, not playable catalog records.
```

## 11. Canonical Card Record

A validated canonical card should represent the gameplay card.

Suggested shape:

```ts
type CanonicalCard = {
  cardCode: string;
  name: string;
  cleanName: string;
  setCode: string;
  collectorNumber: number;
  classification: {
    type: string;
    supertype: string | null;
    rarity: string;
    domain: string[];
  };
  attributes: {
    energy: number | null;
    might: number | null;
    power: number | null;
  };
  text: {
    plain: string;
    rich: string;
  };
  tags: string[];
  defaultImageUrl: string;
  variants: CardVariant[];
  catalogStatus: "draft" | "validated" | "published";
};
```

## 12. Card Variant Record

A card variant represents a cosmetic or printing-specific appearance of a canonical gameplay card.

Suggested shape:

```ts
type CardVariant = {
  variantCode: string;
  sourceRiftboundId: string;
  publicCode: string;
  imageUrl: string;
  artist?: string;
  alternateArt: boolean;
  overnumbered: boolean;
  signature: boolean;
};
```

The canonical/base card image should be the default image unless the application later supports user-selected variants.

## 13. Behavior Suggestion Goal

The behavior suggester should scan card text across the imported set and propose reusable behavior drafts.

The behavior suggester should not be card-specific. It must not treat one sample card, such as Stupefy, as the only actionable card.

The correct expectation is:

```txt
The suggester scans the full uploaded set and identifies repeated text patterns, keywords, triggers, verbs, targets, values, and unresolved clauses.
```

The output is a draft for administrator review, not executable truth.

## 14. Behavior Suggestion Scope

The behavior suggester should attempt to identify broad behavior families across the uploaded set, including but not limited to:

- Action timing
- Reaction timing
- Keyword abilities
- Draw effects
- Discard effects
- Discard then draw effects
- Might modification
- Fixed damage
- Damage equal to Might
- Stun
- Ready
- Recall
- Return to hand
- Banish
- Counter spell
- Channel runes
- Play token units
- Play token gear
- Enter ready
- When played triggers
- When moved triggers
- When attacking triggers
- When defending triggers
- When conquering triggers
- When holding triggers
- Beginning phase triggers
- Equipment attachment
- Equipment detachment
- Cost reduction
- Replacement-style effects
- Unresolved/manual-review clauses

The suggester should create partial drafts when possible and explicitly mark unresolved clauses instead of silently dropping unsupported behavior.

## 15. Behavior Draft Principle

A behavior draft is not approved runtime behavior.

A behavior draft is a review artifact that may contain:

- suggested timing
- suggested targets
- suggested effects
- detected keywords
- detected triggers
- unresolved clauses
- manual review notes
- parser confidence
- support status

Suggested shape:

```ts
type BehaviorDraft = {
  id: string;
  cardCode: string;
  sourceText: string;
  detectedKeywords: string[];
  detectedTriggers: string[];
  detectedClauses: string[];
  suggestedBehavior: RuntimeBehavior | null;
  unresolvedClauses: string[];
  confidence: "high" | "medium" | "low";
  status: BehaviorDraftStatus;
  reviewerNotes?: string;
};
```

## 16. Behavior Draft Statuses

```ts
type BehaviorDraftStatus =
  | "not_generated"
  | "generated"
  | "needs_review"
  | "approved"
  | "rejected"
  | "manually_authored"
  | "blocked_by_engine_capability";
```

## 17. Runtime Support Status

A card's future runtime availability should be explicit.

```ts
type RuntimeSupportStatus =
  | "fully_supported"
  | "vanilla_supported"
  | "not_playable"
  | "blocked_by_missing_engine_capability"
  | "needs_behavior_review";
```

Intended meaning:

```txt
fully_supported:
  The card has approved behavior and can eventually be exposed with normal play options.

vanilla_supported:
  The card can be played using base game rules but has no special effect.

not_playable:
  The card should not expose play options in automated runtime.

blocked_by_missing_engine_capability:
  The card behavior is understood or partially understood, but the engine lacks required primitives or rules support.

needs_behavior_review:
  The card has not been reviewed enough to publish behavior.
```

Important distinction:

- Unsupported units may be marked as vanilla/no-effect if the administrator explicitly allows it.
- Unsupported spells, gear, or activated abilities should generally be marked as not playable unless a safe behavior is approved.

## 18. Behavior Editing Requirements

The administrator must be able to edit behavior in two ways.

### Structured Form

The structured form should support common primitives and reduce the need to hand-write engine JSON.

Suggested first primitives:

- draw cards
- discard cards
- modify Might
- deal damage
- damage equal to Might
- kill unit
- ready card
- stun card
- recall unit
- move unit
- return card to hand
- banish card
- channel runes
- play tokens
- attach equipment
- detach equipment
- create modifier
- manual review placeholder

### Raw JSON Editor

The raw JSON editor is a power-user escape hatch.

It should:

- Allow direct editing of the behavior draft.
- Validate the JSON shape against the runtime behavior schema.
- Prevent approval if the JSON is invalid.
- Prevent approval if unresolved `manualReview` steps remain, unless the administrator explicitly marks the card as blocked or not playable.

## 19. Runtime Behavior Record

Approved behavior should be persisted as immutable versions.

Suggested shape:

```ts
type CardRuntimeBehavior = {
  cardCode: string;
  behaviorVersion: number;
  engineSchemaVersion: number;
  behaviorHash: string;
  supportStatus: RuntimeSupportStatus;
  behavior: RuntimeBehavior;
  status: "approved";
  approvedBy: string;
  approvedAt: string;
};
```

If approved behavior changes later, the system should create a new behavior version instead of overwriting the existing version.

## 20. Future Match Snapshot Requirement

When the game engine eventually consumes approved runtime behavior, match creation should snapshot the behavior version used.

Suggested future shape:

```ts
type MatchCardBehaviorSnapshot = {
  cardCode: string;
  behaviorVersion: number | null;
  behaviorHash: string | null;
  supportStatus: RuntimeSupportStatus;
};
```

This prevents future behavior fixes from changing old match interpretation or replay behavior.

## 21. Admin Workflow

### Upload Set JSON

1. Administrator opens the card catalog admin page.
2. Administrator uploads a JSON set file.
3. System validates the file shape.
4. System creates an import run.
5. System proposes canonical groups and variants.

### Validate Card Groups

1. Administrator reviews suggested groups.
2. Administrator removes incorrect variants if needed.
3. Administrator validates or rejects each group.
4. Validated groups become eligible for canonical catalog persistence.
5. Suggested groups are never automatically published.

### Generate Behavior Drafts

1. System scans the uploaded set's card text.
2. System identifies known patterns and behavior families.
3. System creates behavior drafts.
4. Unclear behavior is preserved as unresolved/manual-review content.
5. Drafts are attached to canonical card candidates.

### Review Behavior Drafts

1. Administrator opens a card's behavior draft.
2. Administrator reviews suggested timing, targets, effects, and unresolved clauses.
3. Administrator edits via structured form or raw JSON.
4. Administrator chooses one of:
   - approve behavior
   - reject suggestion
   - mark vanilla/no-effect
   - mark not playable
   - mark blocked by missing engine capability
   - leave as needs review

### Persist Approved Records

1. Approved canonical cards are persisted to the catalog.
2. Approved behavior is persisted as immutable behavior version records.
3. Current game runtime remains unchanged.

## 22. API Requirements

Suggested admin API surface:

```txt
POST   /api/admin/card-catalog/imports
GET    /api/admin/card-catalog/imports/:importRunId
PATCH  /api/admin/card-catalog/imports/:importRunId/groups/:groupId
GET    /api/admin/card-catalog/canonical-cards
GET    /api/admin/card-catalog/behavior-drafts/:draftId
PATCH  /api/admin/card-catalog/behavior-drafts/:draftId
POST   /api/admin/card-catalog/behavior-drafts/:draftId/approve
```

All endpoints are admin-only.

## 23. UI Requirements

The UI should be implemented as an isolated feature using Tailwind/shadcn-style components.

The page should support:

- JSON upload
- import summary
- grouping review
- canonical card preview
- variant list
- variant removal
- group validation/rejection
- behavior draft preview
- behavior confidence display
- unresolved clause display
- structured behavior editor
- raw JSON editor
- approve/reject/block actions
- approved behavior version display

## 24. Persistence Requirements

The feature should persist:

```txt
card_import_runs
canonical_cards
card_behavior_drafts
card_runtime_behaviors
```

The feature should not persist full raw imported card payloads as a permanent runtime data source.

## 25. Testing Requirements

Tests should cover:

- JSON import shape validation.
- Canonical card grouping by metadata flags.
- Variant suggestion by exact card name.
- Groups are not auto-published.
- Admin can remove variants from suggested groups.
- Admin can validate groups.
- Behavior drafts are generated for patterns beyond a single sample card.
- Stupefy is not the only actionable card.
- The suggester scans all uploaded cards in a set.
- Manual-review steps are created for unresolved behavior.
- Behavior with unresolved manual-review steps cannot be approved as fully supported.
- Approved behavior creates immutable versions.
- Current game engine tests remain unchanged.

## 26. Acceptance Criteria

### Catalog Import

```txt
Given an administrator uploads a valid card set JSON file,
when the file is processed,
then the system creates an import run and suggests canonical card groups.
```

```txt
Given an uploaded card has metadata.alternate_art=false,
and metadata.overnumbered=false,
and metadata.signature=false,
when card groups are generated,
then the card is suggested as the canonical/base card for its exact name.
```

```txt
Given other uploaded cards have the same exact name as a canonical/base card,
when card groups are generated,
then those cards are suggested as variants of the canonical/base card.
```

```txt
Given a suggested group exists,
when no administrator has validated it,
then the group must not be published as a canonical catalog card.
```

### Group Validation

```txt
Given a suggested group contains an incorrect variant,
when the administrator removes that variant,
then the variant is not persisted under the validated canonical card.
```

```txt
Given an administrator validates a suggested group,
when the group is saved,
then the system persists a canonical card with its approved variants.
```

### Behavior Drafting

```txt
Given a validated canonical card has card text,
when behavior suggestions are generated,
then the system scans the card text and creates a behavior draft.
```

```txt
Given a card text contains known behavior patterns,
when the behavior draft is generated,
then the system suggests corresponding reusable behavior primitives.
```

```txt
Given a card text contains behavior that cannot be safely interpreted,
when the behavior draft is generated,
then the system creates unresolved/manual-review content instead of silently dropping it.
```

```txt
Given an imported set contains many cards,
when behavior suggestions are generated,
then the system should not limit actionable suggestions to one sample card or one hardcoded card name.
```

### Behavior Approval

```txt
Given a behavior draft has unresolved manual-review steps,
when an administrator attempts to approve it as fully supported,
then the system prevents approval until the unresolved steps are fixed or the card is marked with another support status.
```

```txt
Given an administrator edits behavior through the raw JSON editor,
when the JSON does not match the runtime behavior schema,
then the system prevents saving or approval.
```

```txt
Given an administrator approves behavior,
when the behavior is persisted,
then the system creates an immutable behavior version.
```

### Runtime Isolation

```txt
Given approved behavior records exist,
when the current game engine runs,
then the current engine behavior remains unchanged in this phase.
```

## 27. Implementation Notes

The first implementation should prioritize correctness of the backoffice pipeline over perfect automation.

The behavior suggester should be broad enough to inspect the uploaded set and propose useful drafts for many cards, but it should remain conservative. When unsure, it should preserve uncertainty as reviewable draft content.

The approved behavior schema should be designed as if the game engine will eventually consume it, even though the runtime integration is out of scope for the first phase.

## 28. Open Future Work

- Connect approved runtime behavior records to the game engine.
- Replace card-specific runtime switch cases with behavior primitive resolution.
- Add match-time behavior snapshots.
- Add a richer behavior editor UI.
- Add parser coverage reports per set.
- Add behavior parity tests between current hardcoded runtime and approved behavior definitions.
- Add admin authentication and authorization if not already present.
- Add support for user-selected card variants.
