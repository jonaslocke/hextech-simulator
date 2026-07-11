# Sideboarding UI Refinement Plan

## Objective

Refine the current sideboarding experience so it behaves like a flexible deck-editing workspace, communicates legality clearly, uses the simulator's existing visual language, and fits more useful information within the viewport without sacrificing card readability.

This refinement does not change BO3 match orchestration or Battlefield setup behavior. It focuses only on the sideboarding interface and the client-side draft experience.

---

## 1. Allow Temporarily Illegal Sideboarding Drafts

### Current problem

When the active deck already contains the required 40 cards, the interface prevents the player from moving a card from the Main Deck into the Sideboard.

This forces the player to perform swaps in a specific order and can make a normal one-for-one change impossible or unintuitive.

For example:

- Active deck: `40/40`
- Main Deck: `39`
- Chosen Champion: `1`
- Sideboard: `8/8`

The player should still be able to move a Main Deck card to the Sideboard, even though the temporary state becomes:

- Active deck: `39/40`
- Sideboard: `9/8`

The next action may then restore legality by moving a Sideboard card into the Main Deck.

### Direction

The sideboarding draft must allow temporarily illegal states.

Draft mutations should preserve only structural invariants:

- Every registered card instance exists in exactly one valid draft location.
- No card is duplicated.
- No card is lost.
- The Legend, Rune Deck, and Battlefields remain immutable.
- The Chosen Champion slot always contains exactly one card.

The editor must not block changes because of temporary legality problems such as:

- Main Deck below or above the required size.
- Sideboard above its legal capacity.
- Temporary copy-limit violations.
- Temporary Signature-card violations.
- Temporary Chosen Champion or Domain-identity violations.

The deck-validation API should report legality after each mutation. Submission remains unavailable until the final draft is legal.

### Requirement

> Left-clicking a card moves one registered copy between the Main Deck and Sideboard unless the card is immutable or unavailable. The interface must allow temporarily illegal counts and configurations while editing. It must not automatically remove another card, revert the action, or require swaps to be performed in a particular order. Final legality is enforced only when enabling submission.

---

## 2. Replace the Rune Summary with Rune Card Faces

### Current problem

The Rune Deck panel currently uses a text-heavy explanation that the twelve Runes are fixed. Although correct, it occupies valuable space and does not show the Rune composition players need when evaluating a possible Chosen Champion.

### Direction

Replace the textual summary with a compact, read-only visual composition.

Display one entry for each Rune type present in the registered Rune Deck:

```text
RUNES

[Calm Rune card face] ×5
[Body Rune card face] ×7
```

Each entry should:

- Use the existing Rune card face.
- Show the registered quantity.
- Remain non-interactive.
- Preserve the Rune card aspect ratio.
- Be compact enough to fit naturally in the persistent deck-information region.

A subtle lock icon or tooltip may communicate that the Rune Deck cannot be changed during sideboarding, but the explanatory paragraph should be removed.

### Requirement

> Replace the textual fixed-Rune summary with a read-only Rune composition. Display one visual entry using the card face for each Rune type, including its quantity. Use the existing Rune card face rather than text-only descriptions.

---

## 3. Prevent Invalid Chosen Champion Selections

### Current problem

The interface allows the player to set an invalid Champion as the Chosen Champion and only reports the problem afterward through deck validation.

For example, a Garen Champion can currently be selected for a Lux Champion Legend even though it does not match the required Champion tag.

### Direction

Separate Chosen Champion eligibility from full-deck legality.

The `Set as Chosen Champion` action should only be interactive when the candidate satisfies the fixed eligibility requirements:

1. The card is a Unit.
2. The card is a Champion Unit.
3. The card has the Champion tag required by the Champion Legend.
4. The card is compatible with the fixed Rune Deck.
5. The registered copy currently exists in the Main Deck or Sideboard.

The candidate does not need the entire draft to be legal. A player must still be able to choose a valid Champion while card counts or other deck constraints are temporarily invalid.

After the selection, the complete draft still passes through the deck-validation API for:

- Main Deck size.
- Sideboard size.
- Copy limits.
- Signature-card rules.
- Domain identity.
- Chosen Champion legality.
- Other deckbuilding rules.

### Ownership

The UI must not duplicate Champion-tag or Rune-compatibility rules.

Prefer one of these contracts:

- The sideboarding input includes `eligibleChosenChampionRegisteredCardIds`.
- The deck-validation response includes candidate-specific Champion eligibility.
- A dedicated deck-validation operation checks whether a card can become the Chosen Champion.

