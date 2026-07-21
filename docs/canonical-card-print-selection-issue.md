# Issue: Make canonical card-print selection deterministic

## Problem

**Miss Fortune, Buccaneer** is rendered with its alternate-art image instead of its canonical standard printing.

The card corpus contains two representations of the same gameplay card:

| Printing | Presentation | Canonical default |
|---|---|---:|
| `OGN-193/298` | Standard printing | Yes |
| `OGN-193a/298` | Alternate art | No |

The canonical representation is:

```json
{
  "riftbound_id": "ogn-193-298",
  "public_code": "OGN-193/298",
  "collector_number": 193,
  "metadata": {
    "clean_name": "Miss Fortune Buccaneer",
    "alternate_art": false,
    "overnumbered": false,
    "signature": false
  }
}
```

Canonical image URL:

```text
https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/e6ff9ad3d6e2b96ff76cda4c7bc75415c1cdcced-744x1039.png
```

The image currently displayed belongs to `OGN-193a/298`, whose `metadata.alternate_art` value is `true`.

## Evidence from the captured match

The deck entry is correctly identified by the base gameplay code:

```text
cardCode: OGN-193
```

However, the deck snapshot stored the alternate printing:

```text
card.riftbound_id: ogn-193a-298
card.public_code: OGN-193a/298
card.metadata.alternate_art: true
```

This means the wrong presentation was selected before the client rendered the card. The likely failure point is in corpus normalization, canonical catalog publication, card-code resolution, or deck-snapshot creation.

The client appears to be rendering the image provided by the stored card definition.

## Expected behavior

A base gameplay card code such as `OGN-193` must always resolve to the canonical standard printing.

The result must not depend on:

- The ordering of entries in the source JSON.
- Which printing is imported or processed last.
- The presence of alternate-art, overnumbered, or signature-print variants.
- The ingestion or match-creation path used to resolve the card.
- Silent overwriting caused by multiple printings sharing the same normalized gameplay identity.

For Miss Fortune, `OGN-193` must resolve to `OGN-193/298`, never to `OGN-193a/298`.

## Canonical-print selection policy

When multiple corpus entries represent the same gameplay card, determine the canonical default presentation through one shared, deterministic selector.

### Priority 1: Exclude presentation variants

Prefer candidates where all presentation flags are false:

```text
metadata.alternate_art === false
metadata.overnumbered === false
metadata.signature === false
```

A candidate with any of these flags set to `true` must not become the default while a standard candidate exists.

### Priority 2: Prefer the lowest collector number

Among eligible standard candidates, select the entry with the lowest numeric `collector_number`.

This ensures that a normal in-set printing is preferred over later showcase or overnumbered presentations.

### Priority 3: Prefer the unsuffixed collector code

When candidates share the same `collector_number`, prefer the unsuffixed code:

- Prefer `193` over `193a`.
- Prefer a code without `*`.
- Prefer the exact base public code, such as `OGN-193/298`.
- Prefer the exact base `riftbound_id`, such as `ogn-193-298`.

### Priority 4: Use a stable final tie-breaker

If candidates remain equivalent, use a stable deterministic comparison, such as normalized `public_code` followed by `riftbound_id`.

Source-array order must never decide the canonical result.

### Ambiguous or invalid groups

When no unambiguous standard printing exists:

- Do not silently select an alternate-art, overnumbered, or signature-print entry.
- Mark the group as unresolved.
- Surface the conflict for explicit catalog review.
- Do not automatically publish the group as canonical.

## Important terminology

`metadata.signature` is a **presentation/printing flag**.

It must not be confused with:

```text
classification.supertype: "Signature"
```

The classification value is a gameplay characteristic. It must not cause a normal printing of a Signature card to be rejected.

## Required implementation work

1. Trace the complete resolution path from `data/sets/*.json` through canonical publication and deck-snapshot creation.
2. Identify where `OGN-193a/298` displaced `OGN-193/298`.
3. Implement one shared canonical-print selector rather than duplicating selection logic across ingestion, catalog, deck parsing, and match creation.
4. Ensure duplicate normalized identities are collected and ranked rather than silently overwritten.
5. Apply the selector to all current and future card sets.
6. Repair or republish the current canonical record for `OGN-193`.
7. Rebuild development catalog data and any validation deck snapshots that preserve the incorrect card definition.
8. Create a new match and verify that the corrected snapshot contains the standard printing.

## Implementation constraints

The fix must be generic.

Do not solve this through:

- A Miss Fortune-specific exception.
- A hardcoded image replacement.
- A client-side image override.
- A special case for `OGN-193`.
- Reliance on the current order of entries in `ogn.json`.
- A card-name-specific branch in the game engine.
- Automatic publication of an unresolved canonical group.

The card image must come from the selected canonical card definition, not from separate UI-specific logic.

## Acceptance criteria

- [ ] `OGN-193` resolves to `riftbound_id: "ogn-193-298"`.
- [ ] Its projected `public_code` is `OGN-193/298`.
- [ ] Its selected metadata has `alternate_art`, `overnumbered`, and `signature` all set to `false`.
- [ ] Its selected image is the canonical `e6ff9ad3...` image.
- [ ] `OGN-193a/298` remains available in the source corpus but is not the canonical default.
- [ ] `OGN-193a/298` cannot overwrite the canonical `OGN-193` definition.
- [ ] Reversing or randomizing the order of the two Miss Fortune entries produces the same result.
- [ ] Duplicate normalized identities cannot silently overwrite one another.
- [ ] Canonical groups that cannot be resolved deterministically are blocked from automatic publication.
- [ ] The same selector is used by catalog ingestion/publication and card-code resolution.
- [ ] Deck-snapshot creation stores the already-selected canonical definition.
- [ ] New matches display the standard Miss Fortune artwork in the hand, board, previews, temporary zones, and card inspector.
- [ ] Existing gameplay behavior for Miss Fortune is unchanged.

## Regression coverage

Validate the policy with at least these cases:

### Same collector number with an alternate-art suffix

```text
OGN-193/298
OGN-193a/298
```

Expected: `OGN-193/298`.

### Spiritforged alternate art

```text
SFD-143/221
SFD-143a/221
```

Expected: `SFD-143/221`.

### Standard printing versus overnumbered and signature-print variants

Use a group such as **Swift Scout**, where the corpus includes a normal in-set printing and later showcase variants.

Expected: the standard, non-overnumbered, non-signature presentation with the lowest collector number.

### Corpus-order independence

Run the selector with variant entries:

- Before the canonical entry.
- After the canonical entry.
- In randomized order.

Expected: the selected canonical printing is identical in every run.

### Duplicate-key protection

Provide two entries that normalize to the same gameplay card key.

Expected: they are grouped and ranked explicitly; no last-write-wins overwrite occurs.

## Manual validation

1. Rebuild or republish the canonical card catalog.
2. Create a new match using a deck containing **Miss Fortune, Buccaneer**.
3. Inspect the stored deck snapshot.
4. Confirm that `cardCode: "OGN-193"` contains:
   - `riftbound_id: "ogn-193-298"`
   - `public_code: "OGN-193/298"`
   - `metadata.alternate_art: false`
5. Draw or play the card.
6. Confirm that the canonical artwork appears consistently across all presentation surfaces.

## Out of scope

Explicit player selection of alternate artwork is not part of this issue.

This issue only guarantees that normal gameplay card codes use the canonical standard presentation by default.
