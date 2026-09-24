# Runtime Keyword Annotations and Card Preview Expansion

## Objective

Make runtime changes to a card's abilities immediately understandable to both players without duplicating information that is already printed on the card.

The board card tile must provide a compact representation of **runtime keyword changes**, while the existing card preview must be expanded to explain the complete current runtime information, including granted keywords and granted non-keyword rules text.

This is a presentation and projection change. It must preserve the server-authoritative game model and must not move gameplay evaluation into the client.

---

## Core Product Principle

Use two complementary information layers:

- **Card tile:** answers **"What keywords does this card effectively have right now that differ from its static printed state?"**
- **Card preview:** answers **"What runtime effects are changing this card, where did they come from, and how long do they last?"**

The card tile is intentionally compact.

The card preview remains the detailed explanation surface.

---

# 1. Card Tile Keyword Annotations

## 1.1 Only Runtime Keyword Changes Are Annotated

Do not annotate a keyword simply because the card has that keyword.

If the card's printed rules text already gives it a keyword and its effective value/state has not changed, the physical card already communicates that information and no annotation is required.

Example:

- `Irelia, Fervent` has printed `Deflect`.
- With no additional Deflect effect, show **no Deflect annotation**.
- If she receives `Deflect 2`, her effective keyword becomes `Deflect 3`.
- The tile must then show:

`Deflect 3`

The annotation exists because runtime state changed what the card currently has.

---

## 1.2 Runtime Self-Granted and Conditional Keywords Are Included

A keyword does not need to come from another card to qualify.

If the card's current keyword state depends on a runtime choice, condition, mode, or temporary effect, annotate the effective current keyword.

Example:

`Jayce, Hammer in Hand` becomes ready and the player chooses `Ganking` for this turn.

The tile must show:

`Ganking`

This communicates which runtime choice is currently active.

---

## 1.3 Non-Keyword Rules Text Is Never Added to the Tile

The annotation system is strictly for keywords.

Do not place granted ordinary rules text on the card tile.

Example:

`Relentless Pursuit` gives a unit:

> When I conquer, you may move me to my base.

This text must **not** appear as a tile annotation.

It belongs in the card preview runtime information.

---

# 2. Effective Keyword Values

## 2.1 Show the Effective Total, Not Individual Grants

The tile must represent the card's **effective current keyword value**.

Do not show separate annotations for each contributing effect.

Examples:

### Two Cleaves on a vanilla unit

First Cleave:

`Assault 3`

Second Cleave:

Effective result:

`Assault 6`

Tile:

`Assault 6`

Do not show:

- `Assault 3`
- `Assault 3`

---

### Native keyword plus runtime grant

Printed card:

`Deflect`

Runtime grant:

`Deflect 2`

Effective result:

`Deflect 3`

Tile:

`Deflect 3`

---

### Ornn and Svellsongur

`Ornn, Forge God` has printed `Deflect 2`.

`Svellsongur` copies the attached unit's text while attached.

Expected effective examples:

- Ornn with one Svellsongur: `Deflect 4`
- Ornn with three Svellsongur: `Deflect 8`

The annotation must show the final effective value.

---

## 2.2 Redundant Non-Numeric Keywords

Do not create an annotation if runtime state does not change the card's effective keyword characteristic.

Example:

A card has printed `Tank` and receives another instance of `Tank`.

If the additional instance is functionally redundant and the card remains effectively just `Tank`, do not add a runtime annotation only to report that redundant grant.

---

## 2.3 Removing the Runtime Difference Removes the Annotation

When the runtime modification expires or otherwise stops applying and the card returns to its printed keyword baseline, remove the annotation.

If the same keyword is granted again later, it becomes a new runtime annotation occurrence.

---

# 3. Annotation Ordering

Annotations are ordered by **grant chronology**, not alphabetically and not by an externally maintained keyword catalogue.

This must remain future-proof as new sets and new keywords are released.

Rules:

1. The first keyword that becomes annotation-worthy is shown at the top.
2. Later keyword grants appear below earlier grants.
3. If an existing annotated keyword changes value, keep its current position.
4. Changing `Assault 3` to `Assault 6` must not reorder `Assault`.
5. If an annotation disappears completely and the same keyword is granted again later, treat it as a new occurrence and place it according to the new grant time.
6. If one resolving effect grants multiple different keywords at the same time, use the effect's defined text/resolution order as the tie-breaker.

---

# 4. Number of Visible Annotations

Show a maximum of **three keyword annotations** directly on the card tile.

If more than three annotation-worthy keywords exist, show:

- the first three keyword annotations; and
- a final `+N` overflow indicator.

Example:

```text
Tank
Ganking
Assault 4
+2
```

`+2` means two additional runtime keyword annotations are active.

The complete keyword set remains available in the card preview.

The `+N` indicator is informational only and must not introduce a separate interaction model.