The server must independently validate the final deck-reconfiguration intent.

### Presentation

- Eligible Champion: show an active `Set as Chosen Champion` control.
- Current Chosen Champion: show a selected or filled crown state.
- Ineligible Champion Unit: hide the action or show it disabled with a tooltip explaining why it is unavailable.

### Requirement

> Only cards that are legally eligible for the current Champion Legend and fixed Rune Deck may expose an active `Set as Chosen Champion` action. Full draft legality remains a separate validation concern.

---

## 4. Make the Chosen Champion Action Explicit

### Current problem

The crown icon is not self-explanatory and is easy to miss, especially for players using sideboarding for the first time.

### Direction

Use the same semantic control across all view modes.

- Tooltip: `Set as Chosen Champion`
- Accessible label: `Set {card name} as Chosen Champion`
- Current Champion tooltip: `Current Chosen Champion`
- Use the existing Tooltip primitive.
- Preserve normal left-click for moving a card between Main Deck and Sideboard.
- Keep the crown as a distinct secondary action.

Use the correct wording consistently:

- `Chosen Champion`
- Never `Choosen Champion`

### Requirement

> Every Chosen Champion control must include a tooltip and accessible label that clearly communicates its purpose. The control must remain separate from the card's normal move action.

---

## 5. Prevent the Changed-State Label from Shifting the Card

### Current problem

Changing the section label from `Chosen Champion` to `Chosen Champion Changed` increases the header height and moves the card downward.

This breaks alignment across the persistent deck-information region.

### Direction

Keep the section title and draft status separate.

Use a stable section header:

```text
CHOSEN CHAMPION
```

Represent the modified state using a compact badge:

```text
CHOSEN CHAMPION   [Changed]
```

The badge may also be positioned over the card container, provided it does not affect layout.

The card's position, dimensions, and top alignment must remain identical before and after changing the Champion.

### Requirement

> The Chosen Champion section must reserve a stable header height. Changing the Champion may add a compact `Changed` badge, but it must not alter the card's position or the height of the persistent identity region.

---

## 6. Use Game Assets in Compact Card Rows

### Current problem

Compact rows represent game concepts such as Energy and Domain using plain text:

```text
Spell / 3 energy / Order
```

This does not match the visual language already used throughout the simulator and makes rows slower to scan.

### Direction

Reuse existing game-presentation assets and components.

Preferred metadata presentation:

```text
Spell   [Energy icon] 3   [Order icon]
```

Support the relevant metadata for each card:

- Card type.
- Energy value.
- Power cost symbols.
- One or more Domain icons.
- Champion indicator.
- Signature indicator when useful.

Multiple-Domain cards must show each Domain icon separately rather than a combined text value such as `Mind/Order`.

Text labels or tooltips should remain available so the information is not communicated by color or imagery alone.

The metadata renderer should be shared by compact rows and any grouped-card captions.

### Requirement

> Compact card rows must use the simulator's existing resource and Domain assets for game metadata. Plain-text Domain names and phrases such as `3 energy` should be replaced by the corresponding visual notation while retaining accessible labels.

---

## 7. Move the View Controls Closer to the Card Listings

### Current problem

The view-mode controls are visually detached from the card collection they modify.

This weakens hierarchy and makes the controls appear to affect the entire sideboarding screen rather than only the Main Deck and Sideboard workspace.

### Direction

Add an editor toolbar directly above the card collections:

```text
Cards                                Sort: Energy   [List] [Grouped] [All cards]
```

The toolbar should:

- Belong visually to the deck-editing workspace.
- Sit immediately above the Main Deck and Sideboard sections.
- Remain sticky while card lists scroll.
- Contain view mode, sorting, and future filtering controls.
- Stay separate from match context, score, chooser information, and readiness status.

The persistent Legend, Chosen Champion, Battlefield, and Rune region must remain unchanged when switching views.

### Requirement

> Place the view-mode control inside the card-editing workspace, immediately above the Main Deck and Sideboard listings. The control must be visually associated with the content it changes.

---

## 8. Make the Chosen Champion Action Visible in Card Views

### Current problem

The crown action is almost unnoticeable in the card-grid presentation because it blends into the artwork and has insufficient contrast.

### Direction

Eligible Champion cards should show a persistent action overlay:

- Visible without hover.
- High-contrast circular or rounded-square background.
- Consistent placement on every card.
- Approximately 32–36 px interaction target.
- Border or shadow that separates the action from light and dark artwork.
- Tooltip and accessible label.
- Filled or selected visual state for the current Chosen Champion.

Clicking the card itself continues to move one copy between Main Deck and Sideboard. Clicking the crown sets that card as the Chosen Champion.

The same control component should be reused across grouped-card and individual-card views.

### Requirement

> The `Set as Chosen Champion` control must remain clearly visible over card artwork in every card-based view. It must not depend on hover to become discoverable.

---

## 9. Add an Individual-Copy Card View

### Objective

Add a third presentation mode where every registered card copy appears individually.

This mode should resemble a physical deck laid out as card faces and should make copy-level movement obvious.

### View modes

#### List

One row per unique card name, with a quantity.

Best for:

- Fast scanning.
- Reading names and metadata.
- Compact deck editing.

#### Grouped

One card face per unique card name, with a quantity badge.

Best for:

- Visual recognition.
- Moderate density.
- Working with larger decks.

#### All cards

One card face per registered copy.

A three-copy card appears three times with no grouped quantity badge.

Best for:

- Understanding the complete deck visually.
- Moving individual copies directly.
- Matching physical-deck and deck-builder expectations.

Recommended labels:

```text
List | Grouped | All cards
```

### Interaction

In `All cards` mode:

- Left-clicking a card moves exactly that registered copy.
- Main Deck and Sideboard remain separate.
- Duplicate copies stay adjacent after sorting.
- Existing sort order applies to individual copies.
- Hover or keyboard focus updates card inspection.
- Eligible Champion copies show the persistent crown action.
- The current Chosen Champion remains in its dedicated persistent slot.
- Additional copies of the same printed Champion may still appear in Main Deck or Sideboard.

### Inspector behavior

Because every card face is already visible, the large persistent inspector may consume too much space.

In `All cards` mode, either:

- Collapse the inspector automatically; or
- Reduce it to an optional narrow preview.

A full-size inspection overlay may remain available for reading card text.

### Layout

- Use responsive card widths.
- Keep card faces readable at common desktop resolutions.
- Give the Main Deck more width than the Sideboard.
- Keep section counts visible while scrolling.
- Preserve the selected view for the current sideboarding session.
- Optionally remember the view locally between sessions.

### Requirement

> Add an `All cards` view in which every registered Main Deck and Sideboard copy is rendered as an individual card face. Clicking a card moves one copy. The mode must coexist with the existing List and Grouped views and use the same draft-mutation model.

---

## 10. Reduce the Overall UI Scale

### Current problem

The current sideboarding screen uses oversized cards, panels, spacing, controls, and typography.

This reduces how much deck information fits in the viewport and makes the experience feel closer to a presentation screen than a deck-editing workspace.

The goal is not to make the interface miniature or dense. Card faces, names, metadata, quantities, and actions must remain comfortably readable.

### Direction

Reduce the overall spatial scale by approximately 15%, targeting about 85% of the current visual size.

Apply the reduction consistently to:

- Legend and Chosen Champion cards.
- Battlefield cards.
- Rune card entries.
- Main Deck and Sideboard card rows.
- Grouped-card grids.
- All-cards grids.
- Card inspector.
- Panel padding.
- Gaps between sections.
- Toolbar and footer height.
- Buttons, badges, counters, and icon controls.
- Oversized headings and supporting text.

Preserve:

- Card aspect ratios.
- Readable card names and metadata.
- Clear quantity badges.
- Comfortable pointer targets.
- Visible Chosen Champion controls.
- Enough card-face size to recognize artwork and read important printed information.
- Strong distinction between primary and secondary information.

### Implementation guidance

Do not use a global CSS transform such as:

```css
transform: scale(0.85);
```

Global scaling would create incorrect layout dimensions, blurry content, and unreliable pointer targets.

Reduce the underlying component dimensions and spacing values instead.

Examples:

```text
Current card width: 160px → approximately 136px
Current section gap: 24px → approximately 20px
Current panel padding: 20px → approximately 16–17px
Current large control height: 40px → approximately 34–36px
```

Typography should be reduced more conservatively than containers. Small body text, card metadata, and action labels should not fall below a comfortable readable size.

### Requirement

> Reduce the overall sideboarding interface scale by approximately 15%. Cards, panels, spacing, controls, and oversized typography should become more compact so more deck information fits within the viewport. Card faces and important metadata must remain readable, controls must remain easy to target, and card aspect ratios must be preserved. Implement the reduction through component dimensions and spacing values rather than global CSS scaling.

---

## Additional Refinement: Clarify Deck Counts

### Current problem

The footer currently displays values such as:

```text
40/40
Main 39/39
Sideboard 8/8
```

Although technically consistent because the Chosen Champion counts as the fortieth active card, the relationship is not immediately obvious.

### Direction

Use explicit labels:

```text
Active deck 40/40
Main Deck 39
Chosen Champion 1
Sideboard 8/8
```

During an illegal draft:

```text
Active deck 39/40
Main Deck 38
Chosen Champion 1
Sideboard 9/8
```

Invalid counts should use the validation-warning treatment but must not prevent further editing.

### Requirement

> Present Active Deck, Main Deck, Chosen Champion, and Sideboard counts as separate labeled values. Invalid counts must be visually clear without blocking draft mutations.

---

## Architecture Boundaries

The corrective implementation should preserve these ownership boundaries:

```text
Sideboarding draft
  Owns reversible client-side card placement
  Allows temporarily illegal configurations
  Preserves registered-card identity and card conservation

Deck-validation API
  Owns deck legality and structured failure reasons
  Determines whether submission is enabled
  Supplies or supports Chosen Champion eligibility

Sideboarding presentation
  Offers List, Grouped, and All cards modes
  Uses shared game metadata and card assets
  Keeps semantic actions consistent across every mode

BO3 orchestration
  Supplies the sideboarding session and match context
  Receives the committed deck-reconfiguration intent
  Remains outside this UI refinement scope
```

The sideboarding feature must not:

- Reimplement deckbuilding rules in React components.
- Infer Champion eligibility from card names.
- Mutate server state while the user is editing.
- Submit intermediate draft changes.
- Own Battlefield setup decisions.
- Change the registered Rune Deck.
- Apply global visual scaling through CSS transforms.

---

## Priority Order

Implement the corrections in this order:

1. Temporarily illegal draft support.
2. Chosen Champion candidate eligibility.
3. Consistent Chosen Champion action semantics.
4. Shared metadata rendering with game assets.
5. Rune card-face composition.
6. Editor toolbar hierarchy.
7. Stable persistent-header layout.
8. Overall 15% scale reduction.
9. Individual-copy `All cards` view.
10. Count presentation refinement.

The draft mutation model and Chosen Champion eligibility are foundational. All view modes must dispatch the same semantic draft operations and consume the same validation results.

---

## Manual Acceptance Scenarios

Acceptance is based on manual verification.

### Draft editing

- Start from a legal `40/40` active deck and `8/8` Sideboard.
- Move one Main Deck card into the Sideboard.
- Confirm the draft becomes temporarily illegal instead of blocking the action.
- Move one Sideboard card into the Main Deck.
- Confirm legality is restored.
- Confirm no card is duplicated or lost.

### Chosen Champion

- Confirm only Champions matching the current Legend and fixed Rune Deck expose an active Champion action.
- Confirm an invalid Champion cannot be selected.
- Confirm selecting a valid Champion updates the dedicated Chosen Champion slot.
- Confirm the previous Chosen Champion moves into the intended Main Deck or Sideboard location.
- Confirm the `Changed` indicator does not move the card.
- Confirm the crown action has a tooltip and accessible label.

### Rune Deck

- Confirm each Rune type appears as its existing card face.
- Confirm each Rune entry shows the correct quantity.
- Confirm Rune entries are read-only.
- Confirm the previous explanatory paragraph is removed.

### View modes

- Confirm `List`, `Grouped`, and `All cards` are located directly above the card listings.
- Confirm switching views does not move the Legend, Chosen Champion, Battlefield, or Rune sections.
- Confirm the same card mutation behaves consistently in every mode.
- Confirm the Champion action remains visible in Grouped and All cards views.
- Confirm `All cards` renders every registered copy individually.

### Scale and readability

- Confirm the interface is approximately 15% more compact.
- Confirm more cards fit within the viewport.
- Confirm card faces remain readable.
- Confirm card names, metadata, and quantities remain legible.
- Confirm buttons and Champion controls remain easy to click.
- Confirm no global CSS transform is used.

### Counts and validation

- Confirm Active Deck, Main Deck, Chosen Champion, and Sideboard counts are clearly labeled.
- Confirm illegal counts show a warning state.
- Confirm invalid counts do not block further editing.
- Confirm submission remains unavailable until the deck-validation API returns a legal result.