---

# 5. Annotation Placement

Use a vertical stack anchored to the **upper-left area of the card tile**.

This is a new deliberate card-state presentation pattern.

Each badge must:

- begin slightly outside the card's left boundary;
- extend rightward over the card image;
- visibly straddle the card edge;
- remain visually attached to the card;
- not increase the card's layout footprint;
- not push neighboring cards or zones;
- not be clipped by card or zone containers.

The desired geometry is:

```text
        card boundary
            ↓
      ┌─────│──────────────┐
 ┌──────────┐              │
 │  Tank    │              │
 └──────────┘              │
 ┌──────────────┐          │
 │  Assault 6   │          │
 └──────────────┘          │
 ┌───────────┐             │
 │ Ganking   │             │
 └───────────┘             │
      │                    │
      │     CARD ART       │
      │                    │
      └────────────────────┘
```

Use a small negative horizontal offset as the starting point for visual tuning.

A practical initial target is approximately `6–8px` outside the card boundary, but this is not a fixed product pixel contract. Preserve the intended **slightly outside + overlapping the card image** composition.

All annotations in the stack must share the same left anchor.

---

# 6. Keyword Badge Visual Language

## 6.1 Existing Keyword Assets

Existing keyword assets are located at:

`src/features/card-presentation/assets/keywords`

Reuse these assets as the canonical keyword icon source when an icon already exists.

Do not introduce a parallel keyword icon system.

---

## 6.2 Future Keyword Fallback

The card corpus is mutable and expands with new releases.

The UI must not require a bespoke implementation change simply because a new keyword has no local icon asset yet.

For an unknown or newly introduced keyword:

- always preserve the keyword text;
- use a generic keyword icon fallback when no specific asset exists.

The annotation must remain readable even without a keyword-specific icon.

---

## 6.3 Icon + Text

Keyword annotations use:

**icon + text**

Examples:

- `[icon] Tank`
- `[icon] Ganking`
- `[icon] Assault 6`
- `[icon] Deflect 3`

Do not use icon-only annotations.

Text is required for direct readability.

---

## 6.4 Keyword Colors

Create reusable semantic CSS variables:

```css
--riftbound-keyword-background: #1EA289;
--riftbound-keyword-foreground: #ffffff;
```

Use these variables for the keyword badge background and foreground.

The icon and text should use the keyword foreground token unless an existing keyword asset requires a different treatment.

These variables represent the Riftbound keyword visual language and must not be scoped only to one card-tile component.

They should remain reusable by card preview UI and future keyword-related interfaces.

---

# 7. Interaction and Card-State Coexistence

Keyword annotations are informational.

They must not:

- intercept pointer events needed by the card;
- create a new click target;
- interfere with drag-and-drop;
- interfere with card selection;
- interfere with target highlighting;
- interfere with hover/inspection behavior;
- replace existing card-state indicators.

Existing states such as the following remain separate concepts:

- damage;
- exhausted state;
- stunned state;
- selection/target state;
- attached Equipment;
- movement/drag feedback;
- other existing card-state visuals.

The keyword stack must coexist with them without obscuring required information.

---

# 8. Scaling and Animation

The keyword annotation stack belongs visually to the card tile.

It must move and scale with the card during existing board behavior, including where applicable:

- hover;
- drag;
- movement animation;
- card scaling;
- board transitions.

Do not implement it as a screen-fixed board overlay detached from the card.

When keyword state changes, use restrained visual feedback consistent with the existing UI.

Acceptable examples:

- short appearance/disappearance fade;
- subtle scale transition;
- subtle value transition when `Assault 3` becomes `Assault 6`.

Do not introduce a toast or large animation for normal keyword changes.

---

# 9. Card Preview Expansion

## 9.1 Preserve the Existing Preview

Do **not** redesign or replace the current card preview experience.

Preserve:

- its current interaction;
- current structure;
- current placement;
- current card-image treatment;
- existing runtime Might explanation;
- existing visual language.

This work expands the current preview rather than creating a competing runtime-information interface.

---

## 9.2 Runtime Might and New Effects Must Work Together

There is already an implementation that explains runtime Might changes in the card preview.

Keep that behavior.

Extend the same preview experience so the player can also understand:

- runtime keyword grants/changes;
- runtime non-keyword rules text;
- duration where explicitly defined;
- the source of the runtime effect.

Do not create one independent system for Might and another unrelated system for keywords.

---

# 10. Preview Runtime Information Grammar

Each runtime effect entry has up to three semantic pieces:

1. **Effect**
2. **Duration**
3. **Source**

These must use three distinct typographic presentations.

Do not introduce a different font family.

Differentiate them through existing typography capabilities such as:

- font size;
- font weight;
- text tone/opacity.

---

## 10.1 Effect

The effect is the strongest information.

Use:

- strongest text emphasis;
- primary text tone;
- strongest of the three weights;
- larger presentation than metadata.

Examples:

`Assault +4`

`Ganking`

`When I conquer, you may move me to my base.`

---

## 10.2 Duration

Duration is secondary information.

Use:

- smaller presentation than the effect;
- secondary text tone;
- stronger emphasis than the source;
- a medium/intermediate weight.

Example:

`This turn`

---

## 10.3 Source

Source is the quietest of the three information levels.

Use:

- metadata-sized presentation;
- regular/lighter weight;
- more muted tone than the duration.

Examples:

`Blood Rush`

`Relentless Pursuit`

`Jayce, Hammer in Hand`

`Svellsongur`

---

## 10.4 Metadata Line

When duration exists:

```text
Effect
Duration · Source
```

Example:

```text
When I conquer, you may move me to my base.
This turn · Relentless Pursuit
```

Typography must still distinguish all three parts:

- effect = strongest;
- `This turn` = secondary;
- `Relentless Pursuit` = most muted;
- separator `·` = muted metadata treatment.

---

When an effect has **no explicitly stated duration**, do not invent a duration label.

Do not display:

- `Permanent`
- `Forever`
- `Indefinite`
- `Until zone change`

Instead show:

```text
Effect
Source
```

Example:

```text
Assault +4
Blood Rush
```

---

# 11. Preview Keyword Values vs Tile Keyword Values

The tile and preview answer different questions.

## Tile

Show the **effective final keyword value**.

Example:

A unit has printed `Assault 1` and receives two `Assault 2` grants.

Tile:

`Assault 5`

---

## Preview

Explain the **runtime contribution**.

For the same example:

```text
Assault +4
Blood Rush
```

The printed card already communicates the native `Assault 1`.

The preview explains the additional runtime change.

---

Another example:

Irelia has printed `Deflect` and receives `Deflect 2`.

Tile:

`Deflect 3`

Preview runtime entry:

```text
Deflect +2
<source>
```

---

For non-numeric keywords, do not invent numeric notation.

Example:

```text
Ganking
This turn · Jayce, Hammer in Hand
```

---

# 12. Preview-Only Non-Keyword Rules Text

Granted rules text must be visible in the preview even though it is not a tile annotation.

Example:

After `Relentless Pursuit` grants:

> When I conquer, you may move me to my base.

The preview must show:

```text
When I conquer, you may move me to my base.
This turn · Relentless Pursuit
```

The first line is the granted effect.

The second line communicates duration and source.

---

# 13. Multiple Runtime Sources

The tile always resolves multiple contributing sources into the effective keyword state.

The preview must retain enough information to explain the runtime contributions and their sources.

Do not lose source provenance merely because the tile displays one aggregated keyword.

The preview may group repeated contributions from the same source for readability as long as:

- the total runtime contribution remains correct;
- the source remains identifiable;
- the resulting information does not imply an incorrect keyword value or duration.

Do not expose engine-internal IDs or implementation metadata to players.

---

# 14. Server-Authoritative Requirement

The client must **not** determine effective keyword state by:

- parsing card rules text;
- counting played Cleaves;
- examining attached Equipment and deriving copied text;
- reproducing stacking rules;
- calculating Deflect/Assault/Shield totals independently;
- inferring effect expiration.

The server-authoritative game state and viewer projection remain the source of truth.

The projection must provide enough viewer-safe information for the UI to render:

- current effective keyword state;
- which keyword states differ from the printed baseline;
- runtime contribution information needed by the preview;
- source information;
- explicit duration information where applicable;
- ordering information needed to preserve first-granted → last-granted presentation.

Extend the existing projection/runtime-information model where possible, especially the path already used by the current Might explanation.

Do not introduce card-name-specific UI rules.

---

# 15. Privacy

All information shown by these annotations must follow the existing viewer-safe projection boundary.

Do not expose private or secret information merely to explain a runtime effect.

For public board objects, current runtime state must remain visible to both players as permitted by the game rules.

---

# 16. Scope Boundaries

## In Scope

- Runtime keyword annotations on card tiles.
- Effective keyword aggregation.
- Three-visible-keyword + `+N` overflow.
- Grant-time annotation ordering.
- Keyword icon reuse and generic fallback.
- Reusable keyword CSS color tokens.
- Upper-left overlapping card-edge placement.
- Expansion of the existing card preview.
- Coexistence with the existing Might explanation.
- Effect/duration/source typographic hierarchy.
- Preview-only display of granted non-keyword rules text.
- Required server projection/runtime metadata.

## Out of Scope

- Redesigning the card preview.
- Annotating every keyword printed on every card.
- Adding non-keyword rules text to the card tile.
- Replacing existing damage, stun, exhausted, selection, Equipment, or drag presentations.
- Reworking card-game rules or keyword semantics.
- Client-side gameplay calculations.
- Maintaining a hardcoded official keyword ordering list.
- Adding card-name-specific special cases.

---

# 17. Reference Scenarios

## Scenario A — Native Keyword Only

Given `Irelia, Fervent` has printed `Deflect`

When no runtime effect changes Deflect

Then no Deflect annotation is shown on the tile.

---

## Scenario B — Native + Runtime Numeric Keyword

Given Irelia has printed `Deflect`

When she gains `Deflect 2`

Then the tile shows:

`Deflect 3`

And the preview explains the runtime `Deflect +2` contribution and its source.

---

## Scenario C — Multiple Numeric Grants

Given a vanilla unit has no Assault

When two Cleave effects each give `Assault 3`

Then the tile shows:

`Assault 6`

And it does not show two separate `Assault 3` annotations.

---

## Scenario D — Copied Keyword Text

Given `Ornn, Forge God` has printed `Deflect 2`

When one attached Svellsongur causes the copied text to create another `Deflect 2`

Then the tile shows:

`Deflect 4`

When three Svellsongur produce the corresponding effective state

Then the tile shows:

`Deflect 8`.

---

## Scenario E — Self-Granted Temporary Keyword

Given Jayce becomes ready

When the player chooses `Ganking`

Then the tile shows:

`Ganking`

And the preview shows:

```text
Ganking
This turn · Jayce, Hammer in Hand
```

When the effect expires

Then the tile annotation is removed.

---

## Scenario F — Granted Non-Keyword Rules Text

Given Relentless Pursuit grants:

`When I conquer, you may move me to my base.`

Then this text is not shown as a tile annotation

And the preview shows:

```text
When I conquer, you may move me to my base.
This turn · Relentless Pursuit
```

---

## Scenario G — No Explicit Duration

Given Blood Rush grants Assault without explicitly stating a duration

When the effective runtime contribution is `Assault +4`

Then the preview shows:

```text
Assault +4
Blood Rush
```

And it does not display an invented duration label.

---

## Scenario H — More Than Three Runtime Keywords

Given a card has five annotation-worthy runtime keywords

Then the tile shows the first three according to grant order

And displays:

`+2`

And the preview exposes the complete runtime keyword information.

---

## Scenario I — Value Changes Without Reordering

Given `Assault 3` is currently the first annotation

And `Ganking` is the second annotation

When another effect changes the effective Assault value to `Assault 6`

Then the order remains:

1. `Assault 6`
2. `Ganking`

The Assault value changes in place.

---

# 18. UI Regression Validation

Manually validate the annotation treatment with:

- ordinary ready cards;
- exhausted cards;
- damaged cards;
- stunned cards;
- target-selection states;
- selected cards;
- attached Equipment;
- multiple attached Equipment;
- card hover;
- card drag;
- card movement animations;
- cards at the left edge of Base/Battlefield containers;
- densely spaced cards;
- one keyword;
- three keywords;
- more than three keywords;
- changing numeric keyword values;
- annotation removal when effects expire;
- preview with existing Might explanation only;
- preview with Might + keyword effects;
- preview with Might + granted rules text;
- preview with duration + source;
- preview with source but no duration.

The negative-left overlap must not be clipped in any board location.

---

# 19. Technical Constraints

Preserve the existing Hextech architecture:

- gameplay legality and effect resolution remain server-owned;
- the viewer projection remains the UI source of truth;
- `CardTile` remains a presentation component rather than a rules engine;
- reuse existing card-presentation keyword assets;
- extend the existing card preview implementation rather than replacing it;
- do not add card-name-specific gameplay or presentation branches;
- preserve current drag/drop and action interaction behavior.

Use focused deterministic automated coverage for stable projection/model derivation where appropriate.

Do not add broad UI snapshot coverage merely to encode temporary component structure.

---

# 20. Completion Criteria

This change is complete when:

1. Runtime keyword differences are visible directly on board card tiles.
2. Printed unchanged keywords are not redundantly annotated.
3. Numeric keyword annotations show effective totals.
4. Multiple grants aggregate into one tile annotation.
5. Self-granted runtime keyword choices are represented.
6. At most three keyword annotations plus `+N` are shown.
7. Annotation ordering follows first-granted → last-granted chronology.
8. Keyword badges use the shared Riftbound keyword colors.
9. Existing keyword assets are reused with a future-safe fallback.
10. Badge placement straddles the upper-left card boundary without affecting layout or interaction.
11. Existing preview behavior and Might explanations remain intact.
12. The preview explains runtime keyword contributions.
13. The preview displays granted non-keyword rules text.
14. Effect, duration, and source use three distinct typographic presentations.
15. Effects without an explicit duration do not receive an invented duration label.
16. All displayed runtime information comes from the authoritative viewer projection rather than client-side rules calculation.
17. The behavior is manually validated against the regression scenarios above.
